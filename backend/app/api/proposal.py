"""履修提案の生成(SSE)。design.md §6.1 / §7.2。

`POST /api/proposal` は学生プロファイルと課程・入学年度を本文で受け、
`build_proposal_agent()`(§7.2)に提案の**下書き**(シラバスコードと理由だけ)を
書かせ、backend が候補一覧から科目名・曜日・時限・単位を補った `TimetableProposal` を
**組み立て途中の状態から逐次** SSE で配信する。イベントは3種類:

- `{"snapshot": <組み立て途中の TimetableProposal>}` — 生成中に何度も流れる。
  §7.2 の「時間割表を逐次描画」に対応する
- `{"result": <完成した TimetableProposal>}` — 確定版。1度だけ流れる。同じ科目・
  コマ重複・登録できる単位の上限を超えた分は backend が外し、外した旨を
  記録する(作り直しはさせない。§7.2)。出力の上限などで生成が途中で切れた場合も、
  書き終えた科目が1つでもあればそこまでで確定版にする。**外した科目・打ち切りの
  記録は summary に混ぜず、同じイベントの `adjustments`(文字列の配列)に載せる。**
  frontend はこれを読まず、学生には見せない(確認用のスクリプトが表示する)
- `{"done": true}` — 終端。エラー時も必ず最後に流れる

`snapshot` と `result` はどちらも `app/schemas/proposal.py` のスキーマの形
(camelCase)で出す。`snapshot` は未到達のフィールドが `null` になるだけで、
キーの構成は `result` と同じであり、クライアントは同じ描画コードで扱える。

**ストリームは `run_stream_events()` で読む。** `run_stream()` は出力型に合致する
最初の出力で実行グラフを打ち切るため、本文に先立って空白だけの TextPart を出す
モデル(Qwen3.6 + reasoning パーサ)では、提案が組み上がる前に切れる
(`app/api/chat_syllabus.py` と同じ理由。PR #43 で判明)。

**学生データを永続化・ログ記録しない(§4.2.3)。** 本モジュールは logging を持たず、
リクエスト本文も応答内容も出力しない。
"""

import asyncio
import json

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from pydantic_core import from_json
from pydantic_ai import AgentRunResultEvent
from pydantic_ai.messages import (
    FinalResultEvent,
    ModelResponsePart,
    ModelResponsePartDelta,
    PartDeltaEvent,
    PartStartEvent,
    TextPart,
    TextPartDelta,
    ToolCallPart,
    ToolCallPartDelta,
)

from app.agents.proposal_agent import (
    ProposalContext,
    ProposalError,
    assemble_courses,
    assemble_proposal,
    rewrite_summary,
    build_proposal_agent,
    build_proposal_context,
)
from app.api.sse import format_sse, sse_response
from app.curricula.loader import get_curricula
from app.schemas.proposal import TargetTerm
from app.schemas.student import StudentProfile


