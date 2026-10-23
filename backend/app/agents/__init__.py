from functools import lru_cache

from pydantic_ai.models.openai import OpenAIChatModel, OpenAIChatModelSettings
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


def chat_model_settings() -> OpenAIChatModelSettings | None:
    """会話のエージェントに渡す推論設定。design.md §6.3.1。

    `llm_reasoning_effort` を設定したときだけ、`chat_template_kwargs` で思考の長さを指示する。
    思考は1回のモデル呼び出しに数十秒かかり、ツールを挟む応答では呼び出しの数だけ重なるため、
    応答時間と回答の質の兼ね合いを本番で比べられるよう、環境変数で切り替えられるようにする。
    """
    effort = get_settings().llm_reasoning_effort
    if effort is None:
        return None
    return OpenAIChatModelSettings(
        extra_body={"chat_template_kwargs": {"enable_thinking": True, "reasoning_effort": effort}}
    )
