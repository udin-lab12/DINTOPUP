import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Minus,
  Plus,
  Search,
  ShieldAlert,
} from 'lucide-react';
import { AdminDashboardView } from './components/AdminDashboardView.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { CheckoutModal } from './components/CheckoutModal.tsx';
import { GameImage } from './components/GameImage.tsx';
import { Navbar, type ActivePage } from './components/Navbar.tsx';
import { RankBadgeSvg } from './components/RankBadgeSvg.tsx';
import { UserOrdersView } from './components/UserOrdersView.tsx';
import {
  fetchCurrentUser,
  fetchProducts,
  logoutAccount,
  setStoredToken,
} from './utils/api.ts';
import { formatRupiah, GAME_META, HERO_IMAGE, MAX_JOKI_STARS } from './utils/format.ts';
import type { GameName, Product, User } from './types.ts';

const GAMES_LIST: GameName[] = [
  'Mobile Legends',
  'Free Fire',
  'PUBG Mobile',
  'Genshin Impact',
];

const RANK_ORDER: Record<string, number> = {
  Grandmaster: 1,
  Epic: 2,
  Legend: 3,
  Mythic: 4,
  'Mythical Honor': 5,
  'Mythical Glory': 6,
  'Mythical Immortal': 7,
  Immortal: 7,
};

function getPageFromPath(pathname: string): ActivePage {
  const normalized = pathname.toLowerCase().replace(/\/+$/, '') || '/';
  if (normalized === '/admin' || normalized.startsWith('/admin/')) return 'admin';
  if (normalized === '/riwayat' || normalized === '/orders') return 'orders';
  return 'store';
}

