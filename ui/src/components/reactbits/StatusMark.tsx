import './StatusMark.css';

interface StatusMarkProps {
  status: string;
}

export function StatusMark({ status }: StatusMarkProps) {
  const isSuccess = status === 'done' || status === 'approved';
  return (
    <div
      className="rb-status-mark"
      data-status={status}
      role="status"
      aria-live="polite"
    >
      {isSuccess ? (
        <svg
          className="rb-status-check"
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M3.5 8.5L6.5 11.5L12.5 4.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <span className="rb-status-dot" aria-hidden="true" />
      )}
      <span className="muted">Status:</span>
      <strong className="rb-status-label">{status}</strong>
    </div>
  );
}
