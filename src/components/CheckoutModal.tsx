import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  ExternalLink,
  Minus,
  Plus,
  QrCode,
  Shield,
  Wallet,
  X,
} from 'lucide-react';
import { createOrder } from '../utils/api.ts';
import {
  EWALLET_PAYMENT_NUMBER,
  formatRupiah,
  GAME_META,
  MAX_JOKI_STARS,
  MAX_ORDER_TOTAL_PRICE,
  MAX_TOPUP_QUANTITY,
  PAYMENT_METHODS,
  WHATSAPP_ADMIN_NUMBER,
} from '../utils/format.ts';
import { GameImage } from './GameImage.tsx';
import type { Order, PaymentMethod, Product, User } from '../types.ts';

interface CheckoutModalProps {
  product: Product | null;
  initialQuantity?: number;
  user: User | null;
  onClose: () => void;
  onRequireLogin: () => void;
  onOrderCreated: (order: Order) => void;
  onViewHistory: () => void;
}

const QR_SIZE = 25;

function isFinderCell(r: number, c: number): boolean {
  const inTopLeft = r < 7 && c < 7;
  const inTopRight = r < 7 && c >= QR_SIZE - 7;
  const inBottomLeft = r >= QR_SIZE - 7 && c < 7;
  if (!inTopLeft && !inTopRight && !inBottomLeft) return false;

  const lr = r < 7 ? r : r - (QR_SIZE - 7);
  const lc = c < 7 ? c : c - (QR_SIZE - 7);
  if (lr === 0 || lr === 6 || lc === 0 || lc === 6) return true;
  if (lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4) return true;
  return false;
}

function isSeparatorOrTiming(r: number, c: number): { reserved: boolean; filled: boolean } {
  if (
    (r === 7 && c <= 7) ||
    (c === 7 && r <= 7) ||
    (r === 7 && c >= QR_SIZE - 8) ||
    (c === QR_SIZE - 8 && r <= 7) ||
    (r === QR_SIZE - 8 && c <= 7) ||
    (c === 7 && r >= QR_SIZE - 8)
  ) {
    return { reserved: true, filled: false };
  }

  // Alignment pattern near bottom-right (16..20, 16..20)
  if (r >= 16 && r <= 20 && c >= 16 && c <= 20) {
    const ar = r - 16;
    const ac = c - 16;
    const filled = ar === 0 || ar === 4 || ac === 0 || ac === 4 || (ar === 2 && ac === 2);
    return { reserved: true, filled };
  }

  // Timing strips
  if (r === 6 && c >= 8 && c <= QR_SIZE - 9) {
    return { reserved: true, filled: c % 2 === 0 };
  }
  if (c === 6 && r >= 8 && r <= QR_SIZE - 9) {
    return { reserved: true, filled: r % 2 === 0 };
  }

  return { reserved: false, filled: false };
}

function buildQrMatrix(): boolean[][] {
  const matrix: boolean[][] = [];
  for (let r = 0; r < QR_SIZE; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < QR_SIZE; c++) {
      if (isFinderCell(r, c)) {
        row.push(true);
        continue;
      }
      if (
        (r < 7 && c < 7) ||
        (r < 7 && c >= QR_SIZE - 7) ||
        (r >= QR_SIZE - 7 && c < 7)
      ) {
        row.push(false);
        continue;
      }
      const special = isSeparatorOrTiming(r, c);
      if (special.reserved) {
        row.push(special.filled);
        continue;
      }
      // Deterministic QRIS payload pattern
      const hash = ((r * 31 + c * 17) ^ (r * c + 13)) % 11;
      row.push(hash === 0 || hash === 2 || hash === 5 || hash === 7 || hash === 9);
    }
    matrix.push(row);
  }
  return matrix;
}

const QRIS_MATRIX = buildQrMatrix();

function QrisQrCode() {
  return (
    <div className="inline-flex flex-col items-center rounded-xl bg-white p-3 text-slate-950">
      <div className="mb-2 flex w-full items-center justify-between gap-2 text-[11px] font-bold tracking-wide text-slate-900">
        <span>QRIS</span>
        <span className="font-mono text-[10px] font-semibold text-slate-600">DINTOPUP</span>
      </div>
      <svg
        viewBox={`0 0 ${QR_SIZE} ${QR_SIZE}`}
        className="h-36 w-36"
        shapeRendering="crispEdges"
        role="img"
        aria-label="Kode QRIS DINTOPUP"
      >
        <rect width={QR_SIZE} height={QR_SIZE} fill="#FFFFFF" />
        {(QRIS_MATRIX ?? []).map((row, r) =>
          (row ?? []).map((filled, c) =>
            filled ? (
              <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="#0F172A" />
            ) : null
          )
        )}
      </svg>
      <p className="mt-2 font-mono text-[10px] font-medium text-slate-600 tabular-nums">
        NMID · ID1026048592817
      </p>
    </div>
  );
}

