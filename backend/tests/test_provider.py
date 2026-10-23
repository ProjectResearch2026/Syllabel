import asyncio

import pytest
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider

from app.agents import ModelBusyError, ModelPool, build_model, model_pool
from app.settings import get_settings


def _model(key: str) -> OpenAIChatModel:
    return OpenAIChatModel("m", provider=OpenAIProvider(base_url="http://x/v1", api_key=key))


def test_build_model_type_and_name():
    m = build_model()
    assert isinstance(m, OpenAIChatModel)
    assert m.model_name == "qwen3.8-27b-fp8"


def test_build_model_is_cached():
    assert build_model() is build_model()


def test_build_model_uses_first_of_several_keys(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "tok-a,tok-b")
    get_settings.cache_clear()
    build_model.cache_clear()
    try:
        assert build_model().client.api_key == "tok-a"
    finally:
        get_settings.cache_clear()
        build_model.cache_clear()


def test_model_pool_has_a_model_per_key(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "tok-a, tok-b")
    get_settings.cache_clear()
    model_pool.cache_clear()
    try:
        pool = model_pool()
        assert pool.available == 2
        assert pool is model_pool()
    finally:
        get_settings.cache_clear()
        model_pool.cache_clear()


@pytest.mark.asyncio
async def test_pool_lends_each_model_to_one_run_at_a_time():
    a, b = _model("a"), _model("b")
    pool = ModelPool([a, b])
    async with pool.acquire(1) as first, pool.acquire(1) as second:
        assert first is a and second is b
        assert pool.available == 0
    assert pool.available == 2


@pytest.mark.asyncio
async def test_pool_waiter_gets_the_released_model_in_order():
    a = _model("a")
    pool = ModelPool([a])
    order: list[str] = []

    async def run(name: str) -> None:
        async with pool.acquire(1) as model:
            assert model is a
            order.append(name)
            await asyncio.sleep(0.01)

    await asyncio.gather(run("1"), run("2"), run("3"))
    assert order == ["1", "2", "3"]
    assert pool.available == 1


@pytest.mark.asyncio
async def test_pool_times_out_when_no_model_frees():
    pool = ModelPool([_model("a")])
    async with pool.acquire(1):
        with pytest.raises(ModelBusyError):
            async with pool.acquire(0.01):
                pass
    # 諦めた待ちは残らず、返したモデルはそのまま空きに戻る
    assert pool.available == 1


@pytest.mark.asyncio
async def test_pool_returns_model_when_run_fails():
    pool = ModelPool([_model("a")])
    with pytest.raises(RuntimeError):
        async with pool.acquire(1):
            raise RuntimeError
    assert pool.available == 1


@pytest.mark.asyncio
async def test_pool_cancelled_waiter_does_not_hold_a_model():
    pool = ModelPool([_model("a")])
    async with pool.acquire(1):
        waiting = asyncio.create_task(pool.acquire(1).__aenter__())
        await asyncio.sleep(0)
        waiting.cancel()
        with pytest.raises(asyncio.CancelledError):
            await waiting
    assert pool.available == 1
