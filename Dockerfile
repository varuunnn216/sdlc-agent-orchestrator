FROM python:3.12-slim

# Install Node.js 20 + git for Vitest test execution inside isolated sandboxes
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY sample-app/package*.json ./sample-app/
RUN cd sample-app && npm ci

COPY . .

ENV APP_ENV=production
ENV TRUST_PROXY=true
ENV ALLOW_REAL_PR=false
ENV PORT=10000

EXPOSE 10000

CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-10000}"]
