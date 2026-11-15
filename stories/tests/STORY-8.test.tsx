import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';

describe('STORY-8: Persist cart in localStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves cart to localStorage and restores it on remount', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);

    const addButtons = screen.getAllByRole('button', { name: 'Add to Cart' });
    await user.click(addButtons[0]); // Mechanical Keyboard

    const stored = localStorage.getItem('mockshop_cart');
    expect(stored).not.toBeNull();
    expect(stored).toContain('Mechanical Keyboard');

    unmount();
    render(<App />);

    expect(screen.getByTestId('cart-total')).toHaveTextContent('$120.00');
  });
});
