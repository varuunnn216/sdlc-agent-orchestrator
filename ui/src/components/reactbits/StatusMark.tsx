import './StatusMark.css';

interface StatusMarkProps {
  status: string;
}

export function StatusMark({ status }: StatusMarkProps) {
  return (
    <div
      className="rb-status-mark"
      data-status={status}
      role="status"
      aria-live="polite"
    >
      <span className="rb-status-dot" aria-hidden="true" />
      <span className="muted">Status:</span>
      <strong className="rb-status-label">{status}</strong>
    </div>
  );
}
