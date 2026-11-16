import { type KeyboardEvent, type ReactNode } from 'react';
import { useRipple } from './Ripple';
import './AnimatedList.css';

interface AnimatedListProps<T extends { id: string }> {
  items: T[];
  selectedId: string;
  onSelect: (id: string) => void;
  renderItem: (item: T, isSelected: boolean) => ReactNode;
  ariaLabel: string;
}

function AnimatedListItem({
  isSelected,
  delayMs,
  onSelect,
  children,
}: {
  isSelected: boolean;
  delayMs: number;
  onSelect: () => void;
  children: ReactNode;
}) {
  const { trigger, rippleLayer } = useRipple();
  return (
    <li
      role="option"
      aria-selected={isSelected}
      className={`rb-animated-list-item ${isSelected ? 'selected' : ''}`.trim()}
      style={{ animationDelay: `${delayMs}ms` }}
      onPointerDown={trigger}
      onClick={onSelect}
    >
      {children}
      {rippleLayer}
    </li>
  );
}

export function AnimatedList<T extends { id: string }>({
  items,
  selectedId,
  onSelect,
  renderItem,
  ariaLabel,
}: AnimatedListProps<T>) {
  const handleKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    if (items.length === 0) return;
    const currentIndex = Math.max(
      0,
      items.findIndex((i) => i.id === selectedId)
    );
    let nextIndex = currentIndex;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = Math.min(items.length - 1, currentIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = Math.max(0, currentIndex - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = items.length - 1;
    } else {
      return;
    }
    const target = items[nextIndex];
    if (target) {
      onSelect(target.id);
    }
  };

  return (
    <ul
      className="rb-animated-list"
      role="listbox"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {items.map((item, idx) => {
        const isSelected = item.id === selectedId;
        return (
          <AnimatedListItem
            key={item.id}
            isSelected={isSelected}
            delayMs={Math.min(idx, 10) * 18}
            onSelect={() => onSelect(item.id)}
          >
            {renderItem(item, isSelected)}
          </AnimatedListItem>
        );
      })}
    </ul>
  );
}
