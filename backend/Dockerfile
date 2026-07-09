FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml .
RUN pip install .

COPY app/ ./app/
COPY scripts/ ./scripts/

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
