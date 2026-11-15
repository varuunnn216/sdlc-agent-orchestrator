import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../App';

describe('STORY-6: Invalid promo code feedback', () => {
  it('shows Invalid promo code when an unknown code is entered', async () => {
    const user = userEvent.setup();
    render(<App />);

    const addButtons = screen.getAllByRole('button', { name: 'Add to Cart' });
    await user.click(addButtons[0]);

    const promoInput = screen.getByLabelText('Promo code');
    await user.type(promoInput, 'BOGUS');
    expect(screen.getByText(/invalid promo code/i)).toBeInTheDocument();

    await user.clear(promoInput);
    await user.type(promoInput, 'SAVE10');
    expect(screen.queryByText(/invalid promo code/i)).not.toBeInTheDocument();
  });
});
