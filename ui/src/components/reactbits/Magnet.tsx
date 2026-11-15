import { useRef, useState, type MouseEvent, type ReactNode } from 'react';
import './Magnet.css';

interface MagnetProps {
  children: ReactNode;
  disabled?: boolean;
  maxOffsetPx?: number;
}

export function Magnet({
  children,
  disabled = false,
  maxOffsetPx = 5,
}: MagnetProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (disabled || !ref.current) return;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
    const rect = ref.current.getBoundingClientRect();
    const relX = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    const relY = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
    setOffset({
      x: Math.max(-maxOffsetPx, Math.min(maxOffsetPx, relX * maxOffsetPx)),
      y: Math.max(-maxOffsetPx, Math.min(maxOffsetPx, relY * maxOffsetPx)),
    });
  };

  const handleMouseLeave = () => {
    setOffset({ x: 0, y: 0 });
  };

  return (
    <div
      ref={ref}
      className="rb-magnet"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: `translate3d(${offset.x.toFixed(1)}px, ${offset.y.toFixed(1)}px, 0)`,
      }}
    >
      {children}
    </div>
  );
}
