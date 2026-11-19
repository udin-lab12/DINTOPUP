import { getSupabaseClient } from '../lib/supabase.ts';
import type {
  AdminStats,
  GameName,
  Order,
  OrderStatus,
  PaymentMethod,
  Product,
  ProductCategory,
  User,
} from '../types.ts';

const TOKEN_STORAGE_KEY = 'karsaplay_auth_token';

function mapAuthErrorMessage(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('already registered') || lower.includes('already exists')) {
    return 'Email sudah terdaftar. Silakan gunakan tab Masuk.';
  }
  if (lower.includes('invalid login credentials')) {
    return 'Email atau kata sandi salah.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Email Anda belum dikonfirmasi. Silakan cek inbox atau folder spam email Anda terlebih dahulu.';
  }
  if (lower.includes('password') && lower.includes('6')) {
    return 'Kata sandi minimal 6 karakter.';
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'Terlalu banyak percobaan. Silakan tunggu beberapa saat lalu coba lagi.';
  }
  return raw;
}

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage restriction errors
  }
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json')
    ? ((await response.json().catch(() => ({}))) as Record<string, unknown>)
    : {};

  if (!response.ok) {
    const message =
      typeof data.error === 'string' && data.error.length > 0
        ? data.error
        : `Permintaan gagal (${response.status}).`;
    throw new Error(message);
  }

  if (!contentType.includes('application/json')) {
    throw new Error('Respon server bukan JSON. Pastikan backend API sedang berjalan.');
  }

  return data as T;
}

export interface RegisterResult {
  token: string;
  user: User;
}

export async function registerAccount(payload: {
  name: string;
  email: string;
  password: string;
  whatsapp: string;
}): Promise<RegisterResult> {
  const email = payload.email.trim().toLowerCase();
  const name = payload.name.trim();
  const whatsapp = payload.whatsapp.trim();

  const supabase = await getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password: payload.password,
      options: {
        data: {
          name,
          full_name: name,
          phone: whatsapp,
          whatsapp,
        },
      },
    });

    if (error) {
      throw new Error(mapAuthErrorMessage(error.message));
    }

    if (data.user) {
      // Jangan kirim field id (int8 auto-increment); simpan data.user.id ke auth_id
      await supabase.from('users').upsert(
        {
          auth_id: data.user.id,
          email,
          name,
          full_name: name,
          phone: whatsapp,
          role: 'user',
        },
        { onConflict: 'email' }
      );

      const synced = await apiRequest<{ token: string; user: User }>('/api/auth/register-sync', {
        method: 'POST',
        body: JSON.stringify({
          authId: data.user.id,
          email,
          name,
          whatsapp,
          accessToken: data.session?.access_token ?? '',
        }),
      });
      setStoredToken(synced.token);
      return synced;
    }
  }

  const result = await apiRequest<RegisterResult>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name,
      email,
      password: payload.password,
      whatsapp,
    }),
  });
  setStoredToken(result.token);
  return result;
}

export async function loginAccount(payload: {
  email: string;
  password: string;
}): Promise<{ token: string; user: User }> {
  const email = payload.email.trim().toLowerCase();
  const supabase = await getSupabaseClient();

  if (supabase) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: payload.password,
    });

    if (!error && data.session?.access_token) {
      const exchanged = await apiRequest<{ token: string; user: User }>(
        '/api/auth/supabase-session',
        {
          method: 'POST',
          body: JSON.stringify({ accessToken: data.session.access_token }),
        }
      );
      setStoredToken(exchanged.token);
      return exchanged;
    }

    if (error && error.message.toLowerCase().includes('email not confirmed')) {
      throw new Error(mapAuthErrorMessage(error.message));
    }
  }

  const result = await apiRequest<{ token: string; user: User }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: payload.password }),
  });
  setStoredToken(result.token);
  return result;
}

export async function logoutAccount(): Promise<void> {
  try {
    const supabase = await getSupabaseClient();
    await supabase?.auth.signOut().catch(() => {});
    await apiRequest<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
  } finally {
    setStoredToken(null);
  }
}

export async function fetchCurrentUser(): Promise<User> {
  const result = await apiRequest<{ user: User }>('/api/auth/me');
  return result.user;
}

function mapSupabaseProductRow(row: Record<string, unknown>): Product {
  return {
    id: Number(row.id),
    name: String(row.name ?? ''),
    game: (String(row.game ?? 'Mobile Legends') as GameName),
    category: (String(row.category ?? 'topup') as ProductCategory),
    rankTier: String(row.rank_tier ?? ''),
    price: Number(row.price ?? 0),
    unitLabel: String(row.unit_label ?? ''),
    description: String(row.description ?? ''),
    imageUrl: String(row.image_url ?? ''),
    isPopular: Boolean(row.is_popular),
    isActive: row.is_active !== false,
    createdAt: String(row.created_at ?? ''),
  };
}

export async function fetchProducts(includeInactive = false): Promise<Product[]> {
  try {
    const query = includeInactive ? '?includeInactive=true' : '';
    const token = getStoredToken();
    const headers = new Headers();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    const response = await fetch(`/api/products${query}`, { headers });
    const contentType = response.headers.get('content-type') ?? '';
    if (response.ok && contentType.includes('application/json')) {
      const result = (await response.json().catch(() => ({}))) as { products?: unknown };
      if (Array.isArray(result.products)) {
        return result.products as Product[];
      }
    }
  } catch {
    // Fallback ke Supabase publik jika endpoint backend tidak tersedia
  }

  const supabase = await getSupabaseClient();
  if (supabase) {
    let sbQuery = supabase
      .from('products')
      .select('*')
      .order('category', { ascending: true })
      .order('game', { ascending: true })
      .order('price', { ascending: true });

    if (!includeInactive) {
      sbQuery = sbQuery.eq('is_active', true);
    }

    const { data, error } = await sbQuery;
    if (!error && Array.isArray(data)) {
      return data.map((row) => mapSupabaseProductRow(row as Record<string, unknown>));
    }
  }

  return [];
}

export interface ProductPayload {
  name: string;
  game: GameName;
  category: ProductCategory;
  rankTier: string;
  price: number;
  unitLabel: string;
  description: string;
  isPopular: boolean;
  isActive: boolean;
}

export async function createProduct(payload: ProductPayload): Promise<Product> {
  const result = await apiRequest<{ product: Product }>('/api/products', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return result.product;
}

export async function updateProduct(id: number, payload: ProductPayload): Promise<Product> {
  const result = await apiRequest<{ product: Product }>(`/api/products/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return result.product;
}

export async function deleteProduct(id: number): Promise<void> {
  await apiRequest<{ ok: boolean }>(`/api/products/${id}`, {
    method: 'DELETE',
  });
}

export async function fetchOrders(): Promise<Order[]> {
  const result = await apiRequest<{ orders?: Order[] }>('/api/orders');
  return Array.isArray(result?.orders) ? result.orders : [];
}

export async function createOrder(payload: {
  productId: number;
  quantity: number;
  targetAccountId: string;
  targetServer: string;
  jokiCurrentRank: string;
  jokiTargetRank: string;
  jokiNotes: string;
  paymentMethod: PaymentMethod;
}): Promise<Order> {
  const result = await apiRequest<{ order: Order }>('/api/orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return result.order;
}

export async function updateOrderStatus(id: number, status: OrderStatus): Promise<Order> {
  const result = await apiRequest<{ order: Order }>(`/api/orders/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  return result.order;
}

export async function fetchAdminStats(): Promise<AdminStats> {
  const result = await apiRequest<{ stats: AdminStats }>('/api/admin/stats');
  return result.stats;
}
