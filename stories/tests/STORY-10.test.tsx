import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../App';

describe('STORY-10: Automatic 5% bulk discount for 5+ items', () => {
  it('applies 5% bulk discount before promo code when total quantity >= 5', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Ceramic Coffee Mug ($18) is index 3
    const addButtons = screen.getAllByRole('button', { name: 'Add to Cart' });
    for (let i = 0; i < 5; i++) {
      await user.click(addButtons[3]);
    }

    // Subtotal = 5 * 18 = 90.00
    // Bulk discount 5% = 4.50 -> 85.50
    expect(screen.getByText(/Bulk discount \(5%\)/i)).toBeInTheDocument();
    expect(screen.getByTestId('cart-total')).toHaveTextContent('$85.50');

    // Promo SAVE10 on 85.50 = 8.55 -> 76.95
    await user.type(screen.getByLabelText('Promo code'), 'SAVE10');
    expect(screen.getByTestId('cart-total')).toHaveTextContent('$76.95');
  });
});
