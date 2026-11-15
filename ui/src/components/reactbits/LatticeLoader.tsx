import './LatticeLoader.css';

interface LatticeLoaderProps {
  label?: string;
}

export function LatticeLoader({ label = 'Agent running...' }: LatticeLoaderProps) {
  return (
    <div className="rb-lattice-loader" role="status" aria-live="polite">
      <div className="rb-lattice-grid" aria-hidden="true">
        {Array.from({ length: 9 }).map((_, idx) => (
          <span
            key={idx}
            className="rb-lattice-cell"
            style={{ animationDelay: `${(idx % 3) * 140 + Math.floor(idx / 3) * 90}ms` }}
          />
        ))}
      </div>
      <span className="rb-lattice-label">{label}</span>
    </div>
  );
}
