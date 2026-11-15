import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../App';

describe('STORY-2: Free shipping threshold progress', () => {
  it('shows remaining amount below $100 and unlocked message at $100+', async () => {
    const user = userEvent.setup();
    render(<App />);

    const addButtons = screen.getAllByRole('button', { name: 'Add to Cart' });
    await user.click(addButtons[1]); // Wireless Mouse ($45)
    expect(
      screen.getByText(/Add \$55\.00 more for free shipping/i)
    ).toBeInTheDocument();

    await user.click(addButtons[0]); // Mechanical Keyboard ($120 -> $165)
    expect(screen.getByText(/Free shipping unlocked!/i)).toBeInTheDocument();
  });
});
