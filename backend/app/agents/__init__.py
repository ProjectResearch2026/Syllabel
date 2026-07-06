from functools import lru_cache

from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider

from app.settings import get_settings


@lru_cache
def build_model() -> OpenAIChatModel:
    """vllm(OpenAI互換)を叩く PydanticAI モデルを生成する。design.md §6.3 / §4.3。

    モデル名は vllm の --served-model-name と一致必須(不一致で404)。
    vllm は認証なし(§4.3)だが OpenAI クライアントは非空 api_key を要求するためダミーを渡す。
    """
    s = get_settings()
    return OpenAIChatModel(
        s.llm_model_id,
        provider=OpenAIProvider(base_url=s.vllm_base_url, api_key="EMPTY"),
    )
