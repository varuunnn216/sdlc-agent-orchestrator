import { describe, expect, it } from 'vitest';
import { PRODUCTS } from '../data/products';
import {
  addToCart,
  calculateDiscount,
  calculateSubtotal,
  calculateTotal,
  filterProducts,
  removeFromCart,
  updateQuantity,
} from '../utils/cart';

describe('cart and catalog utilities', () => {
  it('filters products case-insensitively by query and category', () => {
    const byQuery = filterProducts(PRODUCTS, 'KEYBOARD');
    expect(byQuery).toHaveLength(1);
    expect(byQuery[0].id).toBe('prod-1');

    const byCategory = filterProducts(PRODUCTS, '', 'Kitchen');
    expect(byCategory).toHaveLength(1);
    expect(byCategory[0].name).toBe('Ceramic Coffee Mug');
  });

  it('adds items and increments quantity without exceeding stock', () => {
    const mouse = PRODUCTS[1]; // price: 45, stock: 15
    let cart = addToCart([], mouse);
    cart = addToCart(cart, mouse);
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(2);

    cart = updateQuantity(cart, mouse.id, 999);
    expect(cart[0].quantity).toBe(mouse.stock);
  });

  it('removes item when quantity is set to zero or less', () => {
    const mug = PRODUCTS[3];
    let cart = addToCart([], mug);
    cart = updateQuantity(cart, mug.id, 0);
    expect(cart).toHaveLength(0);

    cart = addToCart([], mug);
    cart = removeFromCart(cart, mug.id);
    expect(cart).toHaveLength(0);
  });

  it('calculates subtotal, promo discount, and total accurately', () => {
    const keyboard = PRODUCTS[0]; // 120
    const mouse = PRODUCTS[1]; // 45
    let cart = addToCart([], keyboard);
    cart = updateQuantity(cart, keyboard.id, 2); // 240
    cart = addToCart(cart, mouse); // +45 = 285

    expect(calculateSubtotal(cart)).toBe(285);
    expect(calculateDiscount(285, 'SAVE10')).toBe(28.5);
    expect(calculateTotal(cart, 'SAVE10')).toBe(256.5);
    expect(calculateTotal(cart, 'INVALID')).toBe(285);
  });
});
