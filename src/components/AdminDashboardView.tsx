import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Edit3,
  Package,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react';
import {
  createProduct,
  deleteProduct,
  fetchAdminStats,
  fetchOrders,
  fetchProducts,
  updateOrderStatus,
  updateProduct,
  type ProductPayload,
} from '../utils/api.ts';
import { formatDateId, formatRupiah, ORDER_STATUS_META } from '../utils/format.ts';
import type {
  AdminStats,
  GameName,
  Order,
  OrderStatus,
  Product,
  ProductCategory,
} from '../types.ts';

interface AdminDashboardViewProps {
  onProductsChanged: () => void;
}

const EMPTY_FORM: ProductPayload = {
  name: '',
  game: 'Mobile Legends',
  category: 'topup',
  rankTier: '',
  price: 20000,
  unitLabel: '',
  description: '',
  isPopular: false,
  isActive: true,
};

export function AdminDashboardView({ onProductsChanged }: AdminDashboardViewProps) {
  const [activeTab, setActiveTab] = useState<'products' | 'orders'>('products');
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ProductCategory>('all');

  // Product Form Modal
  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formState, setFormState] = useState<ProductPayload>(EMPTY_FORM);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Inline Delete Confirmation Modal
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // Order Status Updating ID
  const [updatingOrderId, setUpdatingOrderId] = useState<number | null>(null);

  const loadDashboardData = async () => {
    setLoading(true);
    setError('');
    try {
      const [productsData, ordersData, statsData] = await Promise.all([
        fetchProducts(true),
        fetchOrders(),
        fetchAdminStats(),
      ]);
      setProducts(productsData);
      setOrders(ordersData);
      setStats(statsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data panel admin.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboardData();
  }, []);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.game.toLowerCase().includes(q) ||
        p.rankTier.toLowerCase().includes(q)
      );
    });
  }, [products, searchQuery, categoryFilter]);

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return orders.filter((o) => {
      if (!q) return true;
      return (
        o.orderCode.toLowerCase().includes(q) ||
        o.productName.toLowerCase().includes(q) ||
        o.game.toLowerCase().includes(q) ||
        (o.userName ?? '').toLowerCase().includes(q) ||
        (o.userEmail ?? '').toLowerCase().includes(q)
      );
    });
  }, [orders, searchQuery]);

  const openCreateModal = () => {
    setEditingProduct(null);
    setFormState(EMPTY_FORM);
    setFormError('');
    setFormOpen(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setFormState({
      name: product.name,
      game: product.game,
      category: product.category,
      rankTier: product.rankTier,
      price: product.price,
      unitLabel: product.unitLabel,
      description: product.description,
      isPopular: product.isPopular,
      isActive: product.isActive,
    });
    setFormError('');
    setFormOpen(true);
  };

  const handleSaveProduct = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSubmitting(true);
    try {
      if (editingProduct) {
        await updateProduct(editingProduct.id, formState);
      } else {
        await createProduct(formState);
      }
      setFormOpen(false);
      await loadDashboardData();
      onProductsChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal menyimpan produk.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingProduct) return;
    setDeleteSubmitting(true);
    try {
      await deleteProduct(deletingProduct.id);
      setDeletingProduct(null);
      await loadDashboardData();
      onProductsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus produk.');
      setDeletingProduct(null);
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handleStatusChange = async (orderId: number, status: OrderStatus) => {
    setUpdatingOrderId(orderId);
    try {
      const updated = await updateOrderStatus(orderId, status);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      const refreshedStats = await fetchAdminStats();
      setStats(refreshedStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengubah status pesanan.');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <p className="text-xs font-medium text-amber-400">Panel Administrator</p>
          <h1 className="mt-1 font-display text-2xl sm:text-3xl font-bold text-white">
            Manajemen Produk & Pesanan
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Kelola katalog top-up, tarif joki Mobile Legends, dan seluruh pesanan pelanggan.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 transition-colors whitespace-nowrap self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Produk</span>
        </button>
      </div>

      {/* 4-Column KPI Strip */}
      <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-white/10 bg-[#121620] p-4">
          <p className="text-xs font-medium text-slate-400">Total Pendapatan</p>
          <p className="mt-1.5 font-mono text-lg sm:text-xl font-bold text-white tabular-nums">
            {stats ? formatRupiah(stats.totalRevenue) : '—'}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#121620] p-4">
          <p className="text-xs font-medium text-slate-400">Total Pesanan</p>
          <p className="mt-1.5 font-mono text-lg sm:text-xl font-bold text-white tabular-nums">
            {stats ? stats.totalOrders : '—'}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#121620] p-4">
          <p className="text-xs font-medium text-slate-400">Perlu Diproses</p>
          <p className="mt-1.5 font-mono text-lg sm:text-xl font-bold text-amber-400 tabular-nums">
            {stats ? stats.pendingOrders : '—'}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#121620] p-4">
          <p className="text-xs font-medium text-slate-400">Produk Aktif</p>
          <p className="mt-1.5 font-mono text-lg sm:text-xl font-bold text-emerald-400 tabular-nums">
            {stats ? stats.activeProducts : '—'}
          </p>
        </div>
      </div>

      {/* Sub-navigation & Search */}
      <div className="mt-6 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-[#121620] p-1 self-start">
          <button
            type="button"
            onClick={() => setActiveTab('products')}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'products'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Kelola Produk ({products.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'orders'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            <span>Semua Pesanan ({orders.length})</span>
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {activeTab === 'products' && (
            <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-[#121620] p-1">
              {(
                [
                  { id: 'all', label: 'Semua' },
                  { id: 'topup', label: 'Top-Up' },
                  { id: 'joki', label: 'Joki ML' },
                ] as const
              ).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryFilter(cat.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    categoryFilter === cat.id
                      ? 'bg-white/10 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          )}

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                activeTab === 'products' ? 'Cari produk atau game...' : 'Cari kode / pelanggan...'
              }
              className="w-full rounded-xl border border-white/10 bg-[#121620] pl-10 pr-4 py-2 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-6 flex items-center gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="mt-6 space-y-3">
          {[1, 2, 3, 4].map((idx) => (
            <div
              key={idx}
              className="h-16 rounded-xl border border-white/10 bg-[#121620] animate-pulse"
            />
          ))}
        </div>
      ) : activeTab === 'products' ? (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-white/10 bg-[#121620]">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-white/10 bg-[#0E1118] text-xs font-semibold text-slate-400">
              <tr>
                <th className="px-4 py-3.5">Produk / Layanan</th>
                <th className="px-4 py-3.5">Game & Kategori</th>
                <th className="px-4 py-3.5">Satuan</th>
                <th className="px-4 py-3.5 text-right">Harga</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {filteredProducts.map((product) => (
                <tr key={product.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3.5">
                    <p className="font-medium text-white">{product.name}</p>
                    {product.rankTier && (
                      <p className="text-xs text-amber-400 mt-0.5">Tier: {product.rankTier}</p>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-slate-300">
                    {product.game} · {product.category === 'joki' ? 'Joki ML' : 'Top-Up'}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-slate-400">{product.unitLabel}</td>
                  <td className="px-4 py-3.5 text-right font-mono font-semibold text-white tabular-nums">
                    {formatRupiah(product.price)}
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`text-xs font-medium ${
                        product.isActive ? 'text-emerald-400' : 'text-slate-500'
                      }`}
                    >
                      {product.isActive ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(product)}
                        className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-[#0B0D12] px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:border-amber-400/50 transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Ubah</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingProduct(product)}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-500/25 bg-rose-500/10 px-2.5 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/20 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Hapus</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                    Tidak ada produk yang cocok dengan filter pencarian.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-white/10 bg-[#121620]">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-white/10 bg-[#0E1118] text-xs font-semibold text-slate-400">
              <tr>
                <th className="px-4 py-3.5">Kode & Waktu</th>
                <th className="px-4 py-3.5">Pelanggan</th>
                <th className="px-4 py-3.5">Layanan & Target Akun</th>
                <th className="px-4 py-3.5">Pembayaran</th>
                <th className="px-4 py-3.5 text-right">Total</th>
                <th className="px-4 py-3.5 text-right">Ubah Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {filteredOrders.map((order) => {
                const statusMeta = ORDER_STATUS_META[order.status];
                return (
                  <tr key={order.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3.5 align-top">
                      <p className="font-mono text-xs font-semibold text-amber-400">
                        {order.orderCode}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
                        {formatDateId(order.createdAt)}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 align-top">
                      <p className="font-medium text-white">{order.userName || 'Pelanggan'}</p>
                      <p className="text-xs text-slate-400">{order.userEmail}</p>
                    </td>
                    <td className="px-4 py-3.5 align-top">
                      <p className="font-medium text-white">
                        {order.productName} ({order.quantity}x)
                      </p>
                      <p className="font-mono text-xs text-slate-300 mt-0.5">
                        {order.game} · {order.targetAccountId}
                        {order.targetServer ? ` (${order.targetServer})` : ''}
                      </p>
                      {order.category === 'joki' && (
                        <p className="text-xs text-amber-300/90 mt-0.5">
                          {order.jokiCurrentRank} → {order.jokiTargetRank}
                          {order.jokiNotes ? ` · ${order.jokiNotes}` : ''}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3.5 align-top text-xs text-slate-300">
                      {order.paymentMethod}
                    </td>
                    <td className="px-4 py-3.5 align-top text-right font-mono font-semibold text-white tabular-nums">
                      {formatRupiah(order.totalPrice)}
                    </td>
                    <td className="px-4 py-3.5 align-top text-right">
                      <select
                        aria-label={`Status pesanan ${order.orderCode}`}
                        disabled={updatingOrderId === order.id}
                        value={order.status}
                        onChange={(e) =>
                          void handleStatusChange(order.id, e.target.value as OrderStatus)
                        }
                        className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold focus:outline-none cursor-pointer ${statusMeta.bgClass} ${statusMeta.borderClass} ${statusMeta.textClass}`}
                      >
                        <option value="pending" className="bg-[#121620] text-amber-300">
                          Menunggu
                        </option>
                        <option value="processing" className="bg-[#121620] text-sky-300">
                          Diproses
                        </option>
                        <option value="completed" className="bg-[#121620] text-emerald-300">
                          Selesai
                        </option>
                        <option value="cancelled" className="bg-[#121620] text-rose-300">
                          Dibatalkan
                        </option>
                      </select>
                    </td>
                  </tr>
                );
              })}
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                    Belum ada pesanan yang sesuai dengan pencarian.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Product Create / Edit Modal */}
      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative my-auto w-full max-w-lg rounded-2xl border border-white/10 bg-[#121620] p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              aria-label="Tutup form produk"
              className="absolute right-4 top-4 rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="font-display text-xl font-bold text-white">
              {editingProduct ? 'Ubah Produk / Layanan' : 'Tambah Produk Baru'}
            </h2>

            {formError && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveProduct} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Nama Produk / Layanan
                </label>
                <input
                  type="text"
                  required
                  value={formState.name}
                  onChange={(e) => setFormState((s) => ({ ...s, name: e.target.value }))}
                  placeholder="Contoh: 514 Diamonds Mobile Legends"
                  className="w-full rounded-xl border border-white/10 bg-[#0B0D12] px-3.5 py-2.5 text-sm text-white focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Game
                  </label>
                  <select
                    value={formState.game}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, game: e.target.value as GameName }))
                    }
                    className="w-full rounded-xl border border-white/10 bg-[#0B0D12] px-3.5 py-2.5 text-sm text-white focus:border-amber-400 focus:outline-none"
                  >
                    <option value="Mobile Legends">Mobile Legends</option>
                    <option value="Free Fire">Free Fire</option>
                    <option value="PUBG Mobile">PUBG Mobile</option>
                    <option value="Genshin Impact">Genshin Impact</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Kategori
                  </label>
                  <select
                    value={formState.category}
                    onChange={(e) =>
                      setFormState((s) => ({
                        ...s,
                        category: e.target.value as ProductCategory,
                      }))
                    }
                    className="w-full rounded-xl border border-white/10 bg-[#0B0D12] px-3.5 py-2.5 text-sm text-white focus:border-amber-400 focus:outline-none"
                  >
                    <option value="topup">Top-Up Game</option>
                    <option value="joki">Jasa Joki ML</option>
                  </select>
                </div>
              </div>

              {formState.category === 'joki' && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Tier Rank Target
                  </label>
                  <select
                    value={formState.rankTier || 'Grandmaster'}
                    onChange={(e) => setFormState((s) => ({ ...s, rankTier: e.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-[#0B0D12] px-3.5 py-2.5 text-sm text-white focus:border-amber-400 focus:outline-none"
                  >
                    <option value="Grandmaster">Grandmaster</option>
                    <option value="Epic">Epic</option>
                    <option value="Legend">Legend</option>
                    <option value="Mythic">Mythic</option>
                    <option value="Mythical Honor">Mythical Honor</option>
                    <option value="Mythical Glory">Mythical Glory</option>
                    <option value="Mythical Immortal">Mythical Immortal</option>
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Harga (Rupiah)
                  </label>
                  <input
                    type="number"
                    required
                    min={1000}
                    step={500}
                    value={formState.price}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, price: Number(e.target.value) || 0 }))
                    }
                    className="w-full rounded-xl border border-white/10 bg-[#0B0D12] px-3.5 py-2.5 font-mono text-sm text-white focus:border-amber-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Satuan / Label Unit
                  </label>
                  <input
                    type="text"
                    required
                    value={formState.unitLabel}
                    onChange={(e) => setFormState((s) => ({ ...s, unitLabel: e.target.value }))}
                    placeholder="Contoh: 514 Diamonds / Per Bintang"
                    className="w-full rounded-xl border border-white/10 bg-[#0B0D12] px-3.5 py-2.5 text-sm text-white focus:border-amber-400 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Deskripsi Layanan
                </label>
                <textarea
                  rows={3}
                  required
                  value={formState.description}
                  onChange={(e) => setFormState((s) => ({ ...s, description: e.target.value }))}
                  placeholder="Jelaskan detail pengiriman atau ketentuan layanan..."
                  className="w-full rounded-xl border border-white/10 bg-[#0B0D12] px-3.5 py-2.5 text-sm text-white focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-6 pt-1">
                <label className="inline-flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formState.isPopular}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, isPopular: e.target.checked }))
                    }
                    className="rounded border-white/20 bg-[#0B0D12] accent-amber-500"
                  />
                  <span>Tandai Terlaris</span>
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formState.isActive}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, isActive: e.target.checked }))
                    }
                    className="rounded border-white/20 bg-[#0B0D12] accent-amber-500"
                  />
                  <span>Tampilkan di Katalog</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="rounded-xl border border-white/15 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/5 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="rounded-xl bg-amber-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60 cursor-pointer"
                >
                  {formSubmitting ? 'Menyimpan...' : 'Simpan Produk'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#121620] p-6 shadow-2xl">
            <h3 className="font-display text-lg font-bold text-white">Hapus Produk?</h3>
            <p className="mt-2 text-sm text-slate-300">
              Produk <span className="font-semibold text-white">{deletingProduct.name}</span> akan
              dihapus permanen dari katalog.
            </p>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingProduct(null)}
                className="rounded-xl border border-white/15 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/5 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={deleteSubmitting}
                onClick={() => void handleConfirmDelete()}
                className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-400 disabled:opacity-60 cursor-pointer"
              >
                {deleteSubmitting ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
