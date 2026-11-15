import type { ReactNode } from 'react';
import './FadeContent.css';

interface FadeContentProps {
  children: ReactNode;
  className?: string;
  delayMs?: number;
}

export function FadeContent({
  children,
  className = '',
  delayMs = 0,
}: FadeContentProps) {
  return (
    <div
      className={`rb-fade-content ${className}`.trim()}
      style={delayMs ? { animationDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </div>
  );
}
