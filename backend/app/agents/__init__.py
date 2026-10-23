import asyncio
from collections import deque
from collections.abc import AsyncIterator, Sequence
from contextlib import asynccontextmanager
from functools import lru_cache

from pydantic_ai.models.openai import OpenAIChatModel, OpenAIChatModelSettings
from pydantic_ai.providers.openai import OpenAIProvider

from app.settings import get_settings


def _model_for(api_key: str) -> OpenAIChatModel:
    s = get_settings()
    return OpenAIChatModel(
        s.llm_model_id,
        provider=OpenAIProvider(base_url=s.vllm_base_url, api_key=api_key),
    )


@lru_cache
def build_model() -> OpenAIChatModel:
    """vllm(OpenAI互換)を叩く PydanticAI モデルを生成する。design.md §6.3 / §3.4.3。

    モデル名は接続先が返すモデル ID と一致必須(不一致で404)。
    宛先は vllm 直接とは限らず、トークン認証を要求するゲートウェイを経由することがある(§3.4.3)。
    api_key は設定で与え、未設定時は認証なしの vllm 向けのダミー値 "EMPTY" になる。
    トークンが複数あるときは先頭のものを使う。会話は `model_pool()` から借りたモデルで走る。
    """
    return _model_for(get_settings().llm_api_keys[0])


class ModelBusyError(Exception):
    """トークンがすべて生成中のまま、待つ上限(`llm_wait_seconds`)を過ぎた。"""


class ModelPool:
    """トークンごとのモデルを、生成の1回(エージェントの実行1回)ずつ貸し出す。§3.4.3。

    ゲートウェイは同一トークンで生成が進行中だと後続を `503 busy` で即座に拒否する。
    1つのトークンを同時に2つの実行へ渡さないことで、拒否される前に backend で順番を待たせる。
    待ちは来た順に空いたトークンを受け取る。

    asyncio のキューを使わないのは、キューが最初に待った event loop に縛られるためである
    (テストは要求ごとに別の loop で走る)。待ちの Future はそのつど走っている loop で作る。
    """

    def __init__(self, models: Sequence[OpenAIChatModel]):
        self._free: deque[OpenAIChatModel] = deque(models)
        self._waiters: deque[asyncio.Future[OpenAIChatModel]] = deque()

    @property
    def available(self) -> int:
        """空いているトークンの数。"""
        return len(self._free)

    @asynccontextmanager
    async def acquire(self, timeout: float) -> AsyncIterator[OpenAIChatModel]:
        """空いているトークンのモデルを借りる。`timeout` 秒空かなければ `ModelBusyError`。"""
        model = await self._take(timeout)
        try:
            yield model
        finally:
            self._give(model)

    async def _take(self, timeout: float) -> OpenAIChatModel:
        if self._free and not self._waiters:
            return self._free.popleft()
        waiter: asyncio.Future[OpenAIChatModel] = asyncio.get_running_loop().create_future()
        self._waiters.append(waiter)
        try:
            return await asyncio.wait_for(waiter, timeout)
        except BaseException as exc:
            if waiter in self._waiters:
                self._waiters.remove(waiter)
            elif waiter.done() and not waiter.cancelled():
                # 渡された直後に打ち切られた(時間切れ・接続断)。受け取らずに次へ回す
                self._give(waiter.result())
            if isinstance(exc, TimeoutError):
                raise ModelBusyError from exc
            raise

    def _give(self, model: OpenAIChatModel) -> None:
        while self._waiters:
            waiter = self._waiters.popleft()
            if not waiter.done():
                waiter.set_result(model)
                return
        self._free.append(model)


@lru_cache
def model_pool() -> ModelPool:
    """設定のトークン(`LLM_API_KEY` をカンマで分けたもの)ごとのモデルを持つ貸し出し口。"""
    return ModelPool([_model_for(key) for key in get_settings().llm_api_keys])


def chat_model_settings() -> OpenAIChatModelSettings:
    """会話のエージェントに渡す推論設定。design.md §6.3.1。

    `chat_template_kwargs` で思考の長さ(`llm_reasoning_effort`。既定 low)を指示する。
    思考は1回のモデル呼び出しに数十秒かかり、ツールを挟む応答では呼び出しの数だけ重なる。
    環境変数 `LLM_REASONING_EFFORT` で、イメージを作り直さずに切り替えられる。
    """
    effort = get_settings().llm_reasoning_effort
    return OpenAIChatModelSettings(
        extra_body={"chat_template_kwargs": {"enable_thinking": True, "reasoning_effort": effort}}
    )
