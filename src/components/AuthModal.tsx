import { useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, Lock, Mail, Phone, User as UserIcon, X } from 'lucide-react';
import { loginAccount, registerAccount } from '../utils/api.ts';
import type { User } from '../types.ts';

interface AuthModalProps {
  isOpen: boolean;
  initialTab: 'login' | 'register';
  onClose: () => void;
  onSuccess: (user: User) => void;
}

export function AuthModal({ isOpen, initialTab, onClose, onSuccess }: AuthModalProps) {
  const [tab, setTab] = useState<'login' | 'register'>(initialTab);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successNotice, setSuccessNotice] = useState('');

  useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
      setError('');
      setSuccessNotice('');
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const switchTab = (nextTab: 'login' | 'register') => {
    setTab(nextTab);
    setError('');
    setSuccessNotice('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessNotice('');

    if (tab === 'register') {
      if (name.trim().length < 2) {
        setError('Nama lengkap minimal 2 karakter.');
        return;
      }
      if (password.length < 6) {
        setError('Kata sandi minimal 6 karakter.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Konfirmasi kata sandi tidak cocok.');
        return;
      }
    }

    setLoading(true);
    try {
      const result =
        tab === 'login'
          ? await loginAccount({ email, password })
          : await registerAccount({ name, email, password, whatsapp });
      onSuccess(result.user);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Autentikasi gagal. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#121620] p-6 sm:p-7 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup jendela autentikasi"
          className="absolute right-4 top-4 rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 id="auth-modal-title" className="font-display text-2xl font-bold text-white">
          {tab === 'login' ? 'Masuk ke DINTOPUP' : 'Buat Akun Baru'}
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          {tab === 'login'
            ? 'Masuk untuk melakukan pemesanan dan memantau riwayat transaksi Anda.'
            : 'Daftar sebagai pelanggan untuk mulai top-up game dan pesan joki.'}
        </p>

        {/* Segmented Auth Mode Switcher */}
        <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-[#0B0D12] p-1 border border-white/10">
          <button
            type="button"
            onClick={() => switchTab('login')}
            className={`rounded-lg py-2 text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              tab === 'login'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Masuk
          </button>
          <button
            type="button"
            onClick={() => switchTab('register')}
            className={`rounded-lg py-2 text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              tab === 'register'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Daftar Akun
          </button>
        </div>

        {successNotice && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{successNotice}</span>
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {tab === 'register' && (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Nama Lengkap
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Raka Pratama"
                  className="w-full rounded-xl border border-white/10 bg-[#0B0D12] pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Alamat Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@email.com"
                className="w-full rounded-xl border border-white/10 bg-[#0B0D12] pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
              />
            </div>
          </div>

          {tab === 'register' && (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Nomor WhatsApp (Opsional)
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="0812xxxxxxxx"
                  className="w-full rounded-xl border border-white/10 bg-[#0B0D12] pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Kata Sandi
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimal 6 karakter"
                className="w-full rounded-xl border border-white/10 bg-[#0B0D12] pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
              />
            </div>
          </div>

          {tab === 'register' && (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Ulangi Kata Sandi
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Ketik ulang kata sandi"
                  className="w-full rounded-xl border border-white/10 bg-[#0B0D12] pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-amber-500 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60 transition-colors cursor-pointer"
          >
            {loading
              ? 'Memproses...'
              : tab === 'login'
              ? 'Masuk Sekarang'
              : 'Daftar Akun Pelanggan'}
          </button>
        </form>
      </div>
    </div>
  );
}
