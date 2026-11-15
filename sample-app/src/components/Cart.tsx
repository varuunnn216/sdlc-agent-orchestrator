import { CartItem } from '../types';
import {
  calculateDiscount,
  calculateSubtotal,
  calculateTotal,
} from '../utils/cart';

interface CartProps {
  items: CartItem[];
  promoCode: string;
  onPromoCodeChange: (code: string) => void;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
}

export function Cart({
  items,
  promoCode,
  onPromoCodeChange,
  onUpdateQuantity,
  onRemoveItem,
}: CartProps) {
  const subtotal = calculateSubtotal(items);
  const discount = calculateDiscount(subtotal, promoCode);
  const total = calculateTotal(items, promoCode);

  return (
    <section className="cart-panel" aria-label="Shopping Cart">
      <h2>Cart ({items.reduce((sum, item) => sum + item.quantity, 0)})</h2>
      {items.length === 0 ? (
        <p className="empty-state">Your cart is empty.</p>
      ) : (
        <>
          <ul className="cart-items">
            {items.map(({ product, quantity }) => (
              <li key={product.id} className="cart-item">
                <div>
                  <strong>{product.name}</strong>
                  <div className="muted">
                    ${product.price.toFixed(2)} each
                  </div>
                </div>
                <div className="cart-controls">
                  <button
                    type="button"
                    aria-label={`Decrease quantity of ${product.name}`}
                    onClick={() => onUpdateQuantity(product.id, quantity - 1)}
                  >
                    -
                  </button>
                  <span data-testid={`qty-${product.id}`}>{quantity}</span>
                  <button
                    type="button"
                    aria-label={`Increase quantity of ${product.name}`}
                    onClick={() => onUpdateQuantity(product.id, quantity + 1)}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="remove-btn"
                    aria-label={`Remove ${product.name}`}
                    onClick={() => onRemoveItem(product.id)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="promo-row">
            <input
              type="text"
              aria-label="Promo code"
              placeholder="Promo code (e.g. SAVE10)"
              value={promoCode}
              onChange={(e) => onPromoCodeChange(e.target.value)}
            />
          </div>

          <div className="totals">
            <div>
              <span>Subtotal</span>
              <span data-testid="cart-subtotal">${subtotal.toFixed(2)}</span>
            </div>
            {discount > 0 && (
              <div className="discount-row">
                <span>Discount</span>
                <span data-testid="cart-discount">-${discount.toFixed(2)}</span>
              </div>
            )}
            <div className="total-row">
              <strong>Total</strong>
              <strong data-testid="cart-total">${total.toFixed(2)}</strong>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
