import { FormEvent, useState } from 'react';

interface CheckoutFormProps {
  disabled: boolean;
  onSubmitOrder: (customerName: string, customerEmail: string) => void;
}

export function CheckoutForm({ disabled, onSubmitOrder }: CheckoutFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.includes('@')) {
      setError('Please enter a valid name and email address.');
      return;
    }
    setError('');
    onSubmitOrder(name.trim(), email.trim());
    setName('');
    setEmail('');
  };

  return (
    <form className="checkout-form" onSubmit={handleSubmit} aria-label="Checkout">
      <h3>Checkout</h3>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <label>
        Name
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jane Doe"
          disabled={disabled}
        />
      </label>
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jane@example.com"
          disabled={disabled}
        />
      </label>
      <button type="submit" disabled={disabled}>
        Place Order
      </button>
    </form>
  );
}
