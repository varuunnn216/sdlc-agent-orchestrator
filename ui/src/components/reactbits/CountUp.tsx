import { useEffect, useState } from 'react';
import './Counter.css';

interface CountUpProps {
  to: number;
  durationMs?: number;
}

export function CountUp({ to, durationMs = 450 }: CountUpProps) {
  const [val, setVal] = useState<number>(() => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return to;
    }
    return 0;
  });

  useEffect(() => {
    if (to <= 0) {
      setVal(0);
      return;
    }
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setVal(to);
      return;
    }

    let rafId = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const ease = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(ease * to));
      if (t < 1) {
        rafId = window.requestAnimationFrame(tick);
      }
    };
    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [to, durationMs]);

  return <span className="rb-counter">({val})</span>;
}