function buildWhatsappOrderUrl(order: Order): string {
  const lines = [
    'Halo Admin DINTOPUP, saya sudah melakukan pemesanan dan pembayaran:',
    `Kode Transaksi: ${order.orderCode}`,
    `Layanan: ${order.productName} (${order.quantity}x)`,
    `Game: ${order.game}`,
    `ID / Akun Tujuan: ${order.targetAccountId}${order.targetServer ? ` (${order.targetServer})` : ''}`,
    ...(order.category === 'joki'
      ? [
          `Rank Awal -> Target: ${order.jokiCurrentRank} -> ${order.jokiTargetRank}`,
          ...(order.jokiNotes ? [`Catatan: ${order.jokiNotes}`] : []),
        ]
      : []),
    `Metode Pembayaran: ${order.paymentMethod}`,
    `Total Pembayaran: ${formatRupiah(order.totalPrice)}`,
    '',
    'Mohon diproses ya Admin, berikut saya lampirkan bukti pembayarannya.',
  ];
  return `https://wa.me/${WHATSAPP_ADMIN_NUMBER}?text=${encodeURIComponent(lines.join('\n'))}`;
}

function triggerWhatsappRedirect(url: string): void {
  try {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch {
    // Abaikan jika browser memblokir programmatic click
  }

  try {
    if (window.self === window.top) {
      setTimeout(() => {
        window.location.assign(url);
      }, 450);
    }
  } catch {
    // Abaikan jika berada dalam cross-origin iframe preview
  }
}

export function CheckoutModal({
  product,
  initialQuantity = 1,
  user,
  onClose,
  onRequireLogin,
  onOrderCreated,
  onViewHistory,
}: CheckoutModalProps) {
  const [quantity, setQuantity] = useState(initialQuantity);
  const [targetAccountId, setTargetAccountId] = useState('');
  const [targetServer, setTargetServer] = useState('');
  const [jokiCurrentRank, setJokiCurrentRank] = useState('');
  const [jokiTargetRank, setJokiTargetRank] = useState('');
  const [jokiNotes, setJokiNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('QRIS');
  const [copiedWallet, setCopiedWallet] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);
  const [whatsappUrl, setWhatsappUrl] = useState('');

  useEffect(() => {
    if (product) {
      const cap = product.category === 'joki' ? MAX_JOKI_STARS : MAX_TOPUP_QUANTITY;
      setQuantity(Math.min(cap, Math.max(1, initialQuantity)));
      setTargetAccountId('');
      setTargetServer(product.game === 'Genshin Impact' ? 'Asia' : '');
      setJokiCurrentRank(
        product.category === 'joki' && product.rankTier ? `${product.rankTier} III` : ''
      );
      setJokiTargetRank(
        product.category === 'joki'
          ? product.rankTier === 'Grandmaster'
            ? 'Epic V'
            : product.rankTier === 'Epic'
            ? 'Legend V'
            : product.rankTier === 'Legend'
            ? 'Mythic'
            : product.rankTier === 'Mythic'
            ? 'Mythical Honor'
            : product.rankTier === 'Mythical Honor'
            ? 'Mythical Glory'
            : product.rankTier === 'Mythical Glory'
            ? 'Mythical Immortal'
            : 'Mythical Immortal 100+'
          : ''
      );
      setJokiNotes('');
      setPaymentMethod('QRIS');
      setCopiedWallet(false);
      setError('');
      setConfirmedOrder(null);
      setWhatsappUrl('');
    }
  }, [product, initialQuantity]);

  useEffect(() => {
    if (!copiedWallet) return;
    const timer = setTimeout(() => setCopiedWallet(false), 2200);
    return () => clearTimeout(timer);
  }, [copiedWallet]);

  if (!product) return null;

  const isJoki = product.category === 'joki';
  const maxQuantity = isJoki ? MAX_JOKI_STARS : MAX_TOPUP_QUANTITY;
  const totalPrice = product.price * quantity;
  const gameMeta = GAME_META[product.game];
  const isEwallet = paymentMethod !== 'QRIS';

  const handleCopyNumber = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(EWALLET_PAYMENT_NUMBER);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = EWALLET_PAYMENT_NUMBER;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedWallet(true);
    } catch {
      setCopiedWallet(true);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxQuantity) {
      setError(
        isJoki
          ? `Jumlah bintang harus antara 1 hingga ${maxQuantity} bintang per pesanan.`
          : `Jumlah paket harus antara 1 hingga ${maxQuantity} paket per pesanan.`
      );
      return;
    }

    if (totalPrice > MAX_ORDER_TOTAL_PRICE) {
      setError(
        `Total pesanan melebihi batas maksimal ${formatRupiah(MAX_ORDER_TOTAL_PRICE)} per transaksi.`
      );
      return;
    }

    setSubmitting(true);
    try {
      const created = await createOrder({
        productId: product.id,
        quantity,
        targetAccountId,
        targetServer,
        jokiCurrentRank,
        jokiTargetRank,
        jokiNotes,
        paymentMethod,
      });
      const waUrl = buildWhatsappOrderUrl(created);
      setConfirmedOrder(created);
      setWhatsappUrl(waUrl);
      onOrderCreated(created);
      triggerWhatsappRedirect(waUrl);
    } catch (err) {
      console.error('Detail error pembuatan pesanan:', err);
      const message =
        err instanceof Error && err.message
          ? err.message
          : typeof err === 'string'
          ? err
          : JSON.stringify(err);
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-title"
    >
      <div className="relative my-auto w-full max-w-3xl rounded-2xl border border-white/10 bg-[#121620] p-6 sm:p-8 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup checkout"
          className="absolute right-4 top-4 rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {confirmedOrder ? (
          <div className="py-4 text-center max-w-lg mx-auto">
            <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto mb-4" />
            <h2 id="checkout-title" className="font-display text-2xl font-bold text-white">
              Pesanan Berhasil Dibuat
            </h2>
            <p className="mt-2 text-sm text-slate-300">
              Kode transaksi{' '}
              <span className="font-mono font-semibold text-amber-400">
                {confirmedOrder.orderCode}
              </span>{' '}
              telah tersimpan di database dan sedang mengarahkan Anda ke WhatsApp Admin.
            </p>

            <div className="mt-6 rounded-xl border border-white/10 bg-[#0B0D12] p-4 text-left space-y-2.5 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-slate-400">Layanan</span>
                <span className="font-medium text-white text-right">
                  {confirmedOrder.productName} ({confirmedOrder.quantity}x)
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-400">Game</span>
                <span className="text-slate-200">{confirmedOrder.game}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-400">ID / Akun Tujuan</span>
                <span className="font-mono text-slate-200">
                  {confirmedOrder.targetAccountId}
                  {confirmedOrder.targetServer ? ` (${confirmedOrder.targetServer})` : ''}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-400">Metode Pembayaran</span>
                <span className="text-slate-200">{confirmedOrder.paymentMethod}</span>
              </div>
              <div className="flex justify-between gap-4 pt-2 border-t border-white/10">
                <span className="font-semibold text-slate-200">Total Tagihan</span>
                <span className="font-mono text-base font-semibold text-amber-400 tabular-nums">
                  {formatRupiah(confirmedOrder.totalPrice)}
                </span>
              </div>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
              {whatsappUrl && (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 transition-colors whitespace-nowrap"
                >
                  <span>Lanjut ke WhatsApp Admin</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onViewHistory();
                }}
                className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 transition-colors cursor-pointer"
              >
                Lihat Riwayat Transaksi
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-white/15 bg-[#0B0D12] px-5 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/5 transition-colors cursor-pointer"
              >
                Kembali ke Katalog
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            {/* Left Product Summary Module */}
            <div className="md:col-span-5 space-y-4">
              <div
                className={`aspect-square w-full max-w-[260px] mx-auto md:max-w-none overflow-hidden rounded-xl border border-white/10 ${
                  isJoki ? 'bg-white p-4' : 'bg-[#0B0D12]'
                }`}
              >
                <GameImage
                  src={product.imageUrl}
                  alt={product.name}
                  className={`h-full w-full ${isJoki ? 'object-contain' : 'object-cover'}`}
                />
              </div>

              <div>
                <p className="text-xs font-medium text-slate-400">
                  {product.game} · {isJoki ? 'Jasa Joki Rank' : 'Top-Up Resmi'}
                </p>
                <h2 id="checkout-title" className="mt-1 font-display text-xl font-bold text-white">
                  {product.name}
                </h2>
                <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                  {product.description}
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#0B0D12] p-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Harga Satuan</span>
                  <span className="font-mono font-medium text-slate-100 tabular-nums">
                    {formatRupiah(product.price)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">
                    {isJoki ? 'Jumlah Bintang' : 'Jumlah Paket'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      aria-label="Kurangi jumlah"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-[#161B26] text-slate-200 hover:border-amber-400/50 cursor-pointer"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={maxQuantity}
                      aria-label={isJoki ? 'Jumlah bintang' : 'Jumlah paket'}
                      value={quantity}
                      onChange={(e) => {
                        const parsed = parseInt(e.target.value, 10);
                        if (Number.isNaN(parsed) || parsed < 1) {
                          setQuantity(1);
                          return;
                        }
                        setQuantity(Math.min(maxQuantity, parsed));
                      }}
                      className="w-16 h-8 rounded-lg border border-white/15 bg-[#161B26] text-center font-mono text-sm font-semibold text-white tabular-nums focus:border-amber-400 focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={quantity >= maxQuantity}
                      onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
                      aria-label="Tambah jumlah"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-[#161B26] text-slate-200 hover:border-amber-400/50 disabled:opacity-40 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 text-right tabular-nums">
                  Maks. {maxQuantity} {isJoki ? 'bintang' : 'paket'} / transaksi
                </p>
                <div className="flex items-center justify-between pt-2.5 border-t border-white/10">
                  <span className="text-sm font-semibold text-slate-200">Total Bayar</span>
                  <span className="font-mono text-lg font-bold text-amber-400 tabular-nums">
                    {formatRupiah(totalPrice)}
                  </span>
                </div>
              </div>
            </div>

            {/* Right Form Module */}
            <form onSubmit={handleSubmit} className="md:col-span-7 space-y-4">
              {!user && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-sm text-amber-200 flex items-center justify-between gap-3">
                  <span>
                    Masuk akun untuk menyimpan riwayat transaksi ke profil Anda, atau lanjutkan
                    pemesanan langsung.
                  </span>
                  <button
                    type="button"
                    onClick={onRequireLogin}
                    className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Masuk / Daftar
                  </button>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {isJoki ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Email / ID Login Akun ML
                      </label>
                      <input
                        type="text"
                        required
                        value={targetAccountId}
                        onChange={(e) => setTargetAccountId(e.target.value)}
                        placeholder="email@moonton.com"
                        className="w-full rounded-xl border border-white/10 bg-[#0B0D12] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Kontak WhatsApp / Login Via
                      </label>
                      <input
                        type="text"
                        required
                        value={targetServer}
                        onChange={(e) => setTargetServer(e.target.value)}
                        placeholder="Moonton · WA 0812xxx"
                        className="w-full rounded-xl border border-white/10 bg-[#0B0D12] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Rank & Bintang Saat Ini
                      </label>
                      <input
                        type="text"
                        required
                        value={jokiCurrentRank}
                        onChange={(e) => setJokiCurrentRank(e.target.value)}
                        placeholder="Contoh: Epic II (3 Bintang)"
                        className="w-full rounded-xl border border-white/10 bg-[#0B0D12] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Target Rank Tujuan
                      </label>
                      <input
                        type="text"
                        required
                        value={jokiTargetRank}
                        onChange={(e) => setJokiTargetRank(e.target.value)}
                        placeholder="Contoh: Legend V"
                        className="w-full rounded-xl border border-white/10 bg-[#0B0D12] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Catatan & Request Hero (Opsional)
                    </label>
                    <textarea
                      rows={2}
                      value={jokiNotes}
                      onChange={(e) => setJokiNotes(e.target.value)}
                      placeholder="Contoh: Request hero Granger / Beatrix, jangan ubah emblem."
                      className="w-full rounded-xl border border-white/10 bg-[#0B0D12] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div
                    className={
                      product.game === 'Mobile Legends' || product.game === 'Genshin Impact'
                        ? ''
                        : 'sm:col-span-2'
                    }
                  >
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      {product.game === 'Genshin Impact'
                        ? 'UID Genshin Impact'
                        : 'User ID / Player ID'}
                    </label>
                    <input
                      type="text"
                      required
                      value={targetAccountId}
                      onChange={(e) => setTargetAccountId(e.target.value)}
                      placeholder={gameMeta.idHint}
                      className="w-full rounded-xl border border-white/10 bg-[#0B0D12] px-3.5 py-2.5 font-mono text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                    />
                  </div>

                  {product.game === 'Mobile Legends' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Zone ID
                      </label>
                      <input
                        type="text"
                        required
                        value={targetServer}
                        onChange={(e) => setTargetServer(e.target.value)}
                        placeholder="Contoh: 2194"
                        className="w-full rounded-xl border border-white/10 bg-[#0B0D12] px-3.5 py-2.5 font-mono text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                      />
                    </div>
                  )}

                  {product.game === 'Genshin Impact' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Pilih Server
                      </label>
                      <select
                        value={targetServer}
                        onChange={(e) => setTargetServer(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-[#0B0D12] px-3.5 py-2.5 text-sm text-white focus:border-amber-400 focus:outline-none"
                      >
                        <option value="Asia">Asia</option>
                        <option value="America">America</option>
                        <option value="Europe">Europe</option>
                        <option value="TW, HK, MO">TW, HK, MO</option>
                      </select>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">
                  Pilih Metode Pembayaran
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(PAYMENT_METHODS ?? []).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPaymentMethod(method)}
                      className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                        paymentMethod === method
                          ? 'border-amber-400 bg-amber-500/15 text-amber-300'
                          : 'border-white/10 bg-[#0B0D12] text-slate-300 hover:border-white/25'
                      }`}
                    >
                      {method === 'QRIS' ? (
                        <QrCode className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <CreditCard className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span className="truncate">{method}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment Instruction Preview BEFORE Order Confirmation */}
              {paymentMethod === 'QRIS' ? (
                <div className="rounded-xl border border-white/10 bg-[#0B0D12] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/10">
                    <div className="flex items-center gap-2">
                      <QrCode className="w-4 h-4 text-amber-400 shrink-0" />
                      <span className="text-xs font-semibold text-white">
                        Scan QRIS Sebelum Konfirmasi
                      </span>
                    </div>
                    <span className="font-mono text-sm font-bold text-amber-400 tabular-nums">
                      {formatRupiah(totalPrice)}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-col sm:flex-row items-center gap-4">
                    <QrisQrCode />
                    <div className="text-left space-y-2 text-xs text-slate-300 leading-relaxed">
                      <p className="font-semibold text-white">Cara Pembayaran QRIS:</p>
                      <p>
                        1. Buka aplikasi DANA, OVO, GoPay, ShopeePay, atau Mobile Banking Anda.
                      </p>
                      <p>
                        2. Pindai kode QRIS di samping dan pastikan nominal transfer sebesar{' '}
                        <span className="font-mono font-semibold text-amber-400 tabular-nums">
                          {formatRupiah(totalPrice)}
                        </span>
                        .
                      </p>
                      <p>
                        3. Setelah pembayaran berhasil, klik tombol{' '}
                        <span className="font-semibold text-white">
                          Selesaikan Pesanan / Konfirmasi Pembayaran
                        </span>{' '}
                        di bawah.
                      </p>
                    </div>
                  </div>
                </div>
              ) : isEwallet ? (
                <div className="rounded-xl border border-white/10 bg-[#0B0D12] p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-white/10">
                    <div className="flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-amber-400 shrink-0" />
                      <span className="text-xs font-semibold text-white">
                        Transfer E-Wallet {paymentMethod}
                      </span>
                    </div>
                    <span className="font-mono text-sm font-bold text-amber-400 tabular-nums">
                      {formatRupiah(totalPrice)}
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-slate-400">
                        Nomor Tujuan {paymentMethod} (a.n. DINTOPUP)
                      </p>
                      <p className="mt-0.5 font-mono text-lg font-bold tracking-wide text-white tabular-nums">
                        {EWALLET_PAYMENT_NUMBER}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleCopyNumber()}
                      className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        copiedWallet
                          ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                          : 'border-white/15 bg-[#161B26] text-white hover:border-amber-400/50'
                      }`}
                    >
                      {copiedWallet ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Tersalin</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Salin Nomor</span>
                        </>
                      )}
                    </button>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    Silakan salin nomor di atas dan selesaikan transfer {paymentMethod} sebesar{' '}
                    <span className="font-mono font-semibold text-amber-400 tabular-nums">
                      {formatRupiah(totalPrice)}
                    </span>{' '}
                    terlebih dahulu sebelum menekan tombol konfirmasi pesanan di bawah.
                  </p>
                </div>
              ) : null}

              <div className="flex items-center gap-2 text-xs text-slate-400 pt-1">
                <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Pesanan tersimpan otomatis ke database dan langsung mengarahkan ke WhatsApp Admin.
                </span>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-amber-500 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60 transition-colors cursor-pointer"
              >
                {submitting
                  ? 'Memproses Pesanan...'
                  : `Selesaikan Pesanan / Konfirmasi Pembayaran · ${formatRupiah(totalPrice)}`}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
