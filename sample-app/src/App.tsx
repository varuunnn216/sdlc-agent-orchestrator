import { useMemo, useState } from 'react';
import { Cart } from './components/Cart';
import { CheckoutForm } from './components/CheckoutForm';
import { ProductList } from './components/ProductList';
import { SearchBar } from './components/SearchBar';
import { PRODUCTS } from './data/products';
import { CartItem, OrderSummary, Product } from './types';
import {
  addToCart,
  calculateDiscount,
  calculateSubtotal,
  calculateTotal,
  filterProducts,
  removeFromCart,
  updateQuantity,
} from './utils/cart';

export function App() {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [promoCode, setPromoCode] = useState('');
  const [lastOrder, setLastOrder] = useState<OrderSummary | null>(null);

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(PRODUCTS.map((p) => p.category)))],
    []
  );

  const visibleProducts = useMemo(
    () => filterProducts(PRODUCTS, query, selectedCategory),
    [query, selectedCategory]
  );

  const handleAddToCart = (product: Product) => {
    setLastOrder(null);
    setCartItems((prev) => addToCart(prev, product));
  };

  const handleUpdateQuantity = (productId: string, quantity: number) => {
    setCartItems((prev) => updateQuantity(prev, productId, quantity));
  };

  const handleRemoveItem = (productId: string) => {
    setCartItems((prev) => removeFromCart(prev, productId));
  };

  const handlePlaceOrder = (customerName: string, customerEmail: string) => {
    const subtotal = calculateSubtotal(cartItems);
    const discount = calculateDiscount(subtotal, promoCode);
    const total = calculateTotal(cartItems, promoCode);

    setLastOrder({
      orderId: `ORD-${Date.now().toString().slice(-6)}`,
      customerName,
      customerEmail,
      items: cartItems,
      subtotal,
      discount,
      total,
    });
    setCartItems([]);
    setPromoCode('');
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>MockShop</h1>
        <p>Sample React + TypeScript Storefront</p>
      </header>

      <main className="layout">
        <section className="catalog-section">
          <SearchBar
            query={query}
            onQueryChange={setQuery}
            categories={categories}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
          />
          <ProductList
            products={visibleProducts}
            onAddToCart={handleAddToCart}
          />
        </section>

        <aside className="sidebar">
          <Cart
            items={cartItems}
            promoCode={promoCode}
            onPromoCodeChange={setPromoCode}
            onUpdateQuantity={handleUpdateQuantity}
            onRemoveItem={handleRemoveItem}
          />
          <CheckoutForm
            disabled={cartItems.length === 0}
            onSubmitOrder={handlePlaceOrder}
          />
          {lastOrder && (
            <div className="order-confirmation" role="status">
              <h3>Order Confirmed</h3>
              <p>
                Thank you, <strong>{lastOrder.customerName}</strong>! Order{' '}
                <code>{lastOrder.orderId}</code> total: $
                {lastOrder.total.toFixed(2)}
              </p>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}

export default App;
