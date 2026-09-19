from pydantic_ai.models.openai import OpenAIChatModel

from app.agents import build_model


def test_build_model_type_and_name():
    m = build_model()
    assert isinstance(m, OpenAIChatModel)
    assert m.model_name == "qwen3.8-27b-fp8"


def test_build_model_is_cached():
    assert build_model() is build_model()
