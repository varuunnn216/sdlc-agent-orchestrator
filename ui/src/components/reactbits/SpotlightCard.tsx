import { useRef, type MouseEvent, type ReactNode } from 'react';
import './SpotlightCard.css';

interface SpotlightCardProps {
  as?: 'section' | 'aside' | 'div';
  className?: string;
  children: ReactNode;
}

export function SpotlightCard({
  as: Tag = 'div',
  className = '',
  children,
}: SpotlightCardProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  const handleMouseMove = (e: MouseEvent<HTMLElement>) => {
    const el = ref.current;
    if (!el) return;
    if (
      typeof window !== 'undefined' &&
      (window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
        window.matchMedia('(max-width: 640px)').matches)
    ) {
      return;
    }
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--spot-x', `${e.clientX - rect.left}px`);
    el.style.setProperty('--spot-y', `${e.clientY - rect.top}px`);
    el.style.setProperty('--spot-opacity', '1');
  };

  const handleMouseLeave = () => {
    ref.current?.style.setProperty('--spot-opacity', '0');
  };

  return (
    <Tag
      ref={ref as React.RefObject<never>}
      className={`panel rb-spotlight-card ${className}`.trim()}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </Tag>
  );
}