function getPathFromPage(page: ActivePage): string {
  if (page === 'admin') return '/admin';
  if (page === 'orders') return '/riwayat';
  return '/';
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [activePage, setActivePage] = useState<ActivePage>(() =>
    getPageFromPath(window.location.pathname)
  );

  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState('');

  // Store filters
  const [selectedGame, setSelectedGame] = useState<'all' | GameName>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [jokiStarsPreview, setJokiStarsPreview] = useState(5);

  // Modals
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authInitialTab, setAuthInitialTab] = useState<'login' | 'register'>('login');
  const [checkoutProduct, setCheckoutProduct] = useState<Product | null>(null);
  const [checkoutInitialQty, setCheckoutInitialQty] = useState(1);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState('');

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(''), 4000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const loadProducts = useCallback(async () => {
    setProductsLoading(true);
    setProductsError('');
    try {
      const data = await fetchProducts(false);
      setProducts(Array.isArray(data) ? data : []);
    } catch (err) {
      setProducts([]);
      setProductsError(err instanceof Error ? err.message : 'Gagal memuat katalog produk.');
    } finally {
      setProductsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    const handlePopState = () => {
      setActivePage(getPageFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    fetchCurrentUser()
      .then((currentUser) => {
        setUser(currentUser);
      })
      .catch(() => {
        setStoredToken(null);
        setUser(null);
      })
      .finally(() => {
        setAuthReady(true);
      });
  }, []);

  const topupProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const safeProducts = Array.isArray(products) ? products : [];
    return safeProducts.filter((p) => {
      if (p.category !== 'topup') return false;
      if (selectedGame !== 'all' && p.game !== selectedGame) return false;
      if (!q) return true;
      return (
        (p.name ?? '').toLowerCase().includes(q) ||
        (p.game ?? '').toLowerCase().includes(q) ||
        (p.unitLabel ?? '').toLowerCase().includes(q)
      );
    });
  }, [products, selectedGame, searchQuery]);

  const jokiProducts = useMemo(() => {
    const safeProducts = Array.isArray(products) ? products : [];
    return safeProducts
      .filter((p) => p.category === 'joki')
      .sort((a, b) => (RANK_ORDER[a.rankTier] ?? 99) - (RANK_ORDER[b.rankTier] ?? 99));
  }, [products]);

  const handleNavigate = (page: ActivePage, sectionId?: string) => {
    setActivePage(page);
    const targetPath = getPathFromPage(page);
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
    if (page === 'store' && sectionId) {
      setTimeout(() => {
        const el = document.getElementById(sectionId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 60);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleOpenAuth = (tab: 'login' | 'register' = 'login') => {
    setAuthInitialTab(tab);
    setAuthModalOpen(true);
  };

  const handleAuthSuccess = (loggedInUser: User) => {
    setUser(loggedInUser);
    showToast(
      `Selamat datang, ${loggedInUser.name} (${
        loggedInUser.role === 'admin' ? 'Admin' : 'Pelanggan'
      }).`
    );
    if (loggedInUser.role === 'admin' && !checkoutProduct) {
      handleNavigate('admin');
    }
  };

  const handleLogout = async () => {
    await logoutAccount();
    setUser(null);
    handleNavigate('store');
    showToast('Anda telah keluar dari akun.');
  };

  const openCheckout = (product: Product, initialQuantity = 1) => {
    setCheckoutInitialQty(initialQuantity);
    setCheckoutProduct(product);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0D12] text-[#F1F5F9]">
      <Navbar
        user={user}
        activePage={activePage}
        onNavigate={handleNavigate}
        onOpenAuth={handleOpenAuth}
        onLogout={() => void handleLogout()}
      />

      {/* Non-blocking Toast */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-[#121620] px-4 py-3 text-sm text-emerald-200 shadow-2xl">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      <main className="flex-1">
        {activePage === 'orders' ? (
          !authReady ? (
            <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16">
              <div className="h-40 rounded-2xl border border-white/10 bg-[#121620] animate-pulse" />
            </div>
          ) : !user ? (
            <section className="mx-auto max-w-xl px-4 py-20 text-center">
              <ShieldAlert className="w-12 h-12 text-amber-400 mx-auto mb-4" />
              <h1 className="font-display text-2xl font-bold text-white">
                Masuk untuk Melihat Riwayat
              </h1>
              <p className="mt-2 text-sm text-slate-400">
                Silakan masuk menggunakan akun Anda untuk memeriksa status pesanan top-up dan joki.
              </p>
              <button
                type="button"
                onClick={() => handleOpenAuth('login')}
                className="mt-6 rounded-xl bg-amber-500 px-6 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 cursor-pointer"
              >
                Masuk Sekarang
              </button>
            </section>
          ) : (
            <UserOrdersView onBrowseStore={() => handleNavigate('store', 'katalog')} />
          )
        ) : activePage === 'admin' ? (
          !authReady ? (
            <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16">
              <div className="h-40 rounded-2xl border border-white/10 bg-[#121620] animate-pulse" />
            </div>
          ) : user?.role !== 'admin' ? (
            <section className="mx-auto max-w-xl px-4 py-16">
              <div className="rounded-2xl border border-rose-500/35 bg-rose-500/10 p-8 text-center">
                <ShieldAlert className="w-12 h-12 text-rose-400 mx-auto mb-4" />
                <p className="font-mono text-xs font-semibold text-rose-300">
                  403 · Akses Ditolak
                </p>
                <h1 className="mt-2 font-display text-2xl font-bold text-white">
                  Halaman Khusus Administrator
                </h1>
                <p className="mt-3 text-sm text-slate-300 leading-relaxed">
                  {user
                    ? `Akun Anda (${user.email}) terdaftar sebagai Pelanggan. Anda tidak memiliki izin untuk membuka halaman /admin, mengelola produk, atau melihat pesanan pengguna lain.`
                    : 'Anda belum masuk. Halaman /admin hanya dapat diakses oleh akun dengan hak akses Administrator.'}
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleNavigate('store')}
                    className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 transition-colors cursor-pointer"
                  >
                    Kembali ke Beranda
                  </button>
                  {!user ? (
                    <button
                      type="button"
                      onClick={() => handleOpenAuth('login')}
                      className="rounded-xl border border-white/15 bg-[#121620] px-5 py-2.5 text-sm font-medium text-white hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      Masuk sebagai Admin
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleNavigate('orders')}
                      className="rounded-xl border border-white/15 bg-[#121620] px-5 py-2.5 text-sm font-medium text-white hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      Lihat Riwayat Saya
                    </button>
                  )}
                </div>
              </div>
            </section>
          ) : (
            <AdminDashboardView onProductsChanged={() => void loadProducts()} />
          )
        ) : (
          <>
            {/* HERO SECTION */}
            <section className="border-b border-white/10 bg-[#0B0D12]">
              <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 lg:py-12">
                {/* Wide DINTOPUP Banner */}
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0B2B22]">
                  <GameImage
                    src={HERO_IMAGE}
                    alt="Banner resmi DINTOPUP — Top-Up All Game & Jasa Joki Mobile Legends"
                    className="w-full h-auto max-h-[420px] object-cover object-center"
                  />
                </div>

                {/* Headline & Primary CTA below banner */}
                <div className="mt-8 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
                  <div className="max-w-2xl">
                    <p className="text-xs font-medium tracking-wide text-amber-400">
                      DINTOPUP · Top-Up Resmi & Jasa Joki Mobile Legends
                    </p>
                    <h1
                      className="mt-2 font-display font-bold tracking-tight text-white leading-[1.15]"
                      style={{
                        fontSize: 'clamp(1.85rem, 3.2vw, 2.75rem)',
                        textWrap: 'balance',
                      }}
                    >
                      Top-Up Game Instan & Push Rank Tanpa Kompromi.
                    </h1>
                    <p className="mt-3 text-base text-slate-300 leading-relaxed">
                      Layanan pengisian Diamonds, UC, dan Genesis Crystals resmi dengan harga
                      Rupiah transparan, serta jasa joki Mobile Legends manual dari Grandmaster
                      hingga Immortal.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 shrink-0">
                    <a
                      href="#katalog"
                      className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-400 transition-colors whitespace-nowrap"
                    >
                      <span>Jelajahi Katalog</span>
                      <ArrowRight className="w-4 h-4" />
                    </a>
                    <a
                      href="#joki"
                      className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-[#121620] px-5 py-3 text-sm font-medium text-slate-100 hover:border-amber-400/50 transition-colors whitespace-nowrap"
                    >
                      Lihat Tarif Joki ML
                    </a>
                  </div>
                </div>

                {/* 4-Column Service Strip */}
                <div className="mt-10 grid grid-cols-2 lg:grid-cols-4 gap-4 border-t border-white/10 pt-8">
                  <div>
                    <p className="font-mono text-sm font-semibold text-white tabular-nums">
                      1–3 Menit
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Rata-rata waktu pengiriman top-up otomatis
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-sm font-semibold text-white tabular-nums">
                      4 Game Utama
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      MLBB, Free Fire, PUBG Mobile, Genshin Impact
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-sm font-semibold text-white tabular-nums">
                      GM – Immortal
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Joki manual 100% tanpa script atau cheat
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-sm font-semibold text-white tabular-nums">
                      5 Metode Bayar
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      QRIS, DANA, OVO, GoPay, ShopeePay
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* TOP-UP CATALOG SECTION */}
            <section id="katalog" className="mx-auto max-w-6xl px-4 sm:px-6 py-14">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-amber-400">Katalog Top-Up Resmi</p>
                  <h2 className="mt-1 font-display text-2xl sm:text-3xl font-bold text-white">
                    Pilih Game & Nominal Top-Up
                  </h2>
                </div>

                <div className="relative w-full md:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari nominal atau game..."
                    className="w-full rounded-xl border border-white/10 bg-[#121620] pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* 4 Game Showcase Selector */}
              <div className="mt-7 grid grid-cols-2 lg:grid-cols-5 gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedGame('all')}
                  className={`flex flex-col justify-between rounded-xl border p-4 text-left transition-colors cursor-pointer ${
                    selectedGame === 'all'
                      ? 'border-amber-400 bg-amber-500/10'
                      : 'border-white/10 bg-[#121620] hover:border-white/25'
                  }`}
                >
                  <span className="text-xs font-medium text-slate-400">Katalog</span>
                  <div className="mt-3">
                    <p className="font-display text-base font-bold text-white">Semua Game</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {(products ?? []).filter((p) => p.category === 'topup').length} paket tersedia
                    </p>
                  </div>
                </button>

                {(GAMES_LIST ?? []).map((game) => {
                  const meta = GAME_META[game];
                  const active = selectedGame === game;
                  return (
                    <button
                      key={game}
                      type="button"
                      onClick={() => setSelectedGame(game)}
                      className={`group flex items-center gap-3 rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                        active
                          ? 'border-amber-400 bg-amber-500/10'
                          : 'border-white/10 bg-[#121620] hover:border-white/25'
                      }`}
                    >
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[#0B0D12]">
                        <GameImage
                          src={meta.imageUrl}
                          alt={game}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="font-display text-sm font-bold text-white truncate">
                          {game}
                        </p>
                        <p className="text-xs text-slate-400 truncate mt-0.5">{meta.publisher}</p>
                        <p className="text-xs text-amber-400/90 truncate mt-0.5">
                          {meta.currencyName}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Error / Loading / Grid */}
              {productsError && (
                <div className="mt-6 flex items-center justify-between gap-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
                  <div className="flex items-center gap-2.5">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{productsError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadProducts()}
                    className="rounded-lg bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-100 cursor-pointer"
                  >
                    Muat Ulang
                  </button>
                </div>
              )}

              {productsLoading ? (
                <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[1, 2, 3, 4, 5, 6].map((idx) => (
                    <div
                      key={idx}
                      className="h-80 rounded-2xl border border-white/10 bg-[#121620] animate-pulse"
                    />
                  ))}
                </div>
              ) : topupProducts.length === 0 ? (
                <div className="mt-8 rounded-2xl border border-white/10 bg-[#121620] p-10 text-center">
                  <p className="font-display text-lg font-semibold text-white">
                    Produk Tidak Ditemukan
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    Coba pilih kategori game lain atau ubah kata kunci pencarian Anda.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedGame('all');
                      setSearchQuery('');
                    }}
                    className="mt-4 rounded-xl border border-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/5 cursor-pointer"
                  >
                    Tampilkan Semua Produk
                  </button>
                </div>
              ) : (
                <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {(topupProducts ?? []).map((product) => (
                    <article
                      key={product.id}
                      className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#121620] transition-transform duration-150 hover:-translate-y-0.5 hover:border-white/20"
                    >
                      <div className="relative aspect-square w-full overflow-hidden bg-[#0E1118]">
                        <GameImage
                          src={product.imageUrl}
                          alt={product.name}
                          className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.03]"
                        />
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#121620] via-transparent to-transparent" />
                      </div>

                      <div className="flex flex-1 flex-col p-5 pt-3">
                        <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                          <span className="truncate">
                            {product.game} · {product.unitLabel}
                          </span>
                          {product.isPopular && (
                            <span className="text-amber-400 font-medium shrink-0">Terlaris</span>
                          )}
                        </div>

                        <h3 className="mt-1.5 font-display text-lg font-semibold text-white">
                          {product.name}
                        </h3>
                        <p className="mt-1.5 text-sm text-slate-400 line-clamp-2 flex-1">
                          {product.description}
                        </p>

                        <div className="mt-5 flex items-center justify-between gap-4 border-t border-white/10 pt-4">
                          <div>
                            <p className="text-xs text-slate-400">Harga</p>
                            <p className="font-mono text-base font-bold text-white tabular-nums">
                              {formatRupiah(product.price)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => openCheckout(product, 1)}
                            className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            Beli Sekarang
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {/* DEDICATED JOKI MOBILE LEGENDS SECTION */}
            <section
              id="joki"
              className="border-t border-b border-white/10 bg-[#0E1118] py-14"
            >
              <div className="mx-auto max-w-6xl px-4 sm:px-6">
                <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
                  <div>
                    <p className="text-xs font-medium text-amber-400">
                      Layanan Khusus Mobile Legends: Bang Bang
                    </p>
                    <h2 className="mt-1 font-display text-2xl sm:text-3xl font-bold text-white">
                      Jasa Joki Rank Grandmaster sampai Mythical Immortal
                    </h2>
                    <p className="mt-2 text-sm text-slate-300 max-w-2xl">
                      Dikerjakan manual oleh tim eks-Immortal berwinrate tinggi. Privasi akun aman,
                      bebas request hero, serta tentukan jumlah bintang sesuka Anda tanpa batas.
                    </p>
                  </div>

                  {/* Unlimited Star Estimator */}
                  <div className="rounded-xl border border-white/10 bg-[#121620] px-4 py-3 shrink-0">
                    <label
                      htmlFor="joki-stars-input"
                      className="block text-xs font-medium text-slate-300 mb-2"
                    >
                      Jumlah Bintang Order
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setJokiStarsPreview((s) => Math.max(1, s - 1))}
                        aria-label="Kurangi bintang"
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-[#0B0D12] text-slate-200 hover:border-amber-400/50 cursor-pointer"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <input
                        id="joki-stars-input"
                        type="number"
                        min={1}
                        max={MAX_JOKI_STARS}
                        value={jokiStarsPreview}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (Number.isNaN(val) || val < 1) {
                            setJokiStarsPreview(1);
                            return;
                          }
                          setJokiStarsPreview(Math.min(MAX_JOKI_STARS, val));
                        }}
                        className="h-9 w-24 rounded-lg border border-white/15 bg-[#0B0D12] px-3 text-center font-mono text-sm font-semibold text-amber-400 tabular-nums focus:border-amber-400 focus:outline-none"
                      />
                      <button
                        type="button"
                        disabled={jokiStarsPreview >= MAX_JOKI_STARS}
                        onClick={() => setJokiStarsPreview((s) => Math.min(MAX_JOKI_STARS, s + 1))}
                        aria-label="Tambah bintang"
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-[#0B0D12] text-slate-200 hover:border-amber-400/50 disabled:opacity-40 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <span className="text-xs text-slate-400 ml-1 whitespace-nowrap">
                        Bintang
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {(jokiProducts ?? []).map((joki) => (
                    <article
                      key={joki.id}
                      className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#121620] p-5 hover:border-amber-400/50 transition-colors"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <RankBadgeSvg tier={joki.rankTier} imageUrl={joki.imageUrl} />
                          <span className="text-xs font-medium text-slate-400">
                            {joki.unitLabel}
                          </span>
                        </div>

                        <h3 className="mt-4 font-display text-base font-bold text-white leading-snug">
                          {joki.name}
                        </h3>
                        <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                          {joki.description}
                        </p>
                      </div>

                      <div className="mt-5 pt-4 border-t border-white/10 space-y-3">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-xs text-slate-400">Tarif</span>
                          <span className="font-mono text-base font-bold text-white tabular-nums">
                            {formatRupiah(joki.price)}
                          </span>
                        </div>
                        <div className="flex items-baseline justify-between gap-2 text-xs">
                          <span className="text-slate-400">
                            Total {jokiStarsPreview} Bintang
                          </span>
                          <span className="font-mono font-semibold text-amber-400 tabular-nums">
                            {formatRupiah(joki.price * jokiStarsPreview)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => openCheckout(joki, jokiStarsPreview)}
                          className="w-full rounded-xl bg-amber-500 py-2.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition-colors cursor-pointer"
                        >
                          Pesan Joki ({jokiStarsPreview} Bintang)
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            {/* HOW TO ORDER SECTION */}
            <section id="cara-order" className="mx-auto max-w-6xl px-4 sm:px-6 py-14">
              <div className="max-w-xl">
                <p className="text-xs font-medium text-amber-400">Alur Pemesanan</p>
                <h2 className="mt-1 font-display text-2xl font-bold text-white">
                  Tiga Langkah Transaksi di DINTOPUP
                </h2>
              </div>

              <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="rounded-2xl border border-white/10 bg-[#121620] p-6">
                  <p className="font-mono text-xs font-semibold text-amber-400">01.</p>
                  <h3 className="mt-2 font-display text-lg font-semibold text-white">
                    Pilih Game & Layanan
                  </h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                    Tentukan nominal top-up untuk MLBB, Free Fire, PUBG Mobile, atau Genshin
                    Impact, maupun paket joki rank yang Anda butuhkan.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-[#121620] p-6">
                  <p className="font-mono text-xs font-semibold text-amber-400">02.</p>
                  <h3 className="mt-2 font-display text-lg font-semibold text-white">
                    Lengkapi Data & Pembayaran
                  </h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                    Masukkan User ID / UID atau detail akun joki beserta target rank, lalu pilih
                    pembayaran QRIS atau e-wallet (DANA, OVO, GoPay, ShopeePay).
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-[#121620] p-6">
                  <p className="font-mono text-xs font-semibold text-amber-400">03.</p>
                  <h3 className="mt-2 font-display text-lg font-semibold text-white">
                    Pantau Status Pesanan
                  </h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                    Setiap pesanan tercatat rapi di database. Buka menu Riwayat Transaksi untuk
                    memantau pembaruan status dari tim DINTOPUP.
                  </p>
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      <footer className="border-t border-white/10 bg-[#0B0D12] py-8">
        <div className="mx-auto flex max-w-6xl flex-col sm:flex-row items-center justify-between gap-4 px-4 sm:px-6 text-xs text-slate-400">
          <div className="flex items-center gap-3">
            <span className="font-display text-sm font-bold text-white">DINTOPUP</span>
            <span aria-hidden="true">·</span>
            <span>Top-Up Game & Jasa Joki Mobile Legends</span>
          </div>
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => handleNavigate('store', 'katalog')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Katalog Top-Up
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('store', 'joki')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Joki ML
            </button>
            {!user && (
              <button
                type="button"
                onClick={() => handleOpenAuth('register')}
                className="hover:text-white transition-colors cursor-pointer"
              >
                Daftar Akun
              </button>
            )}
          </div>
        </div>
      </footer>

      {/* Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        initialTab={authInitialTab}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
      />

      {/* Checkout Modal */}
      <CheckoutModal
        product={checkoutProduct}
        initialQuantity={checkoutInitialQty}
        user={user}
        onClose={() => setCheckoutProduct(null)}
        onRequireLogin={() => {
          setAuthInitialTab('login');
          setAuthModalOpen(true);
        }}
        onOrderCreated={(order) => {
          showToast(`Pesanan ${order.orderCode} berhasil dibuat.`);
        }}
        onViewHistory={() => {
          if (user?.role === 'admin') {
            handleNavigate('admin');
          } else {
            handleNavigate('orders');
          }
        }}
      />
    </div>
  );
}
