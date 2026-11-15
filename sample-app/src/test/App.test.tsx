import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../App';

describe('MockShop App', () => {
  it('renders products and filters by search query', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByText('Mechanical Keyboard')).toBeInTheDocument();
    expect(screen.getByText('Desk Lamp')).toBeInTheDocument();

    const searchInput = screen.getByLabelText('Search products');
    await user.type(searchInput, 'lamp');

    expect(screen.getByText('Desk Lamp')).toBeInTheDocument();
    expect(screen.queryByText('Mechanical Keyboard')).not.toBeInTheDocument();

    await user.clear(searchInput);
    await user.type(searchInput, 'nonexistent-item-xyz');
    expect(screen.getByText('No products match your search.')).toBeInTheDocument();
  });

  it('adds items to cart, updates quantity, and applies promo code', async () => {
    const user = userEvent.setup();
    render(<App />);

    const addButtons = screen.getAllByRole('button', { name: 'Add to Cart' });
    await user.click(addButtons[0]); // Mechanical Keyboard ($120)

    expect(screen.getByTestId('cart-total')).toHaveTextContent('$120.00');

    await user.click(
      screen.getByLabelText('Increase quantity of Mechanical Keyboard')
    );
    expect(screen.getByTestId('qty-prod-1')).toHaveTextContent('2');
    expect(screen.getByTestId('cart-subtotal')).toHaveTextContent('$240.00');

    const promoInput = screen.getByLabelText('Promo code');
    await user.type(promoInput, 'SAVE10');
    expect(screen.getByTestId('cart-discount')).toHaveTextContent('-$24.00');
    expect(screen.getByTestId('cart-total')).toHaveTextContent('$216.00');
  });

  it('validates checkout and displays order confirmation', async () => {
    const user = userEvent.setup();
    render(<App />);

    const addButtons = screen.getAllByRole('button', { name: 'Add to Cart' });
    await user.click(addButtons[1]); // Wireless Mouse ($45)

    await user.click(screen.getByRole('button', { name: 'Place Order' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Please enter a valid name and email address.'
    );

    await user.type(screen.getByPlaceholderText('Jane Doe'), 'Alice Smith');
    await user.type(
      screen.getByPlaceholderText('jane@example.com'),
      'alice@example.com'
    );
    await user.click(screen.getByRole('button', { name: 'Place Order' }));

    expect(screen.getByRole('status')).toHaveTextContent('Order Confirmed');
    expect(screen.getByRole('status')).toHaveTextContent('Alice Smith');
    expect(screen.getByText('Your cart is empty.')).toBeInTheDocument();
  });
});
