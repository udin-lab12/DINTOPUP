import type { GameName, OrderStatus, PaymentMethod } from '../types.ts';

export const HERO_IMAGE = '/assets/aistudio/image_c5c9307c.png';

export const GAME_META: Record<
  GameName,
  {
    shortName: string;
    publisher: string;
    currencyName: string;
    imageUrl: string;
    idHint: string;
  }
> = {
  'Mobile Legends': {
    shortName: 'MLBB',
    publisher: 'Moonton',
    currencyName: 'Diamonds & Pass',
    imageUrl: '/assets/aistudio/image_5089c427.png',
    idHint: 'Contoh: 482910442 (Zone: 2194)',
  },
  'Free Fire': {
    shortName: 'FF',
    publisher: 'Garena',
    currencyName: 'Diamonds',
    imageUrl: '/assets/aistudio/image_b7849284.png',
    idHint: 'Contoh: 1849203841',
  },
  'PUBG Mobile': {
    shortName: 'PUBGM',
    publisher: 'Level Infinite',
    currencyName: 'Unknown Cash (UC)',
    imageUrl: '/assets/aistudio/image_3d670460.png',
    idHint: 'Contoh: 5129384710',
  },
  'Genshin Impact': {
    shortName: 'Genshin',
    publisher: 'HoYoverse',
    currencyName: 'Genesis Crystals',
    imageUrl: '/assets/aistudio/image_2e8fa4c3.png',
    idHint: 'Contoh: 829401772',
  },
};

export const JOKI_RANK_IMAGES: Record<string, string> = {
  Grandmaster: '/assets/aistudio/images_ff88a793.jpg',
  Epic: '/assets/aistudio/images__5__aea82872.jpg',
  Legend: '/assets/aistudio/images__1__b7bf45cd.jpg',
  Mythic: '/assets/aistudio/images__2__16fbf8b8.jpg',
  'Mythical Honor': '/assets/aistudio/images__3__17cf2851.jpg',
  'Mythical Glory': '/assets/aistudio/download_5f99fe78.jpg',
  'Mythical Immortal': '/assets/aistudio/images__4__2ca0bd55.jpg',
  Immortal: '/assets/aistudio/images__4__2ca0bd55.jpg',
};

export const EWALLET_PAYMENT_NUMBER = '0895336487682';
export const WHATSAPP_ADMIN_NUMBER = '62895336487682';
export const MAX_TOPUP_QUANTITY = 50;
export const MAX_JOKI_STARS = 500;
export const MAX_ORDER_TOTAL_PRICE = 50_000_000;

export const PAYMENT_METHODS: PaymentMethod[] = [
  'QRIS',
  'DANA',
  'OVO',
  'GoPay',
  'ShopeePay',
];

export const ORDER_STATUS_META: Record<
  OrderStatus,
  {
    label: string;
    textClass: string;
    bgClass: string;
    borderClass: string;
  }
> = {
  pending: {
    label: 'Menunggu',
    textClass: 'text-amber-300',
    bgClass: 'bg-amber-500/10',
    borderClass: 'border-amber-500/25',
  },
  processing: {
    label: 'Diproses',
    textClass: 'text-sky-300',
    bgClass: 'bg-sky-500/10',
    borderClass: 'border-sky-500/25',
  },
  completed: {
    label: 'Selesai',
    textClass: 'text-emerald-300',
    bgClass: 'bg-emerald-500/10',
    borderClass: 'border-emerald-500/25',
  },
  cancelled: {
    label: 'Dibatalkan',
    textClass: 'text-rose-300',
    bgClass: 'bg-rose-500/10',
    borderClass: 'border-rose-500/25',
  },
};

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDateId(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
