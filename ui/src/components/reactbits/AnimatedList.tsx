import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import './AnimatedList.css';

interface AnimatedListProps<T extends { id: string }> {
  items: T[];
  selectedId: string;
  onSelect: (id: string) => void;
  renderItem: (item: T, isSelected: boolean) => ReactNode;
  ariaLabel: string;
}

export function AnimatedList<T extends { id: string }>({
  items,
  selectedId,
  onSelect,
  renderItem,
  ariaLabel,
}: AnimatedListProps<T>) {
  const itemRefs = useRef<Array<HTMLLIElement | null>>([]);

  const handleKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    if (items.length === 0) return;
    const currentIndex = Math.max(
      0,
      items.findIndex((i) => i.id === selectedId)
    );

    let nextIndex = -1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = (currentIndex + 1) % items.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = (currentIndex - 1 + items.length) % items.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = items.length - 1;
    }

    if (nextIndex >= 0) {
      const next = items[nextIndex];
      onSelect(next.id);
      itemRefs.current[nextIndex]?.focus();
    }
  };

  return (
    <ul
      className="rb-animated-list"
      role="listbox"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
    >
      {items.map((item, idx) => {
        const isSelected = item.id === selectedId;
        return (
          <li
            key={item.id}
            ref={(el) => {
              itemRefs.current[idx] = el;
            }}
            role="option"
            aria-selected={isSelected}
            tabIndex={isSelected || (idx === 0 && !selectedId) ? 0 : -1}
            className={`rb-animated-list-item ${isSelected ? 'selected' : ''}`.trim()}
            style={{ animationDelay: `${Math.min(idx, 8) * 18}ms` }}
            onClick={() => onSelect(item.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(item.id);
              }
            }}
          >
            {renderItem(item, isSelected)}
          </li>
        );
      })}
    </ul>
  );
}
