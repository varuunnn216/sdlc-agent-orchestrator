import { useState } from 'react';
import './CallChip.css';

interface CallChipProps {
  phase: string;
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
  durationMs: number;
  tokens: number;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function formatTokens(tokens: number): string {
  return `${tokens} tokens`;
}

function isErrorResult(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  const record = result as Record<string, unknown>;
  if ('error' in record && Boolean(record.error)) return true;
  if ('passed' in record && record.passed === false) return true;
  return false;
}

const MAX_COLLAPSED_LINES = 8;

export function CallChip({
  phase,
  tool,
  args,
  result,
  durationMs,
  tokens,
}: CallChipProps) {
  const failed = isErrorResult(result);
  const argsJson = JSON.stringify(args, null, 2);
  const lines = argsJson.split('\n');
  const isLong = lines.length > MAX_COLLAPSED_LINES;
  const [expanded, setExpanded] = useState(false);

  const displayJson =
    isLong && !expanded
      ? `${lines.slice(0, MAX_COLLAPSED_LINES).join('\n')}\n…`
      : argsJson;

  return (
    <li className="rb-call-chip">
      <div className="rb-call-chip-head">
        <div className="rb-call-chip-left">
          <span className="rb-call-chip-phase">{phase}</span>
          <span className="rb-call-chip-name">{tool}</span>
        </div>
        <div className="rb-call-chip-right">
          <span>{formatDuration(durationMs)}</span>
          <span>{formatTokens(tokens)}</span>
          <span className={`rb-call-chip-outcome ${failed ? 'is-err' : 'is-ok'}`}>
            <span className="rb-call-chip-dot" aria-hidden="true" />
            {failed ? 'fail' : 'ok'}
          </span>
        </div>
      </div>
      <div className="rb-call-chip-json-wrap">
        <pre className="rb-call-chip-args">{displayJson}</pre>
        {isLong && (
          <button
            type="button"
            className="rb-call-chip-toggle"
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? 'Show less' : `Show more (${lines.length} lines)`}
          </button>
        )}
      </div>
    </li>
  );
}
