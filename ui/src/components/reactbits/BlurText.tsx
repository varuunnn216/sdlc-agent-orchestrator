import './BlurText.css';

interface BlurTextProps {
  text: string;
  delayStepMs?: number;
  className?: string;
}

export function BlurText({
  text,
  delayStepMs = 55,
  className = '',
}: BlurTextProps) {
  const words = text.split(' ');
  return (
    <span className={`rb-blur-text ${className}`.trim()}>
      {words.map((word, idx) => (
        <span
          key={`${word}-${idx}`}
          className="rb-blur-word"
          style={{ animationDelay: `${idx * delayStepMs}ms` }}
        >
          {word}
        </span>
      ))}
    </span>
  );
}
