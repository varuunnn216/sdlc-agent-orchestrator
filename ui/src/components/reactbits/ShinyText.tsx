import './ShinyText.css';

interface ShinyTextProps {
  text: string;
  className?: string;
}

export function ShinyText({ text, className = '' }: ShinyTextProps) {
  return <span className={`rb-shiny-text ${className}`.trim()}>{text}</span>;
}
