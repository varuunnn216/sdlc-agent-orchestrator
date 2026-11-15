import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../App';

describe('STORY-3: Low Stock badge', () => {
  it('shows Low stock badge only for products with stock <= 6', () => {
    render(<App />);
    // USB-C Hub has stock: 6, all other mock products have stock >= 8
    const badges = screen.getAllByText(/low stock/i);
    expect(badges).toHaveLength(1);
  });
});
