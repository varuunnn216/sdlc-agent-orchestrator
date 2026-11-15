import './CallChip.css';

interface CallChipProps {
  phase: string;
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
  durationMs: number;
  tokens: number;
}

function isErrorResult(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  const record = result as Record<string, unknown>;
  if ('error' in record && Boolean(record.error)) return true;
  if ('passed' in record && record.passed === false) return true;
  return false;
}

export function CallChip({
  phase,
  tool,
  args,
  result,
  durationMs,
  tokens,
}: CallChipProps) {
  const failed = isErrorResult(result);

  return (
    <li className="rb-call-chip">
      <div className="rb-call-chip-head">
        <div className="rb-call-chip-left">
          <span className="rb-call-chip-phase">{phase}</span>
          <code className="rb-call-chip-name">{tool}</code>
        </div>
        <div className="rb-call-chip-right">
          <span>{durationMs}ms</span>
          <span>{tokens} tok</span>
          <span className={`rb-call-chip-outcome ${failed ? 'is-err' : 'is-ok'}`}>
            <span className="rb-call-chip-dot" aria-hidden="true" />
            {failed ? 'fail' : 'ok'}
          </span>
        </div>
      </div>
      <pre className="rb-call-chip-args">{JSON.stringify(args, null, 2)}</pre>
    </li>
  );
}
