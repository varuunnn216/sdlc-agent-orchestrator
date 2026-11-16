import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

interface EvalStats {
  successRate: number;
  avgToolCalls: number;
  avgTimeSec: number;
  totalCases: number;
}

function readEvalStats(): EvalStats | null {
  try {
    const mdPath = path.resolve(__dirname, '../evals/results/latest.md');
    if (!fs.existsSync(mdPath)) return null;
    const content = fs.readFileSync(mdPath, 'utf-8');
    if (/not yet executed/i.test(content)) return null;

    const rateMatch = content.match(/success\s*rate[^0-9]*([0-9]+(?:\.[0-9]+)?)\s*%/i);
    const toolsMatch = content.match(/avg(?:\.|erage)?\s*tool\s*calls[^0-9]*([0-9]+(?:\.[0-9]+)?)/i);
    const timeMatch = content.match(/avg(?:\.|erage)?\s*time[^0-9]*([0-9]+(?:\.[0-9]+)?)/i);
    const casesMatch = content.match(/(?:total\s*)?cases[^0-9]*([0-9]+)/i);

    if (!rateMatch || !toolsMatch || !timeMatch || !casesMatch) return null;
    return {
      successRate: Number(rateMatch[1]),
      avgToolCalls: Number(toolsMatch[1]),
      avgTimeSec: Number(timeMatch[1]),
      totalCases: Number(casesMatch[1]),
    };
  } catch {
    return null;
  }
}

const apiTarget = process.env.VITE_API_TARGET ?? 'http://localhost:8000';

export default defineConfig({
  plugins: [react()],
  define: {
    __EVAL_STATS__: JSON.stringify(readEvalStats()),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
