FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    ca-certificates \
  && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
  && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt pyproject.toml ./
RUN pip install --no-cache-dir -r requirements.txt

COPY sample-app/package*.json ./sample-app/
RUN cd sample-app && npm ci

COPY agent ./agent
COPY api ./api
COPY backlog ./backlog
COPY bugs ./bugs
COPY evals ./evals
COPY mcp_server ./mcp_server
COPY sample-app ./sample-app
COPY scripts ./scripts
COPY stories ./stories

EXPOSE 8000

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
