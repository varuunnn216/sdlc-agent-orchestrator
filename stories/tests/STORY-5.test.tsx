import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../App';

describe('STORY-5: Reset Filters button', () => {
  it('clears search query and resets category to All', async () => {
    const user = userEvent.setup();
    render(<App />);

    const searchInput = screen.getByLabelText('Search products') as HTMLInputElement;
    const categorySelect = screen.getByLabelText('Filter by category') as HTMLSelectElement;

    await user.type(searchInput, 'mug');
    await user.selectOptions(categorySelect, 'Kitchen');
    expect(screen.queryByText('Mechanical Keyboard')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /reset filters/i }));

    expect(searchInput.value).toBe('');
    expect(categorySelect.value).toBe('All');
    expect(screen.getByText('Mechanical Keyboard')).toBeInTheDocument();
  });
});
