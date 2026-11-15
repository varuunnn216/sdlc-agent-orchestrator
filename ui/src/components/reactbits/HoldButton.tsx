import { useRef, useState, type KeyboardEvent } from 'react';
import './HoldButton.css';

interface HoldButtonProps {
  label?: string;
  holdMs?: number;
  disabled?: boolean;
  onConfirm: () => void;
}

export function HoldButton({
  label = 'Hold to Reject',
  holdMs = 650,
  disabled = false,
  onConfirm,
}: HoldButtonProps) {
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<number | null>(null);

  const stopHold = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setProgress(0);
  };

  const startHold = () => {
    if (disabled || timerRef.current !== null) return;
    const started = performance.now();
    timerRef.current = window.setInterval(() => {
      const ratio = Math.min(1, (performance.now() - started) / holdMs);
      setProgress(ratio);
      if (ratio >= 1) {
        stopHold();
        onConfirm();
      }
    }, 25);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
      e.preventDefault();
      startHold();
    }
  };

  const handleKeyUp = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      stopHold();
    }
  };

  return (
    <button
      type="button"
      className="rb-hold-button"
      disabled={disabled}
      aria-label={`${label} (press and hold)`}
      onPointerDown={startHold}
      onPointerUp={stopHold}
      onPointerLeave={stopHold}
      onPointerCancel={stopHold}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
    >
      <span
        className="rb-hold-fill"
        style={{ width: `${Math.round(progress * 100)}%` }}
        aria-hidden="true"
      />
      <span className="rb-hold-label">{label}</span>
    </button>
  );
}
