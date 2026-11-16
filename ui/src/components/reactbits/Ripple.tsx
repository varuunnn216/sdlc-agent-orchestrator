import { useState, type PointerEvent, type ReactNode } from 'react';
import './Ripple.css';

interface RippleWave {
  id: number;
  x: number;
  y: number;
  size: number;
}

let nextRippleId = 1;

export function useRipple(disabled = false) {
  const [waves, setWaves] = useState<RippleWave[]>([]);

  const trigger = (e: PointerEvent<HTMLElement>) => {
    if (disabled) return;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dx = Math.max(x, rect.width - x);
    const dy = Math.max(y, rect.height - y);
    const size = Math.ceil(Math.hypot(dx, dy) * 2.1);
    const id = nextRippleId++;

    setWaves((prev) => [...prev.slice(-3), { id, x, y, size }]);
    window.setTimeout(() => {
      setWaves((prev) => prev.filter((w) => w.id !== id));
    }, 520);
  };

  const rippleLayer = (
    <span className="rb-ripple-layer" aria-hidden="true">
      {waves.map((w) => (
        <span
          key={w.id}
          className="rb-ripple-wave"
          style={{
            left: `${w.x}px`,
            top: `${w.y}px`,
            width: `${w.size}px`,
            height: `${w.size}px`,
          }}
        />
      ))}
    </span>
  );

  return { trigger, rippleLayer };
}

interface RippleProps {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}

export function Ripple({
  children,
  className = '',
  disabled = false,
}: RippleProps) {
  const { trigger, rippleLayer } = useRipple(disabled);
  return (
    <div
      className={`rb-ripple-host ${className}`.trim()}
      onPointerDown={trigger}
    >
      {children}
      {rippleLayer}
    </div>
  );
}
