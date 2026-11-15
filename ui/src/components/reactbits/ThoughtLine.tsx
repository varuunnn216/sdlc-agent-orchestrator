import './ThoughtLine.css';

interface ThoughtLineProps {
  label?: string;
  content: string;
}

export function ThoughtLine({ label = 'Plan', content }: ThoughtLineProps) {
  return (
    <div className="rb-thought-line">
      <span className="rb-thought-line-label">{label}</span>
      <pre className="rb-thought-line-body">{content}</pre>
    </div>
  );
}
