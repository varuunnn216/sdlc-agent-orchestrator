import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import './ClickSpark.css';

interface ClickSparkProps {
  children: ReactNode;
  sparkColor?: string;
  sparkCount?: number;
  durationMs?: number;
}

interface Spark {
  x: number;
  y: number;
  angle: number;
  startTime: number;
}

export function ClickSpark({
  children,
  sparkColor = '#22D3EE',
  sparkCount = 6,
  durationMs = 320,
}: ClickSparkProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sparksRef = useRef<Spark[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
    };
    resize();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      window.cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const draw = (now: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    const alive: Spark[] = [];
    for (const s of sparksRef.current) {
      const elapsed = now - s.startTime;
      if (elapsed >= durationMs) continue;
      alive.push(s);

      const t = elapsed / durationMs;
      const ease = 1 - Math.pow(1 - t, 3);
      const dist = 6 + ease * 18;
      const len = 6 * (1 - t);

      const x1 = s.x + Math.cos(s.angle) * dist;
      const y1 = s.y + Math.sin(s.angle) * dist;
      const x2 = s.x + Math.cos(s.angle) * (dist + len);
      const y2 = s.y + Math.sin(s.angle) * (dist + len);

      ctx.strokeStyle = sparkColor;
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.lineWidth = 1.75;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    sparksRef.current = alive;
    if (alive.length > 0) {
      rafRef.current = window.requestAnimationFrame(draw);
    } else {
      rafRef.current = 0;
    }
  };

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.matchMedia('(max-width: 640px)').matches) return;

    const target = e.target as HTMLElement | null;
    if (!target?.closest('[data-spark="true"]')) return;

    const now = performance.now();
    for (let i = 0; i < sparkCount; i += 1) {
      sparksRef.current.push({
        x: e.clientX,
        y: e.clientY,
        angle: (Math.PI * 2 * i) / sparkCount + (Math.random() - 0.5) * 0.2,
        startTime: now,
      });
    }

    if (rafRef.current === 0) {
      rafRef.current = window.requestAnimationFrame(draw);
    }
  };

  return (
    <div className="rb-click-spark-root" onClick={handleClick}>
      <canvas
        ref={canvasRef}
        className="rb-click-spark-canvas"
        aria-hidden="true"
      />
      {children}
    </div>
  );
}
