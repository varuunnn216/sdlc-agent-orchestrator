import type { ElementType, ReactNode } from 'react';
import './SpotlightCard.css';

interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  spotlightColor?: string;
}

export function SpotlightCard({
  children,
  className = '',
  as: Component = 'div',
  spotlightColor = 'rgba(99, 102, 241, 0.09)',
}: SpotlightCardProps) {
  return (
    <Component
      className={`rb-spotlight-card ${className}`.trim()}
      style={{ '--spotlight-color': spotlightColor } as React.CSSProperties}
    >
      {children}
    </Component>
  );
}
