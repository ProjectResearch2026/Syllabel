"""履修提案の生成(SSE)。design.md §6.1 / §7.2。

`POST /api/proposal` は学生プロファイルと課程・入学年度を本文で受け、
`build_proposal_agent()`(§7.2)が組み立てる `TimetableProposal` を
**組み立て途中の状態から逐次** SSE で配信する。イベントは3種類:

- `{"snapshot": <組み立て途中の TimetableProposal>}` — 生成中に何度も流れる。
  §7.2 の「時間割表を逐次描画」に対応する
- `{"result": <完成した TimetableProposal>}` — 検証を通った確定版。1度だけ流れる
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
from pydantic import BaseModel, ConfigDict, ValidationError, create_model
from pydantic.alias_generators import to_camel
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
    ProposalError,
    build_proposal_agent,
    build_proposal_prompt,
)
from app.api.sse import format_sse, sse_response
from app.curricula.loader import get_curricula
from app.schemas.proposal import ProposedCourse, TargetTerm, TimetableProposal
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
# `TimetableProposal` は `title` / `reason` / `summary` を必須とするため、生成途中の
# JSON はそのままでは検証を通らない(pydantic の `allow_partial` は末尾の欠落を
# 許すだけで、必須フィールドの欠落は許さない)。そこで全フィールドを省略可能にした
# 写しをスキーマから機械的に作り、これで途中経過を検証する。フィールドを手で並べ
# 直さないのは、`app/schemas/proposal.py` を直したときに snapshot だけが古い形の
# まま残るのを避けるためである。
#
# コマ重複の検査(`TimetableProposal.check_no_time_conflict`)は引き継がない。
# 途中経過は未確定の値を含み、重複は確定時の検証と作り直し(§7.2 の
# `retries={"output": ...}`)で扱う。


def _partial_model(
    model: type[BaseModel], name: str, **overrides: type
) -> type[BaseModel]:
    """`model` の全フィールドを「省略可能・既定 None」にした写しを作る。"""
    fields = {
        key: (overrides.get(key, field.annotation) | None, None)
        for key, field in model.model_fields.items()
    }
    return create_model(
        name,
        __config__=ConfigDict(alias_generator=to_camel, populate_by_name=True),
        **fields,
    )


PartialProposedCourse = _partial_model(ProposedCourse, "PartialProposedCourse")
PartialTimetableProposal = _partial_model(
    TimetableProposal,
    "PartialTimetableProposal",
    courses=list[PartialProposedCourse],
)


def _snapshot(buffer: str) -> dict | None:
    """組み立て途中の JSON を snapshot の中身にする。

    まだ JSON として読めない断片(値の途中で切れた数値など)では `None` を返し、
    そのぶんのイベントを飛ばす。文字列の途中も同様に読み飛ばされ、値は完成した
    ものだけが載る(欠けた語が一瞬表示されるのを避けるため
    `allow_partial='trailing-strings'` は使わない)。
    """
    try:
        partial = PartialTimetableProposal.__pydantic_validator__.validate_json(
            buffer, allow_partial=True
        )
    except ValidationError:
        return None
    return partial.model_dump(by_alias=True)


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


def _stream_proposal(prompt: str):
    """提案の生成を SSE ストリームとして返す。"""
    agent = build_proposal_agent()

    async def gen():
        try:
            # 直前に始まったパート(index, 先頭の断片)。FinalResultEvent が来た
            # ときに、どのパートを最終出力として溜め始めるかを決めるのに使う
            started: tuple[int, str] | None = None
            index: int | None = None
            buffer = ""
            last: dict | None = None

            async with agent.run_stream_events(prompt) as events:
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
                        result = event.result.output.model_dump(by_alias=True)
                        yield format_sse({"result": result})
                        continue
                    else:
                        continue

                    snapshot = _snapshot(buffer)
                    # 値が1つ完成するまでは同じ内容になる。同じものは流さない
                    if snapshot is not None and snapshot != last:
                        last = snapshot
                        yield format_sse({"snapshot": snapshot})
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - SSE開始後は例外を投げられないため全て捕捉する
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
        prompt = await build_proposal_prompt(
            profile,
            req.admission_year,
            wishes=req.preferences,
            target=req.target_term,
        )
    except ProposalError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except (httpx.HTTPStatusError, httpx.RequestError) as exc:
        raise HTTPException(status_code=502, detail="upstream error") from exc

    return _stream_proposal(prompt)
