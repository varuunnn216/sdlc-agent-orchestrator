import type { ReactNode } from 'react';
import './ElectricBorder.css';

interface ElectricBorderProps {
  children: ReactNode;
  active?: boolean;
  className?: string;
}

export function ElectricBorder({
  children,
  active = false,
  className = '',
}: ElectricBorderProps) {
  if (!active) {
    return <>{children}</>;
  }

  return (
    <div className={`rb-electric-border is-active ${className}`.trim()}>
      <div className="rb-electric-border-inner">{children}</div>
    </div>
  );
}
