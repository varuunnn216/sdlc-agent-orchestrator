import { useEffect, useRef, useState, type ReactNode } from 'react';
import './FadeContent.css';

interface FadeContentProps {
  children: ReactNode;
  className?: string;
  delayMs?: number;
  onScroll?: boolean;
}

export function FadeContent({
  children,
  className = '',
  delayMs = 0,
  onScroll = false,
}: FadeContentProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(!onScroll);

  useEffect(() => {
    if (!onScroll || visible) return;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setVisible(true);
      return;
    }

    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -24px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onScroll, visible]);

  if (!onScroll) {
    return (
      <div
        className={`rb-fade-content ${className}`.trim()}
        style={delayMs ? { animationDelay: `${delayMs}ms` } : undefined}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={`rb-scroll-reveal ${visible ? 'visible' : ''} ${className}`.trim()}
      style={delayMs && visible ? { transitionDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </div>
  );
}
