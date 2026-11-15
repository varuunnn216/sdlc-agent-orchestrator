import type { ReactNode } from 'react';
import './GlareHover.css';

interface GlareHoverProps {
  children: ReactNode;
  className?: string;
}

export function GlareHover({ children, className = '' }: GlareHoverProps) {
  return (
    <div className={`rb-glare-hover ${className}`.trim()}>{children}</div>
  );
}
