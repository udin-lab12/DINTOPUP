export type UserRole = 'admin' | 'user';

export type GameName =
  | 'Mobile Legends'
  | 'Free Fire'
  | 'PUBG Mobile'
  | 'Genshin Impact';

export type ProductCategory = 'topup' | 'joki';

export type JokiRankTier =
  | 'Grandmaster'
  | 'Epic'
  | 'Legend'
  | 'Mythic'
  | 'Mythical Honor'
  | 'Mythical Glory'
  | 'Mythical Immortal';

export type OrderStatus = 'pending' | 'processing' | 'completed' | 'cancelled';

export type PaymentMethod =
  | 'QRIS'
  | 'DANA'
  | 'OVO'
  | 'GoPay'
  | 'ShopeePay';

export interface User {
  id: number | string;
  name: string;
  email: string;
  role: UserRole;
  whatsapp: string;
  createdAt: string;
}

export interface Product {
  id: number;
  name: string;
  game: GameName;
  category: ProductCategory;
  rankTier: string;
  price: number;
  unitLabel: string;
  description: string;
  imageUrl: string;
  isPopular: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface Order {
  id: number;
  orderCode: string;
  userId: number | string;
  userName?: string;
  userEmail?: string;
  productId: number;
  productName: string;
  game: GameName;
  category: ProductCategory;
  quantity: number;
  totalPrice: number;
  targetAccountId: string;
  targetServer: string;
  jokiCurrentRank: string;
  jokiTargetRank: string;
  jokiNotes: string;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  createdAt: string;
}

export interface AdminStats {
  totalRevenue: number;
  totalOrders: number;
  pendingOrders: number;
  activeProducts: number;
  totalUsers: number;
}
