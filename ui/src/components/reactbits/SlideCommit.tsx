import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import './SlideCommit.css';

interface SlideCommitProps {
  label?: string;
  disabled?: boolean;
  onCommit: () => void;
}

export function SlideCommit({
  label = 'Slide to Approve',
  disabled = false,
  onCommit,
}: SlideCommitProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);

  const handlePointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };

  const handlePointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (!dragging || disabled || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const maxTravel = Math.max(1, rect.width - 36);
    const offset = Math.min(maxTravel, Math.max(0, e.clientX - rect.left - 18));
    setProgress(offset / maxTravel);
  };

  const handlePointerUp = () => {
    if (!dragging) return;
    setDragging(false);
    if (progress >= 0.82 && !disabled) {
      setProgress(0);
      onCommit();
    } else {
      setProgress(0);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onCommit();
    }
  };

  return (
    <div
      ref={trackRef}
      data-spark="true"
      className={`rb-slide-commit ${disabled ? 'is-disabled' : ''}`.trim()}
    >
      <div
        className="rb-slide-fill"
        style={{ width: `${Math.round(progress * 100)}%` }}
        aria-hidden="true"
      />
      <span className="rb-slide-label">{label}</span>
      <button
        type="button"
        className="rb-slide-thumb"
        disabled={disabled}
        aria-label={`${label} (drag right or press Enter)`}
        style={{ transform: `translateX(${progress * 174}px)` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
      >
        →
      </button>
    </div>
  );
}
