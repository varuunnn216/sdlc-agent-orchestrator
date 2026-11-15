import { useEffect, useState } from 'react';
import './TextType.css';

interface TextTypeProps {
  text: string;
  typingSpeedMs?: number;
  className?: string;
}

export function TextType({
  text,
  typingSpeedMs = 16,
  className = '',
}: TextTypeProps) {
  const [displayed, setDisplayed] = useState<string>(() => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return text;
    }
    return '';
  });
  const [done, setDone] = useState<boolean>(displayed.length === text.length);

  useEffect(() => {
    if (done) return;
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setDisplayed(text.slice(0, index));
      if (index >= text.length) {
        window.clearInterval(timer);
        setDone(true);
      }
    }, typingSpeedMs);

    return () => window.clearInterval(timer);
  }, [text, typingSpeedMs, done]);

  return (
    <span className={`rb-text-type ${className}`.trim()} aria-label={text}>
      <span>{displayed}</span>
      {!done && <span className="rb-text-type-cursor" aria-hidden="true" />}
    </span>
  );
}
