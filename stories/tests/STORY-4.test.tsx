import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../App';

describe('STORY-4: Sort products by price', () => {
  it('sorts products from low to high and high to low', async () => {
    const user = userEvent.setup();
    render(<App />);

    const sortSelect = screen.getByLabelText('Sort products');
    await user.selectOptions(sortSelect, 'Price: Low to High');

    let headings = screen.getAllByRole('heading', { level: 3 }).map((el) => el.textContent);
    expect(headings[0]).toBe('Ceramic Coffee Mug'); // $18

    await user.selectOptions(sortSelect, 'Price: High to Low');
    headings = screen.getAllByRole('heading', { level: 3 }).map((el) => el.textContent);
    expect(headings[0]).toBe('Mechanical Keyboard'); // $120
  });
});
