import type { ErrorDetail } from '../types';
import './ErrorCard.css';

interface ErrorCardProps {
  message: string;
  detail?: ErrorDetail | null;
}

function formatRetryTime(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return '';
  if (seconds < 60) return ` Retry in ~${seconds}s.`;
  const mins = Math.ceil(seconds / 60);
  if (mins < 60) return ` Retry in ~${mins} min.`;
  const hrs = Math.ceil(mins / 60);
  return ` Retry in ~${hrs}h.`;
}

export function ErrorCard({ message, detail }: ErrorCardProps) {
  if (!message && !detail) return null;

  const isQuota = detail?.kind === 'quota_exhausted';
  const friendlyText = isQuota
    ? `Today's free AI capacity is used up. Please try again later.${formatRetryTime(detail?.retry_after_s)}`
    : message;

  return (
    <div className="error-card" role="alert" data-testid="friendly-error-card">
      <p className="error-card-message">{friendlyText}</p>
      {detail && (
        <details className="error-card-details">
          <summary>Technical details</summary>
          <dl className="error-card-meta">
            <div>
              <dt>Provider</dt>
              <dd>{detail.provider || 'none'}</dd>
            </div>
            <div>
              <dt>Kind</dt>
              <dd>{detail.kind}</dd>
            </div>
            <div>
              <dt>Attempts</dt>
              <dd>{detail.attempts ?? 0}</dd>
            </div>
          </dl>
        </details>
      )}
    </div>
  );
}
