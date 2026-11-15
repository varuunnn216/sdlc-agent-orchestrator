import type { ReactNode } from 'react';
import './StarBorder.css';

interface StarBorderProps {
  children: ReactNode;
  disabled?: boolean;
  color?: string;
  className?: string;
}

export function StarBorder({
  children,
  disabled = false,
  color = 'var(--accent)',
  className = '',
}: StarBorderProps) {
  return (
    <div
      className={`rb-star-border ${disabled ? 'is-disabled' : ''} ${className}`.trim()}
      style={{ '--star-color': color } as React.CSSProperties}
    >
      <div className="rb-star-border-glow" aria-hidden="true" />
      <div className="rb-star-border-inner">{children}</div>
    </div>
  );
}
