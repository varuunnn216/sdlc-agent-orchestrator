import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../App';

describe('STORY-1: Clear Cart button', () => {
  it('empties the cart and resets promo code when Clear Cart is clicked', async () => {
    const user = userEvent.setup();
    render(<App />);

    const addButtons = screen.getAllByRole('button', { name: 'Add to Cart' });
    await user.click(addButtons[0]);

    const promoInput = screen.getByLabelText('Promo code');
    await user.type(promoInput, 'SAVE10');

    const clearBtn = screen.getByRole('button', { name: /clear cart/i });
    await user.click(clearBtn);

    expect(screen.getByText('Your cart is empty.')).toBeInTheDocument();
  });
});
