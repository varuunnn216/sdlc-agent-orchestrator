/// <reference types="vite/client" />

interface EvalStats {
  successRate: number;
  avgToolCalls: number;
  avgTimeSec: number;
  totalCases: number;
}

declare const __EVAL_STATS__: EvalStats | null;
