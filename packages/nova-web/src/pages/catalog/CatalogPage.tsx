/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { catalog } from '../../api/client';
import type { Category, ServiceItem } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';
import SearchBar from '../../components/SearchBar';
import { useCart } from '../../context/CartContext';
import { catalogPictureFrameBaseClass } from './catalogPictureFrame';

function CatalogImage({ itemId }: { itemId: string }) {
  const [src, setSrc] = useState<string>('');
  useEffect(() => {
    const token = localStorage.getItem('nova_token');
    fetch(`/api/catalog/items/${itemId}/picture`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => { if (res.ok) return res.blob(); throw new Error(); })
      .then((blob) => setSrc(URL.createObjectURL(blob)))
      .catch(() => {});
    return () => { if (src) URL.revokeObjectURL(src); };
  }, [itemId]);
  if (!src) return null;
  return (
    <div className={`w-full h-36 -mx-5 -mt-5 mb-3 rounded-t-xl ${catalogPictureFrameBaseClass}`}>
      <img src={src} className="max-w-full max-h-full object-contain" alt="" />
    </div>
  );
}

export default function CatalogPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<ServiceItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const { cartCount } = useCart();

  useEffect(() => {
    catalog.categories().then((res) => {
      setCategories(res.categories);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    catalog.items(activeCategory || undefined).then((res) => setItems(res.items));
  }, [activeCategory]);

  const filteredItems = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.short_description && item.short_description.toLowerCase().includes(q)) ||
        (item.category_name && item.category_name.toLowerCase().includes(q)),
    );
  }, [items, search]);

  if (loading) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Service Catalog"
        description="Browse available services and add items to your cart."
        action={
          <Link
            to="/cart"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1H14a1 1 0 00.894-.553l3-6A1 1 0 0017 3H6.28l-.31-1.243A1 1 0 005 1H3zM16 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM6.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
            </svg>
            Cart
            {cartCount > 0 && (
              <span className="bg-white text-indigo-700 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </Link>
        }
      />

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="w-full sm:w-80">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search services..."
          />
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <button
            onClick={() => setActiveCategory(null)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              !activeCategory
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                activeCategory === cat.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          {search ? `No services matching "${search}"` : 'No services available.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((item) => (
            <Link key={item.id} to={`/catalog/${item.id}`} className="block group">
              <Card className="hover:shadow-md hover:border-indigo-200 transition-all overflow-hidden cursor-pointer">
                {item.picture_storage_key && (
                  <CatalogImage itemId={item.id} />
                )}
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{item.name}</h3>
                    <p className="text-xs text-indigo-500 mt-0.5">{item.category_name}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    {item.price != null && (
                      <span className="text-sm font-semibold text-green-700">${Number(item.price).toFixed(2)}</span>
                    )}
                    {item.approval_required && (
                      <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                        Manager approval
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-sm text-gray-500 mt-2">{item.short_description}</p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs text-gray-400">SLA: {item.sla_hours}h</span>
                  <span className="text-sm font-medium text-indigo-600 group-hover:text-indigo-700">
                    Open item
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
