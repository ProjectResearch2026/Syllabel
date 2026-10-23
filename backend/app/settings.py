from functools import lru_cache
from pathlib import Path
from typing import Literal

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
    # Qwen3.8 のチャットテンプレートの `reasoning_effort`(§6.3.1)。会話(時間割のアシスタント・
    # シラバスチャット)のリクエストに `chat_template_kwargs` として載せる。未設定なら送らない
    # (テンプレートの既定 xhigh)。3値以外はテンプレートが例外を投げるので、ここで値を縛る
    llm_reasoning_effort: Literal["xhigh", "medium", "low"] | None = None

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
    # 本サービスの対象学部(要件§2.1)。シラバスの検索ツールはこの学部の科目だけを返す
    target_faculty: str = "先端理工学部"
    # 開講年度ぶんの開講情報・対象課程の置き場(`app/timetable/offerings.py`)の有効期間(秒)。
    # 学生データを含まない公開の値で、時間割の組み立てと検索のたびに api-clean を
    # ページ送りで引き直さないために持つ
    catalog_ttl_seconds: float = 1800.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
