import Markdown from 'react-markdown';
import './ThoughtLine.css';

interface ThoughtLineProps {
  label?: string;
  content: string;
}

export function normalizePlanMarkdown(raw: string): string {
  const trimmed = raw.trim();
  // Strip a purely filler leading intro line such as "Here is a 3-5 bullet implementation plan:"
  return trimmed.replace(
    /^(?:here(?:'s| is)\s+(?:a|the|my)?\s*(?:\d+(?:\s*[-–]\s*\d+)?\s*(?:bullet|step|point)s?\s*)?(?:concise\s+)?(?:implementation\s+)?plan(?:\s+for\s+[^:\n]+)?\s*:?)\s*\n+/i,
    ''
  );
}

export function ThoughtLine({ label = 'Plan', content }: ThoughtLineProps) {
  const normalized = normalizePlanMarkdown(content);

  return (
    <div className="rb-thought-line" data-testid="thought-line-panel">
      <div className="rb-thought-line-label">{label}</div>
      <div className="rb-thought-line-body">
        <Markdown>{normalized}</Markdown>
      </div>
    </div>
  );
}
