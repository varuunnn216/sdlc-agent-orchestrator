interface SearchBarProps {
  query: string;
  onQueryChange: (value: string) => void;
  categories: string[];
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
}

export function SearchBar({
  query,
  onQueryChange,
  categories,
  selectedCategory,
  onCategoryChange,
}: SearchBarProps) {
  return (
    <div className="search-bar">
      <input
        type="search"
        aria-label="Search products"
        placeholder="Search products..."
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
      />
      <select
        aria-label="Filter by category"
        value={selectedCategory}
        onChange={(e) => onCategoryChange(e.target.value)}
      >
        {categories.map((category) => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
      </select>
    </div>
  );
}
