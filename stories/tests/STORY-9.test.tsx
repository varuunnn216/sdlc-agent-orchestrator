import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../App';

describe('STORY-9: Itemized order confirmation', () => {
  it('displays customer email and itemized products in order confirmation', async () => {
    const user = userEvent.setup();
    render(<App />);

    const addButtons = screen.getAllByRole('button', { name: 'Add to Cart' });
    await user.click(addButtons[0]);
    await user.click(
      screen.getByLabelText('Increase quantity of Mechanical Keyboard')
    );

    await user.type(screen.getByPlaceholderText('Jane Doe'), 'Bob Lee');
    await user.type(
      screen.getByPlaceholderText('jane@example.com'),
      'bob@example.com'
    );
    await user.click(screen.getByRole('button', { name: 'Place Order' }));

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('bob@example.com');
    expect(status).toHaveTextContent(/Mechanical Keyboard\s*x\s*2/i);
  });
});
