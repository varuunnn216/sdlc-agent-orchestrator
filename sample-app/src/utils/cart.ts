import { CartItem, Product } from '../types';

export const PROMO_CODES: Record<string, number> = {
  SAVE10: 0.1,
  SAVE20: 0.2,
};

export function filterProducts(
  products: Product[],
  query: string,
  category = 'All'
): Product[] {
  const normalizedQuery = query.trim().toLowerCase();
  return products.filter((product) => {
    const matchesCategory = category === 'All' || product.category === category;
    const matchesQuery =
      normalizedQuery === '' ||
      product.name.toLowerCase().includes(normalizedQuery) ||
      product.description.toLowerCase().includes(normalizedQuery);
    return matchesCategory && matchesQuery;
  });
}

export function addToCart(items: CartItem[], product: Product): CartItem[] {
  const existing = items.find((item) => item.product.id === product.id);
  if (existing) {
    return items.map((item) =>
      item.product.id === product.id
        ? { ...item, quantity: Math.min(item.quantity + 1, product.stock) }
        : item
    );
  }
  return [...items, { product, quantity: 1 }];
}

export function updateQuantity(
  items: CartItem[],
  productId: string,
  quantity: number
): CartItem[] {
  if (quantity <= 0) {
    return removeFromCart(items, productId);
  }
  return items.map((item) =>
    item.product.id === productId
      ? { ...item, quantity: Math.min(quantity, item.product.stock) }
      : item
  );
}

export function removeFromCart(items: CartItem[], productId: string): CartItem[] {
  return items.filter((item) => item.product.id !== productId);
}

export function calculateSubtotal(items: CartItem[]): number {
  return items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );
}

export function calculateDiscount(subtotal: number, promoCode: string): number {
  const rate = PROMO_CODES[promoCode.trim().toUpperCase()] ?? 0;
  return Number((subtotal * rate).toFixed(2));
}

export function calculateTotal(items: CartItem[], promoCode = ''): number {
  const subtotal = calculateSubtotal(items);
  const discount = calculateDiscount(subtotal, promoCode);
  return Number(Math.max(0, subtotal - discount).toFixed(2));
}
