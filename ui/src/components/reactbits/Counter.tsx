import { useEffect, useState } from 'react';
import './Counter.css';

interface CounterProps {
  value: number;
  className?: string;
}

export function Counter({ value, className = '' }: CounterProps) {
  const [displayValue, setDisplayValue] = useState<number>(value);

  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setDisplayValue(value);
      return;
    }

    const start = displayValue;
    const diff = value - start;
    if (diff === 0) return;

    const duration = 180;
    const startTime = performance.now();
    let frameId = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration);
      setDisplayValue(Math.round(start + diff * progress));
      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <span className={`rb-counter ${className}`.trim()} aria-label={`Count: ${value}`}>
      ({displayValue})
    </span>
  );
}
