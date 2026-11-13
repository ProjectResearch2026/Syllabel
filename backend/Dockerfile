FROM python:3.14-slim

# 依存は uv.lock に記録した版のとおりに入れる。pyproject.toml の範囲指定から
# ビルドのたびに解決し直すと、ビルドした日やキャッシュの有無で中身が変わり、
# リポジトリに記録した版と稼働中の版が食い違う
RUN pip install --no-cache-dir uv

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY app/ ./app/
COPY scripts/ ./scripts/

ENV PATH="/app/.venv/bin:$PATH"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
