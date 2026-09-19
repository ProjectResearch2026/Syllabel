from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # vllm (OpenAI 互換) — design.md §6.3 / §3.4.3
    # llm_model_id は接続先が返すモデル ID と一致必須(不一致で404)
    # vllm_base_url にはトークンゲートウェイの base_url を与える場合がある(§3.4.3)
    vllm_base_url: str = "http://vllm:8000/v1"
    llm_model_id: str = "qwen3.8-27b-fp8"
    # ゲートウェイが要求するトークン。Authorization: Bearer <値> として送られる(§6.3)。
    # 既定の "EMPTY" は認証なしの vllm を直接叩く開発環境向けのダミー値
    # (OpenAI クライアントは非空の api_key を要求するため空にはできない)
    llm_api_key: str = "EMPTY"

    # api-clean — design.md §6.2 / §3.4.4
    # トークンゲートウェイ経由の場合はその URL を与える。ゲートは
    # GET /syllabi・/syllabi/{code}・/masters だけを通し、POST /sql を拒否する
    api_clean_base_url: str = "http://api-clean:5000"
    # ゲートウェイが要求するトークン。Authorization: Bearer <値> として送られる。
    # 既定の空文字は認証なしの api-clean を直接叩く開発環境向けで、このときは
    # ヘッダ自体を付けない(§6.2)
    api_clean_api_key: str = ""

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
