import type { ReactNode } from 'react';
import './GradientText.css';

interface GradientTextProps {
  children: ReactNode;
  className?: string;
}

export function GradientText({ children, className = '' }: GradientTextProps) {
  return <span className={`rb-gradient-text ${className}`.trim()}>{children}</span>;
}
