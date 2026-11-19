# Contributing

Thank you for contributing to `sdlc-agent-orchestrator`.

## Local Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

## Running Checks Before a PR

```bash
.venv/bin/ruff check api agent mcp_server evals tests scripts
.venv/bin/pytest -v
cd sample-app && npm test
```

## Pull Request Guidelines

- Work on a feature/chore branch; do not commit directly to `main`.
- Never commit `.env` files, API keys, or GitHub tokens.
- Keep `ALLOW_REAL_PR=false` in local/demo configurations unless intentionally testing PR creation.
