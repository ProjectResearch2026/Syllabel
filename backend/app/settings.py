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
    # ゲートウェイは同一トークンで生成を1本しか通さない(§3.4.3)ため、複数発行したときは
    # カンマ区切りで並べる(`tok1,tok2`)。本数だけ同時に生成できる(`app/agents/__init__.py`)。
    # 既定の "EMPTY" は認証なしの vllm を直接叩く開発環境向けのダミー値
    # (OpenAI クライアントは非空の api_key を要求するため空にはできない)
    llm_api_key: str = "EMPTY"
    # トークンがすべて生成中のとき、空くのを待つ上限(秒)。過ぎたら「混み合っています」で返す。
    # 時間割のアシスタントの1回の応答は1〜2分かかる(§6.3.1)
    llm_wait_seconds: float = 120.0
    # Qwen3.8 のチャットテンプレートの `reasoning_effort`(§6.3.1)。会話(時間割のアシスタント・
    # シラバスチャット)のリクエストに `chat_template_kwargs` として載せる。既定の low は実機の
    # 比較(2026-10-23)による: テンプレートの既定 xhigh では思考が1回に数十秒〜5分かかり、
    # ツールを挟む応答が13分に達した。3値以外はテンプレートが例外を投げるので、ここで値を縛る
    llm_reasoning_effort: Literal["xhigh", "medium", "low"] = "low"

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

    @property
    def llm_api_keys(self) -> list[str]:
        """`llm_api_key` をカンマで分けたトークンの並び。空なら既定のダミー値 "EMPTY" だけ。"""
        keys = [key.strip() for key in self.llm_api_key.split(",") if key.strip()]
        return keys or ["EMPTY"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
