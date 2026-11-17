# Eval Results

- **Run timestamp (UTC):** 2026-11-17T06:15:34.933715+00:00
- **Model:** `groq:openai/gpt-oss-120b, gemini:gemini-3.6-flash`
- **Cases run:** 2 across 1 pass(es) (dry-run, isolated working copies)
- **Success rate:** 0/1 (0.0%)
- **Pass rate mean (min–max):** 0.0% (0.0%–0.0%)
- **Infra failures (quota/provider):** 1
- **Average tool calls:** 13.00
- **Average tokens:** 34750 (avg thinking tokens: 0)
- **Average time:** 187.09s

## Per-Pass Summary

- **Pass 1:** 0/1 (0.0%), infra skipped/failed: 1

## By Difficulty & Type

| Group | Passed | Total | Rate |
| --- | ---: | ---: | ---: |
| easy | 0 | 1 | 0.0% |
| medium | 0 | 0 | 0.0% |
| hard | 0 | 0 | 0.0% |
| story | 0 | 1 | 0.0% |
| bug | 0 | 0 | 0.0% |

## Per-Case Pass/Fail Matrix

| Case | Type | Difficulty | Pass 1 |
| --- | --- | --- | --- |
| STORY-1 | story | easy | FAIL |
| STORY-2 | story | easy | INFRA |

## Per-Case Breakdown

| Pass | Case | Type | Difficulty | Provider | Model | Result | Status | Tool Calls | Tokens | Thinking | Time (s) |
| ---: | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| 1 | STORY-1 | story | easy | groq | openai/gpt-oss-120b | FAIL | budget_exceeded | 13 | 34750 | 0 | 187.09 |
| 1 | STORY-2 | story | easy | gemini | openai/gpt-oss-120b | INFRA | failed | 8 | 18307 | 0 | 97.22 |

## Agent Failures

- **[agent] STORY-1** (pass 1, budget_exceeded): Run time limit exceeded (180s)

## Infra Failures

- **[infra] STORY-2** (pass 1, gemini): Today's free AI capacity is used up. Please try again later.
