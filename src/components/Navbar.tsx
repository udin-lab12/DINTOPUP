import { useState } from 'react';
import { LogOut, Menu, ShieldCheck, User as UserIcon, X } from 'lucide-react';
import type { User } from '../types.ts';

export type ActivePage = 'store' | 'orders' | 'admin';

interface NavbarProps {
  user: User | null;
  activePage: ActivePage;
  onNavigate: (page: ActivePage, sectionId?: string) => void;
  onOpenAuth: (initialTab?: 'login' | 'register') => void;
  onLogout: () => void;
}

export function Navbar({
  user,
  activePage,
  onNavigate,
  onOpenAuth,
  onLogout,
}: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  const handleLinkClick = (page: ActivePage, sectionId?: string) => {
    setMobileMenuOpen(false);
    setAccountMenuOpen(false);
    onNavigate(page, sectionId);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0B0D12]/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-8 px-4 sm:px-6">
        {/* Zone 1: Single-element brand wordmark */}
        <button
          type="button"
          onClick={() => handleLinkClick('store')}
          className="font-display text-xl font-bold tracking-tight text-white whitespace-nowrap shrink-0 hover:text-amber-400 transition-colors cursor-pointer"
        >
          DINTOPUP
        </button>

        {/* Zone 2: Single-line navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-300">
          <button
            type="button"
            onClick={() => handleLinkClick('store', 'katalog')}
            className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
              activePage === 'store'
                ? 'border-amber-400 text-white'
                : 'border-transparent hover:border-slate-500 hover:text-white'
            }`}
          >
            Top-Up Game
          </button>
          <button
            type="button"
            onClick={() => handleLinkClick('store', 'joki')}
            className="whitespace-nowrap shrink-0 py-1 border-b-2 border-transparent hover:border-slate-500 hover:text-white transition-colors cursor-pointer"
          >
            Joki ML
          </button>
          <button
            type="button"
            onClick={() => handleLinkClick('store', 'cara-order')}
            className="whitespace-nowrap shrink-0 py-1 border-b-2 border-transparent hover:border-slate-500 hover:text-white transition-colors cursor-pointer"
          >
            Cara Order
          </button>
          {user && user.role === 'user' && (
            <button
              type="button"
              onClick={() => handleLinkClick('orders')}
              className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
                activePage === 'orders'
                  ? 'border-amber-400 text-white'
                  : 'border-transparent hover:border-slate-500 hover:text-white'
              }`}
            >
              Riwayat Transaksi
            </button>
          )}
          {user && user.role === 'admin' && (
            <button
              type="button"
              onClick={() => handleLinkClick('admin')}
              className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
                activePage === 'admin'
                  ? 'border-amber-400 text-white'
                  : 'border-transparent hover:border-slate-500 hover:text-white'
              }`}
            >
              Panel Admin
            </button>
          )}
        </nav>

        {/* Zone 3: Single primary action */}
        <div className="flex items-center gap-3 shrink-0">
          {!user ? (
            <button
              type="button"
              onClick={() => onOpenAuth('login')}
              className="hidden sm:inline-flex items-center justify-center rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Masuk
            </button>
          ) : (
            <div className="relative hidden sm:block">
              <button
                type="button"
                onClick={() => setAccountMenuOpen((prev) => !prev)}
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-[#141822] px-3.5 py-2 text-sm font-medium text-slate-100 hover:border-amber-400/50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {user.role === 'admin' ? (
                  <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                ) : (
                  <UserIcon className="w-4 h-4 text-slate-300 shrink-0" />
                )}
                <span className="max-w-[130px] truncate">{user.name}</span>
              </button>

              {accountMenuOpen && (
                <div className="absolute right-0 mt-2 w-60 rounded-xl border border-white/10 bg-[#141822] p-2 shadow-2xl">
                  <div className="px-3 py-2 border-b border-white/10 mb-1">
                    <p className="text-sm font-semibold text-white truncate">{user.name}</p>
                    <p className="text-xs text-slate-400 truncate">
                      {user.role === 'admin' ? 'Admin' : 'Pelanggan'} · {user.email}
                    </p>
                  </div>
                  {user.role === 'admin' ? (
                    <button
                      type="button"
                      onClick={() => handleLinkClick('admin')}
                      className="w-full text-left rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      Kelola Produk & Pesanan
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleLinkClick('orders')}
                      className="w-full text-left rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      Riwayat Transaksi Saya
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      onLogout();
                    }}
                    className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Keluar</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Mobile menu toggle */}
          <button
            type="button"
            aria-label={mobileMenuOpen ? 'Tutup menu' : 'Buka menu'}
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="inline-flex md:hidden items-center justify-center rounded-lg border border-white/15 bg-[#141822] p-2.5 text-slate-200 hover:text-white cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-white/10 bg-[#0E1118] px-4 py-4 space-y-2">
          <button
            type="button"
            onClick={() => handleLinkClick('store', 'katalog')}
            className="block w-full text-left rounded-lg px-3 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/5 cursor-pointer"
          >
            Top-Up Game
          </button>
          <button
            type="button"
            onClick={() => handleLinkClick('store', 'joki')}
            className="block w-full text-left rounded-lg px-3 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/5 cursor-pointer"
          >
            Joki Mobile Legends
          </button>
          <button
            type="button"
            onClick={() => handleLinkClick('store', 'cara-order')}
            className="block w-full text-left rounded-lg px-3 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/5 cursor-pointer"
          >
            Cara Order
          </button>

          {user ? (
            <div className="pt-2 mt-2 border-t border-white/10 space-y-2">
              <div className="px-3 py-1">
                <p className="text-sm font-semibold text-white">{user.name}</p>
                <p className="text-xs text-slate-400">
                  {user.role === 'admin' ? 'Akun Admin' : 'Akun Pelanggan'} · {user.email}
                </p>
              </div>
              {user.role === 'admin' ? (
                <button
                  type="button"
                  onClick={() => handleLinkClick('admin')}
                  className="block w-full text-left rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2.5 text-sm font-semibold text-amber-300 cursor-pointer"
                >
                  Buka Panel Admin
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleLinkClick('orders')}
                  className="block w-full text-left rounded-lg bg-white/5 px-3 py-2.5 text-sm font-medium text-white cursor-pointer"
                >
                  Riwayat Transaksi Saya
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onLogout();
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-rose-300 hover:bg-rose-500/10 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Keluar</span>
              </button>
            </div>
          ) : (
            <div className="pt-2 mt-2 border-t border-white/10 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenAuth('login');
                }}
                className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 text-center cursor-pointer"
              >
                Masuk
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenAuth('register');
                }}
                className="rounded-lg border border-white/15 bg-[#141822] px-4 py-2.5 text-sm font-medium text-white text-center cursor-pointer"
              >
                Daftar
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
