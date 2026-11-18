import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Search,
  ShoppingBag,
  XCircle,
} from 'lucide-react';
import { fetchOrders } from '../utils/api.ts';
import { formatDateId, formatRupiah, ORDER_STATUS_META } from '../utils/format.ts';
import type { Order, OrderStatus } from '../types.ts';

interface UserOrdersViewProps {
  onBrowseStore: () => void;
}

function StatusLabel({ status }: { status: OrderStatus }) {
  const meta = ORDER_STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap ${meta.bgClass} ${meta.borderClass} ${meta.textClass}`}
    >
      {status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5" />}
      {status === 'processing' && <RefreshCw className="w-3.5 h-3.5" />}
      {status === 'pending' && <Clock className="w-3.5 h-3.5" />}
      {status === 'cancelled' && <XCircle className="w-3.5 h-3.5" />}
      <span>{meta.label}</span>
    </span>
  );
}

export function UserOrdersView({ onBrowseStore }: UserOrdersViewProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');

  const loadOrders = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchOrders();
      setOrders(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat riwayat transaksi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOrders();
  }, []);

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return orders.filter((order) => {
      if (statusFilter !== 'all' && order.status !== statusFilter) return false;
      if (!q) return true;
      return (
        order.orderCode.toLowerCase().includes(q) ||
        order.productName.toLowerCase().includes(q) ||
        order.game.toLowerCase().includes(q) ||
        order.targetAccountId.toLowerCase().includes(q)
      );
    });
  }, [orders, searchQuery, statusFilter]);

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <p className="text-xs font-medium text-amber-400">Akun Pelanggan</p>
          <h1 className="mt-1 font-display text-2xl sm:text-3xl font-bold text-white">
            Riwayat Transaksi Saya
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Pantau status top-up dan progres joki Mobile Legends milik Anda secara langsung.
          </p>
        </div>
        <button
          type="button"
          onClick={onBrowseStore}
          className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 transition-colors whitespace-nowrap self-start sm:self-auto cursor-pointer"
        >
          Buat Pesanan Baru
        </button>
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-[#121620] p-1">
          {(
            [
              { id: 'all', label: 'Semua' },
              { id: 'pending', label: 'Menunggu' },
              { id: 'processing', label: 'Diproses' },
              { id: 'completed', label: 'Selesai' },
              { id: 'cancelled', label: 'Dibatalkan' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setStatusFilter(item.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                statusFilter === item.id
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari kode pesanan atau game..."
            className="w-full rounded-xl border border-white/10 bg-[#121620] pl-10 pr-4 py-2 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
          />
        </div>
      </div>

      {/* Content */}
      {error && (
        <div className="mt-6 flex items-center justify-between gap-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => void loadOrders()}
            className="rounded-lg bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-500/30 cursor-pointer"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {loading ? (
        <div className="mt-6 space-y-3">
          {[1, 2, 3].map((idx) => (
            <div
              key={idx}
              className="h-20 rounded-xl border border-white/10 bg-[#121620] animate-pulse"
            />
          ))}
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-white/10 bg-[#121620] p-10 text-center">
          <ShoppingBag className="w-10 h-10 text-slate-500 mx-auto mb-3" />
          <h2 className="font-display text-lg font-semibold text-white">
            {orders.length === 0 ? 'Belum Ada Transaksi' : 'Transaksi Tidak Ditemukan'}
          </h2>
          <p className="mt-1 text-sm text-slate-400 max-w-md mx-auto">
            {orders.length === 0
              ? 'Riwayat top-up game dan pemesanan joki Mobile Legends Anda akan muncul di halaman ini.'
              : 'Tidak ada transaksi yang sesuai dengan filter atau kata kunci pencarian Anda.'}
          </p>
          {orders.length === 0 && (
            <button
              type="button"
              onClick={onBrowseStore}
              className="mt-5 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 transition-colors cursor-pointer"
            >
              Jelajahi Katalog Produk
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="mt-6 hidden lg:block overflow-hidden rounded-2xl border border-white/10 bg-[#121620]">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10 bg-[#0E1118] text-xs font-semibold text-slate-400">
                <tr>
                  <th className="px-4 py-3.5">Kode & Tanggal</th>
                  <th className="px-4 py-3.5">Produk & Game</th>
                  <th className="px-4 py-3.5">Akun Tujuan / Detail Joki</th>
                  <th className="px-4 py-3.5">Pembayaran</th>
                  <th className="px-4 py-3.5 text-right">Total</th>
                  <th className="px-4 py-3.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3.5 align-top">
                      <p className="font-mono text-xs font-semibold text-amber-400">
                        {order.orderCode}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400 tabular-nums">
                        {formatDateId(order.createdAt)}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 align-top">
                      <p className="font-medium text-white">
                        {order.productName} ({order.quantity}x)
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {order.game} · {order.category === 'joki' ? 'Jasa Joki' : 'Top-Up'}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 align-top">
                      <p className="font-mono text-xs text-slate-200">
                        {order.targetAccountId}
                        {order.targetServer ? ` (${order.targetServer})` : ''}
                      </p>
                      {order.category === 'joki' && (
                        <p className="mt-0.5 text-xs text-slate-400">
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
                      <StatusLabel status={order.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List */}
          <div className="mt-6 space-y-3 lg:hidden">
            {filteredOrders.map((order) => (
              <div
                key={order.id}
                className="rounded-xl border border-white/10 bg-[#121620] p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs font-semibold text-amber-400">
                      {order.orderCode}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {formatDateId(order.createdAt)}
                    </p>
                  </div>
                  <StatusLabel status={order.status} />
                </div>

                <div>
                  <p className="font-medium text-white">
                    {order.productName} ({order.quantity}x)
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {order.game} · {order.paymentMethod}
                  </p>
                </div>

                <div className="rounded-lg bg-[#0B0D12] p-3 text-xs space-y-1">
                  <p className="font-mono text-slate-200">
                    ID: {order.targetAccountId}
                    {order.targetServer ? ` (${order.targetServer})` : ''}
                  </p>
                  {order.category === 'joki' && (
                    <p className="text-slate-400">
                      Rank: {order.jokiCurrentRank} → {order.jokiTargetRank}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-white/10">
                  <span className="text-xs text-slate-400">Total Pembayaran</span>
                  <span className="font-mono text-sm font-bold text-white tabular-nums">
                    {formatRupiah(order.totalPrice)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