class _CamelModel(BaseModel):
    """リクエストモデルの基底。JSON は camelCase で受ける(§6.1)。"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ProposalRequest(_CamelModel):
    """`POST /api/proposal` のリクエスト(§6.1)。

    課程コードと入学年度を `studentProfile` とは別に受ける。履修要項を引くキーは
    (課程コード, 入学年度)(§4.4.2)だが、`StudentProfile.program` に入るのは
    成績表から採れる**課程名**(「知能情報メディア課程」)であり、課程は改称され得る
    ため識別子には使えない(§4.4.2)。入学年度もプロファイルには無く、frontend が
    学年から算出して送る。
    """

    student_profile: StudentProfile
    program_code: str
    admission_year: int
    preferences: str | None = None
    # 提案する学期(次に登録する学期。§7.2)。frontend は常に送る。省略すると候補に
    # 前期・後期のクラスが混ざり、学期の混ざった提案になり得る(旧い呼び出しの互換)
    target_term: TargetTerm | None = None


# --- 組み立て途中の提案(snapshot)---
#
# モデルが書くのは下書き(シラバスコードと理由だけ。`proposal_draft_model()`)であり、
# 科目名・曜日・時限・単位は backend が候補一覧から補う(`assemble_courses()`)。
# snapshot も確定版と同じ組み上げを通すので、途中経過と確定版で科目の値が食い違わない。
#
# 途中の JSON は `from_json(allow_partial=True)` で読む。末尾の書きかけの文字列は
# 読み捨てられるため、理由(reason)まで書き終えた科目だけが載る。


def _parse_draft(buffer: str) -> tuple[list[tuple[str, str]], str | None] | None:
    """書きかけの下書きから、書き終えた科目(コード, 理由)と summary を取り出す。

    まだ JSON として読めない断片では None を返す。
    """
    try:
        data = from_json(buffer, allow_partial=True)
    except ValueError:
        return None
    if not isinstance(data, dict):
        return None
    drafts: list[tuple[str, str]] = []
    for item in data.get("courses") or []:
        if not isinstance(item, dict):
            continue
        code = item.get("syllabusCode", item.get("syllabus_code"))
        reason = item.get("reason")
        if isinstance(code, str) and isinstance(reason, str):
            drafts.append((code, reason))
    summary = data.get("summary")
    return drafts, summary if isinstance(summary, str) else None


def _snapshot(
    parsed: tuple[list[tuple[str, str]], str | None], context: ProposalContext
) -> dict:
    """書きかけの下書きを snapshot の中身にする。キーの構成は result と同じ。

    summary は書き終えるまで null とし、外した科目の注記は確定版にだけ付ける。
    """
    drafts, summary = parsed
    courses, _ = assemble_courses(drafts, context)
    credits = [c.credits for c in courses]
    return {
        "courses": [c.model_dump(by_alias=True) for c in courses],
        "totalCredits": sum(credits) if None not in credits else None,
        "summary": summary,
    }


# --- モデル出力の取り出し ---
#
# 構造化出力は `final_result` ツールの呼び出し(`ToolCallPart`)として届き、引数の
# JSON が少しずつ伸びる。モデル・設定によっては本文テキスト(`TextPart`)で届くため
# 両方を受ける。どちらのパートが最終出力かは `FinalResultEvent` が示すが、この
# イベントはパートの index を持たないため、直前に始まったパートを対象とする
# (pydantic-ai は最終出力と判った `PartStartEvent` の直後にこれを出す)。


def _part_text(part: ModelResponsePart) -> str:
    """パートの開始イベントに載っている先頭の断片を取り出す。"""
    if isinstance(part, ToolCallPart):
        if isinstance(part.args, str):
            return part.args
        return json.dumps(part.args, ensure_ascii=False) if part.args else ""
    if isinstance(part, TextPart):
        return part.content
    return ""


def _delta_text(delta: ModelResponsePartDelta) -> str:
    """パートの差分イベントから続きの断片を取り出す。"""
    if isinstance(delta, ToolCallPartDelta) and isinstance(delta.args_delta, str):
        return delta.args_delta
    if isinstance(delta, TextPartDelta):
        return delta.content_delta
    return ""


async def _settle_summary(result, original, adjustments: list[str], context):
    """科目を外した・途中で切れたときだけ、説明文を確定した時間割に合わせて書き直す。

    説明文は外す前の並びを見て書かれるため、外した科目に触れていることがある
    (§7.2.2)。何も外していなければ書き直さない(待ち時間を増やさない)。
    """
    if not adjustments:
        return result
    summary = await rewrite_summary(result, original, context)
    return result.model_copy(update={"summary": summary})


def _result_event(result, adjustments: list[str]) -> dict:
    """確定版のイベント。調整の記録は提案の外(`adjustments`)に載せ、画面には出さない。"""
    return {"result": result.model_dump(by_alias=True), "adjustments": adjustments}


def _stream_proposal(context: ProposalContext):
    """提案の生成を SSE ストリームとして返す。"""
    agent = build_proposal_agent()

    async def gen():
        # 最後に読めた下書き。途中で打ち切られたとき(出力の上限など)に、
        # 書き終えた科目までで確定版を組むのに使う
        parsed: tuple[list[tuple[str, str]], str | None] | None = None
        try:
            # 直前に始まったパート(index, 先頭の断片)。FinalResultEvent が来た
            # ときに、どのパートを最終出力として溜め始めるかを決めるのに使う
            started: tuple[int, str] | None = None
            index: int | None = None
            buffer = ""
            last: dict | None = None

            async with agent.run_stream_events(
                context.prompt, output_type=context.output_type
            ) as events:
                async for event in events:
                    if isinstance(event, PartStartEvent):
                        started = (event.index, _part_text(event.part))
                        continue

                    if isinstance(event, FinalResultEvent):
                        # 出力の検証に落ちて作り直しに入った場合もここを通る。
                        # 前回の断片を捨てて溜め直す(§7.2 の output retries)
                        index, buffer = started if started else (None, "")
                    elif isinstance(event, PartDeltaEvent) and event.index == index:
                        buffer += _delta_text(event.delta)
                    elif isinstance(event, AgentRunResultEvent):
                        draft = event.result.output
                        result, adjustments = assemble_proposal(
                            [(c.syllabus_code, c.reason) for c in draft.courses],
                            draft.summary,
                            context,
                        )
                        result = await _settle_summary(
                            result, draft.summary, adjustments, context
                        )
                        yield format_sse(_result_event(result, adjustments))
                        continue
                    else:
                        continue

                    current = _parse_draft(buffer)
                    if current is None:
                        continue
                    parsed = current
                    snapshot = _snapshot(current, context)
                    # 値が1つ完成するまでは同じ内容になる。同じものは流さない
                    if snapshot != last:
                        last = snapshot
                        yield format_sse({"snapshot": snapshot})
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - SSE開始後は例外を投げられないため全て捕捉する
            # 書き終えた科目が1つでもあれば、そこまでで確定版にする。出力の上限
            # (max_tokens)で切れた場合、作り直すと提案1回ぶんがもう一度かかるため
            if parsed is not None and parsed[0]:
                result, adjustments = assemble_proposal(*parsed, context, truncated=True)
                if result.courses:
                    result = await _settle_summary(result, parsed[1], adjustments, context)
                    yield format_sse(_result_event(result, adjustments))
                    yield format_sse({"done": True})
                    return
            yield format_sse({"error": "提案の生成中にエラーが発生しました"})
        yield format_sse({"done": True})

    return sse_response(gen())


router = APIRouter(prefix="/api", tags=["proposal"])


@router.post("/proposal")
async def post_proposal(req: ProposalRequest):
    """履修提案を生成して SSE で配信する(§6.1 / §7.2)。

    プロンプトの組み立て(要件充足判定・候補科目の抽出・api-clean からの開講情報
    取得)はストリームを開く**前**に済ませる。ここで起きる失敗は対応課程外(404)・
    前提不足(400)・上流障害(502)であり、SSE を開いた後では HTTP の状態コードで
    返せないためである。
    """
    if (req.program_code, req.admission_year) not in get_curricula():
        raise HTTPException(
            status_code=404,
            detail=(
                f"履修要項がありません: 課程コード {req.program_code} / "
                f"{req.admission_year}年度入学"
            ),
        )

    # プロンプトの組み立ては `profile.program` を課程コードとして読む(§7.2)。
    # 本文で受けた課程コードに差し替えて渡す(元のプロファイルは変更しない)
    profile = req.student_profile.model_copy(update={"program": req.program_code})

    try:
        context = await build_proposal_context(
            profile,
            req.admission_year,
            wishes=req.preferences,
            target=req.target_term,
        )
    except ProposalError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except (httpx.HTTPStatusError, httpx.RequestError) as exc:
        raise HTTPException(status_code=502, detail="upstream error") from exc

    return _stream_proposal(context)
