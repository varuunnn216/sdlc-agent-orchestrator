import './SplitText.css';

interface SplitTextProps {
  text: string;
  staggerMs?: number;
  className?: string;
}

export function SplitText({
  text,
  staggerMs = 16,
  className = '',
}: SplitTextProps) {
  let charIndex = 0;
  const words = text.split(' ');

  return (
    <span className={`rb-split-text ${className}`.trim()} aria-label={text}>
      <span aria-hidden="true">
        {words.map((word, wordIdx) => {
          const chars = word.split('').map((ch) => {
            const idx = charIndex++;
            return (
              <span
                key={idx}
                className="rb-split-char"
                style={{ animationDelay: `${idx * staggerMs}ms` }}
              >
                {ch}
              </span>
            );
          });
          charIndex++;
          return (
            <span key={wordIdx}>
              <span style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>
                {chars}
              </span>
              {wordIdx < words.length - 1 ? ' ' : null}
            </span>
          );
        })}
      </span>
    </span>
  );
}
