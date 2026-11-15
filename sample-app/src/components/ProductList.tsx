import { Product } from '../types';

interface ProductListProps {
  products: Product[];
  onAddToCart: (product: Product) => void;
}

export function ProductList({ products, onAddToCart }: ProductListProps) {
  if (products.length === 0) {
    return <p className="empty-state">No products match your search.</p>;
  }

  return (
    <div className="product-grid" data-testid="product-list">
      {products.map((product) => (
        <article key={product.id} className="product-card">
          <div className="product-header">
            <h3>{product.name}</h3>
            <span className="badge">{product.category}</span>
          </div>
          <p className="description">{product.description}</p>
          <div className="product-footer">
            <span className="price">${product.price.toFixed(2)}</span>
            <button
              type="button"
              onClick={() => onAddToCart(product)}
              disabled={product.stock === 0}
            >
              {product.stock === 0 ? 'Out of Stock' : 'Add to Cart'}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
