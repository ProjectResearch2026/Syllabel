from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # vllm (OpenAI 互換) — design.md §6.3 / §4.3
    # llm_model_id は vllm の --served-model-name と一致必須(不一致で404)
    vllm_base_url: str = "http://vllm:8000/v1"
    llm_model_id: str = "qwen3.6-27b-fp8"

    # api-clean — design.md §6.2 / §3.4
    api_clean_base_url: str = "http://api-clean:5000"

    # 外部呼び出しのタイムアウト(秒)
    http_timeout: float = 30.0

    # 履修要項データ層 — design.md §4.4.2 / §4.4.3
    # 既定はリポジトリ直下のディレクトリを backend/ から相対で指す。コンテナでは
    # docker-compose.yml が読み取り専用マウント先(/curricula・/offerings)を渡す
    curricula_dir: Path = Path("../curricula")
    offerings_dir: Path = Path("../offerings")
    # backend が参照する開講年度。過去年度は読まない(§4.4.3 / §4.4.4)
    offering_year: int = 2026


@lru_cache
def get_settings() -> Settings:
    return Settings()
