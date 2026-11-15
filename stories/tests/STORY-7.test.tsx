import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../App';

describe('STORY-7: Disable Add to Cart when cart reaches stock limit', () => {
  it('disables Add to Cart and shows Max in Cart at stock limit', async () => {
    const user = userEvent.setup();
    render(<App />);

    // USB-C Hub is the 6th product and has stock: 6
    const addButtons = screen.getAllByRole('button', { name: 'Add to Cart' });
    const usbHubAddBtn = addButtons[5];

    for (let i = 0; i < 6; i++) {
      await user.click(usbHubAddBtn);
    }

    const maxBtn = screen.getByRole('button', { name: /max in cart/i });
    expect(maxBtn).toBeDisabled();
  });
});
