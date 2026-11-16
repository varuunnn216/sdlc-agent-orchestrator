import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CallChip, formatDuration, formatTokens } from './CallChip';
import { ThoughtLine } from './ThoughtLine';

describe('ThoughtLine markdown rendering', () => {
  it('renders **bold** as <strong> and `code` as <code> without literal asterisks or backticks', () => {
    const planText = [
      'Here is a 3-5 bullet implementation plan:',
      '',
      '- **Inspect Cart**: Read `src/utils/cart.ts` to find the subtotal loop.',
      '- **Fix calculation**: Multiply `item.price` by `item.quantity`.',
    ].join('\n');

    const { container } = render(<ThoughtLine label="Plan" content={planText} />);
    const panel = screen.getByTestId('thought-line-panel');

    expect(panel.textContent).not.toContain('**');
    expect(panel.textContent).not.toContain('`');
    expect(panel.textContent).not.toContain('Here is a 3-5 bullet implementation plan:');

    const strongs = Array.from(container.querySelectorAll('strong')).map((el) => el.textContent);
    expect(strongs).toEqual(['Inspect Cart', 'Fix calculation']);

    const codes = Array.from(container.querySelectorAll('code')).map((el) => el.textContent);
    expect(codes).toEqual(['src/utils/cart.ts', 'item.price', 'item.quantity']);

    expect(container.querySelectorAll('ul li').length).toBe(2);
  });
});

describe('CallChip metric formatting and collapsible JSON', () => {
  it('formats milliseconds, seconds, and tokens cleanly', () => {
    expect(formatDuration(2)).toBe('2 ms');
    expect(formatDuration(999)).toBe('999 ms');
    expect(formatDuration(1000)).toBe('1.0 s');
    expect(formatDuration(15380)).toBe('15.4 s');
    expect(formatTokens(533)).toBe('533 tokens');
    expect(formatTokens(856)).toBe('856 tokens');
  });

  it('renders formatted metrics and collapses JSON longer than 8 lines', () => {
    const longArgs = {
      a: 1,
      b: 2,
      c: 3,
      d: 4,
      e: 5,
      f: 6,
      g: 7,
      h: 8,
      i: 9,
    };

    render(
      <ul>
        <CallChip
          phase="implement"
          tool="write_file"
          args={longArgs}
          result={{ ok: true }}
          durationMs={15380}
          tokens={533}
        />
      </ul>
    );

    expect(screen.getByText('15.4 s')).toBeTruthy();
    expect(screen.getByText('533 tokens')).toBeTruthy();
    const toggle = screen.getByRole('button', { name: /Show more/i });
    expect(toggle).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: /Show less/i })).toBeTruthy();
  });
});
