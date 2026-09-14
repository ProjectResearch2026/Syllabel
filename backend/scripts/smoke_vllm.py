"""実 vLLM への疎通スモーク。使い方: python -m scripts.smoke_vllm
   VLLM_BASE_URL / LLM_MODEL_ID / LLM_API_KEY を env で上書き可(既定は compose 前提)。"""
from pydantic_ai import Agent

from app.agents import build_model


def main() -> None:
    agent = Agent(build_model())
    result = agent.run_sync("Reply with the single word: pong")
    print(result.output)


if __name__ == "__main__":
    main()
