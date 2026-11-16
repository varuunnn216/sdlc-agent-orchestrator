import './LogoLoop.css';

interface LogoLoopProps {
  items: string[];
}

export function LogoLoop({ items }: LogoLoopProps) {
  return (
    <div className="rb-logo-loop" aria-label="Technology stack">
      <div className="rb-logo-track">
        {[0, 1].map((dup) => (
          <div
            key={dup}
            className="rb-logo-group"
            aria-hidden={dup === 1}
          >
            {items.map((label) => (
              <span key={`${dup}-${label}`} className="rb-logo-pill">
                <span className="rb-logo-dot" aria-hidden="true" />
                {label}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
