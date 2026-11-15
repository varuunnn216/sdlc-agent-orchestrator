import { useEffect, useRef } from 'react';
import './Particles.css';

interface ParticlesProps {
  status: string;
  count?: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  phase: number;
  twinkleSpeed: number;
}

export default function Particles({ status, count = 60 }: ParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const statusRef = useRef(status);
  const pulseUntilRef = useRef<number>(0);
  const pulseKindRef = useRef<'done' | 'failed' | null>(null);

  useEffect(() => {
    const prev = statusRef.current;
    statusRef.current = status;
    if (prev !== status) {
      if (status === 'done' || status === 'approved') {
        pulseKindRef.current = 'done';
        pulseUntilRef.current = performance.now() + 750;
      } else if (
        status === 'failed' ||
        status === 'rejected' ||
        status === 'budget_exceeded'
      ) {
        pulseKindRef.current = 'failed';
        pulseUntilRef.current = performance.now() + 750;
      } else {
        pulseKindRef.current = null;
      }
    }
  }, [status]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.matchMedia('(max-width: 640px)').matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    const particles: Particle[] = Array.from({ length: count }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      size: 0.9 + Math.random() * 1.3,
      phase: Math.random() * Math.PI * 2,
      twinkleSpeed: 1.2 + Math.random() * 1.6,
    }));

    let curSpeed = 0.25;
    let curOpacity = 0.28;
    let curRedMix = 0;
    let lastFrame = 0;
    let rafId = 0;

    const render = (now: number) => {
      if (document.visibilityState === 'hidden') {
        rafId = 0;
        return;
      }
      rafId = window.requestAnimationFrame(render);
      if (now - lastFrame < 33.3) return; // 30 fps cap
      const dt = Math.min(0.1, (now - (lastFrame || now)) / 1000);
      lastFrame = now;

      const s = statusRef.current;
      const inPulse = now < pulseUntilRef.current;
      let targetSpeed = 0.25;
      let targetOpacity = 0.28;
      let targetRed = 0;

      if (inPulse && pulseKindRef.current === 'done') {
        targetSpeed = 0.9;
        targetOpacity = 0.68;
      } else if (inPulse && pulseKindRef.current === 'failed') {
        targetSpeed = 0.5;
        targetOpacity = 0.55;
        targetRed = 1;
      } else if (s === 'running') {
        targetSpeed = 0.65;
        targetOpacity = 0.48;
      } else if (s === 'awaiting_approval') {
        targetSpeed = 0.3;
        targetOpacity = 0.34;
      }

      const ease = 1 - Math.exp(-dt / 0.22); // ~600ms settle
      curSpeed += (targetSpeed - curSpeed) * ease;
      curOpacity += (targetOpacity - curOpacity) * ease;
      curRedMix += (targetRed - curRedMix) * ease;

      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const r = Math.round(165 + (239 - 165) * curRedMix);
      const g = Math.round(243 + (68 - 243) * curRedMix);
      const b = Math.round(252 + (68 - 252) * curRedMix);

      for (const p of particles) {
        p.x += p.vx * curSpeed * 60 * dt;
        p.y += p.vy * curSpeed * 60 * dt;
        if (p.x < 0) p.x += w;
        if (p.x > w) p.x -= w;
        if (p.y < 0) p.y += h;
        if (p.y > h) p.y -= h;

        const twinkle =
          0.45 + 0.55 * (0.5 + 0.5 * Math.sin(now * 0.001 * p.twinkleSpeed + p.phase));
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${(curOpacity * twinkle).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && rafId === 0) {
        lastFrame = performance.now();
        rafId = window.requestAnimationFrame(render);
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    rafId = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [count]);

  return (
    <canvas
      ref={canvasRef}
      className="rb-particles-canvas"
      aria-hidden="true"
    />
  );
}
