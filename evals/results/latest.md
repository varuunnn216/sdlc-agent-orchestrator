# Eval Results

- **Run timestamp (UTC):** 2026-11-16T09:07:46.745586+00:00
- **Model:** `groq`
- **Cases run:** 1 (dry-run, isolated working copies)
- **Success rate:** 0/0 (0.0%)
- **Infra failures (quota/provider):** 1
- **Average tool calls:** 0.00
- **Average tokens:** 0
- **Average time:** 0.00s

## Per-Case Breakdown

| Case | Type | Difficulty | Provider | Model | Result | Status | Tool Calls | Tokens | Time (s) |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: |
| BUG-1 | smoke | held-out | groq | openai/gpt-oss-120b | INFRA | failed | 5 | 15248 | 95.49 |

## Agent Failures

None — all non-infra cases passed.

## Infra Failures

- **BUG-1** (groq): Today's free AI capacity is used up. Please try again later.
