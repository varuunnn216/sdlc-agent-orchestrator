import type { ReactNode } from 'react';
import './StarBorder.css';

interface StarBorderProps {
  children: ReactNode;
  active?: boolean;
  className?: string;
}

export function StarBorder({
  children,
  active = false,
  className = '',
}: StarBorderProps) {
  if (!active) {
    return <>{children}</>;
  }

  return (
    <div className={`rb-star-border ${className}`.trim()}>
      <div className="rb-star-border-beam" aria-hidden="true" />
      <div className="rb-star-border-inner">{children}</div>
    </div>
  );
}
