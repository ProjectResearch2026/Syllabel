from app.settings import Settings, get_settings


def test_defaults():
    s = Settings()
    assert s.vllm_base_url == "http://vllm:8000/v1"
    assert s.llm_model_id == "qwen3.6-27b-fp8"
    assert s.api_clean_base_url == "http://api-clean:5000"


def test_env_override(monkeypatch):
    monkeypatch.setenv("API_CLEAN_BASE_URL", "http://localhost:5050")
    assert Settings().api_clean_base_url == "http://localhost:5050"


def test_get_settings_is_cached():
    assert get_settings() is get_settings()
