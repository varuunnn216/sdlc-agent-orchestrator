import type { ReactNode } from 'react';
import { SpotlightCard } from './SpotlightCard';
import './MagicBento.css';

export interface BentoItem {
  id: string;
  step: string;
  title: string;
  description: string;
  icon: ReactNode;
}

interface MagicBentoProps {
  items: BentoItem[];
}

export function MagicBento({ items }: MagicBentoProps) {
  return (
    <div className="rb-magic-bento" role="list">
      {items.map((item) => (
        <SpotlightCard key={item.id} className="rb-bento-card" as="div">
          <div className="rb-bento-top" role="listitem">
            <span className="rb-bento-icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="rb-bento-step">{item.step}</span>
          </div>
          <h3 className="rb-bento-title">{item.title}</h3>
          <p className="rb-bento-desc">{item.description}</p>
        </SpotlightCard>
      ))}
    </div>
  );
}
