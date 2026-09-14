from functools import lru_cache

from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider

from app.settings import get_settings


@lru_cache
def build_model() -> OpenAIChatModel:
    """vllm(OpenAI互換)を叩く PydanticAI モデルを生成する。design.md §6.3 / §3.4.3。

    モデル名は接続先が返すモデル ID と一致必須(不一致で404)。
    宛先は vllm 直接とは限らず、トークン認証を要求するゲートウェイを経由することがある(§3.4.3)。
    api_key は設定で与え、未設定時は認証なしの vllm 向けのダミー値 "EMPTY" になる。
    """
    s = get_settings()
    return OpenAIChatModel(
        s.llm_model_id,
        provider=OpenAIProvider(base_url=s.vllm_base_url, api_key=s.llm_api_key),
    )
