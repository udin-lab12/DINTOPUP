import { getSupabaseClient } from '../lib/supabase.ts';
import {
  GAME_META,
  JOKI_RANK_IMAGES,
  MAX_JOKI_STARS,
  MAX_ORDER_TOTAL_PRICE,
  MAX_TOPUP_QUANTITY,
} from './format.ts';
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

function formatSupabaseError(
  error: { message?: string; details?: string | null; hint?: string | null } | null,
  fallback: string
): string {
  if (!error) return fallback;
  const parts = [error.message, error.details, error.hint].filter(
    (v): v is string => typeof v === 'string' && v.trim().length > 0
  );
  return parts.length > 0 ? parts.join(' — ') : fallback;
}

function generateOrderCode(): string {
  const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const bytes = new Uint32Array(1);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    bytes[0] = Math.floor(Math.random() * 10000);
  }
  const randPart = 1000 + (bytes[0] % 9000);
  return `KP-${datePart}-${randPart}`;
}

export interface RegisterResult {
  token: string;
  user: User;
}

function mapSupabaseProfileToUser(
  row: Record<string, unknown> | null | undefined,
  fallback: {
    id: string;
    email: string;
    name?: string;
    whatsapp?: string;
  }
): User {
  const email = String(row?.email ?? fallback.email).trim().toLowerCase();
  const rawName = String(
    row?.name ?? row?.full_name ?? fallback.name ?? (email.split('@')[0] || 'Pelanggan')
  ).trim();
  const rawPhone = String(row?.phone ?? row?.whatsapp ?? fallback.whatsapp ?? '').trim();
  const rawRole = String(row?.role ?? 'user').toLowerCase();
  const rawId = row?.id;

  return {
    id:
      typeof rawId === 'number' || (typeof rawId === 'string' && rawId.trim().length > 0)
        ? (rawId as number | string)
        : fallback.id,
    name: rawName || 'Pelanggan',
    email,
    role: rawRole === 'admin' ? 'admin' : 'user',
    whatsapp: rawPhone,
    createdAt: String(row?.created_at ?? new Date().toISOString()),
  };
}

async function fetchOrSyncSupabaseUserProfile(
  authUser: {
    id: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
  },
  overrides?: {
    name?: string;
    whatsapp?: string;
  }
): Promise<User> {
  const email = (authUser.email ?? '').trim().toLowerCase();
  const meta = authUser.user_metadata ?? {};
  const fallbackName = String(
    overrides?.name ?? meta.name ?? meta.full_name ?? (email.split('@')[0] || 'Pelanggan')
  ).trim();
  const fallbackWhatsapp = String(overrides?.whatsapp ?? meta.phone ?? meta.whatsapp ?? '').trim();

  const supabase = await getSupabaseClient();
  if (!supabase) {
    return mapSupabaseProfileToUser(null, {
      id: authUser.id,
      email,
      name: fallbackName,
      whatsapp: fallbackWhatsapp,
    });
  }

  // Coba baca profil user yang sudah ada berdasarkan email atau auth_id
  if (email) {
    const { data: byEmail } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();
    if (byEmail) {
      return mapSupabaseProfileToUser(byEmail as Record<string, unknown>, {
        id: authUser.id,
        email,
        name: fallbackName,
        whatsapp: fallbackWhatsapp,
      });
    }
  }

  const { data: byAuthId } = await supabase
    .from('users')
    .select('*')
    .eq('auth_id', authUser.id)
    .maybeSingle();
  if (byAuthId) {
    return mapSupabaseProfileToUser(byAuthId as Record<string, unknown>, {
      id: authUser.id,
      email,
      name: fallbackName,
      whatsapp: fallbackWhatsapp,
    });
  }

  // Upsert profil baru tanpa mengirim id agar kolom id int8 terisi otomatis oleh database
  if (email) {
    const { data: upserted } = await supabase
      .from('users')
      .upsert(
        {
          auth_id: authUser.id,
          email,
          name: fallbackName,
          full_name: fallbackName,
          phone: fallbackWhatsapp,
          role: 'user',
        },
        { onConflict: 'email' }
      )
      .select('*')
      .maybeSingle();

    if (upserted) {
      return mapSupabaseProfileToUser(upserted as Record<string, unknown>, {
        id: authUser.id,
        email,
        name: fallbackName,
        whatsapp: fallbackWhatsapp,
      });
    }
  }

  return mapSupabaseProfileToUser(null, {
    id: authUser.id,
    email,
    name: fallbackName,
    whatsapp: fallbackWhatsapp,
  });
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
  if (!supabase) {
    throw new Error('Koneksi Supabase belum tersedia. Silakan muat ulang halaman.');
  }

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

  if (!data.user) {
    throw new Error('Pendaftaran berhasil dikirim, namun data akun tidak dikembalikan oleh Supabase.');
  }

  // Simpan profil user ke tabel public.users tanpa field id (id int8 diisi otomatis oleh database)
  const { data: profileRow } = await supabase
    .from('users')
    .upsert(
      {
        auth_id: data.user.id,
        email,
        name,
        full_name: name,
        phone: whatsapp,
        role: 'user',
      },
      { onConflict: 'email' }
    )
    .select('*')
    .maybeSingle();

  const user = mapSupabaseProfileToUser(profileRow as Record<string, unknown> | null, {
    id: data.user.id,
    email,
    name,
    whatsapp,
  });

  const token = data.session?.access_token ?? '';
  setStoredToken(token || null);
  return { token, user };
}

export async function loginAccount(payload: {
  email: string;
  password: string;
}): Promise<{ token: string; user: User }> {
  const email = payload.email.trim().toLowerCase();
  const supabase = await getSupabaseClient();

  if (!supabase) {
    throw new Error('Koneksi Supabase belum tersedia. Silakan muat ulang halaman.');
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: payload.password,
  });

  if (error) {
    throw new Error(mapAuthErrorMessage(error.message));
  }

  if (!data.user) {
    throw new Error('Akun tidak ditemukan. Silakan periksa kembali email dan kata sandi Anda.');
  }

  const user = await fetchOrSyncSupabaseUserProfile({
    id: data.user.id,
    email: data.user.email ?? email,
    user_metadata: (data.user.user_metadata ?? {}) as Record<string, unknown>,
  });

  const token = data.session?.access_token ?? '';
  setStoredToken(token || null);
  return { token, user };
}

export async function logoutAccount(): Promise<void> {
  try {
    const supabase = await getSupabaseClient();
    await supabase?.auth.signOut().catch(() => {});
  } finally {
    setStoredToken(null);
  }
}

export async function fetchCurrentUser(): Promise<User | null> {
  const supabase = await getSupabaseClient();
  if (!supabase) return null;

  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session?.user) {
    setStoredToken(null);
    return null;
  }

  setStoredToken(session.access_token || null);
  return fetchOrSyncSupabaseUserProfile({
    id: session.user.id,
    email: session.user.email,
    user_metadata: (session.user.user_metadata ?? {}) as Record<string, unknown>,
  });
}

function mapSupabaseProductRow(row: Record<string, unknown>): Product {
  return {
    id: Number(row.id),
    name: String(row.name ?? ''),
    game: String(row.game ?? 'Mobile Legends') as GameName,
    category: String(row.category ?? 'topup') as ProductCategory,
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

function mapSupabaseOrderRow(row: Record<string, unknown>): Order {
  const joinedUser = row.users as { name?: string; full_name?: string; email?: string } | null;
  const rawUserId = row.user_id;
  const userId =
    typeof rawUserId === 'number'
      ? rawUserId
      : typeof rawUserId === 'string' && /^\d+$/.test(rawUserId.trim())
      ? Number(rawUserId.trim())
      : rawUserId !== null && rawUserId !== undefined
      ? String(rawUserId)
      : '';

  return {
    id: Number(row.id),
    orderCode: String(row.order_code ?? ''),
    userId,
    userName: row.user_name
      ? String(row.user_name)
      : joinedUser?.name || joinedUser?.full_name || undefined,
    userEmail: row.user_email ? String(row.user_email) : joinedUser?.email || undefined,
    productId: Number(row.product_id ?? 0),
    productName: String(row.product_name ?? ''),
    game: String(row.game ?? 'Mobile Legends') as GameName,
    category: String(row.category ?? 'topup') as ProductCategory,
    quantity: Number(row.quantity ?? 1),
    totalPrice: Number(row.total_price ?? 0),
    targetAccountId: String(row.target_account_id ?? ''),
    targetServer: String(row.target_server ?? ''),
    jokiCurrentRank: String(row.joki_current_rank ?? ''),
    jokiTargetRank: String(row.joki_target_rank ?? ''),
    jokiNotes: String(row.joki_notes ?? ''),
    paymentMethod: String(row.payment_method ?? 'QRIS') as PaymentMethod,
    status: String(row.status ?? 'pending') as OrderStatus,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function resolveProductImageUrl(payload: {
  game: GameName;
  category: ProductCategory;
  rankTier: string;
}): string {
  if (payload.category === 'joki' && payload.rankTier && JOKI_RANK_IMAGES[payload.rankTier]) {
    return JOKI_RANK_IMAGES[payload.rankTier];
  }
  return GAME_META[payload.game]?.imageUrl ?? '';
}

export async function fetchProducts(includeInactive = false): Promise<Product[]> {
  const supabase = await getSupabaseClient();
  if (!supabase) {
    throw new Error('Koneksi Supabase belum tersedia. Silakan muat ulang halaman.');
  }

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
  if (error) {
    console.error('Supabase fetchProducts error:', error);
    throw new Error(formatSupabaseError(error, 'Gagal memuat daftar produk dari Supabase.'));
  }

  return Array.isArray(data)
    ? data.map((row) => mapSupabaseProductRow(row as Record<string, unknown>))
    : [];
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
  const supabase = await getSupabaseClient();
  if (!supabase) {
    throw new Error('Koneksi Supabase belum tersedia.');
  }

  const name = payload.name.trim();
  const unitLabel = payload.unitLabel.trim();
  const description = payload.description.trim();
  const rankTier = payload.category === 'joki' ? payload.rankTier.trim() : '';
  const price = Math.round(Number(payload.price));

  if (name.length < 3 || name.length > 120) {
    throw new Error('Nama produk harus antara 3 hingga 120 karakter.');
  }
  if (!Number.isInteger(price) || price < 1000) {
    throw new Error('Harga harus berupa angka bulat minimal Rp 1.000.');
  }
  if (!unitLabel || !description) {
    throw new Error('Satuan dan deskripsi produk wajib diisi.');
  }

  const { data, error } = await supabase
    .from('products')
    .insert({
      name,
      game: payload.game,
      category: payload.category,
      rank_tier: rankTier,
      price,
      unit_label: unitLabel,
      description,
      image_url: resolveProductImageUrl({
        game: payload.game,
        category: payload.category,
        rankTier,
      }),
      is_popular: Boolean(payload.isPopular),
      is_active: payload.isActive !== false,
      created_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error || !data) {
    console.error('Supabase createProduct error:', error);
    throw new Error(formatSupabaseError(error, 'Gagal menambahkan produk baru ke Supabase.'));
  }

  return mapSupabaseProductRow(data as Record<string, unknown>);
}

export async function updateProduct(id: number, payload: ProductPayload): Promise<Product> {
  const supabase = await getSupabaseClient();
  if (!supabase) {
    throw new Error('Koneksi Supabase belum tersedia.');
  }

  const name = payload.name.trim();
  const unitLabel = payload.unitLabel.trim();
  const description = payload.description.trim();
  const rankTier = payload.category === 'joki' ? payload.rankTier.trim() : '';
  const price = Math.round(Number(payload.price));

  if (name.length < 3) {
    throw new Error('Nama produk minimal 3 karakter.');
  }
  if (!Number.isInteger(price) || price < 1000) {
    throw new Error('Harga minimal Rp 1.000.');
  }

  const { data, error } = await supabase
    .from('products')
    .update({
      name,
      game: payload.game,
      category: payload.category,
      rank_tier: rankTier,
      price,
      unit_label: unitLabel,
      description,
      image_url: resolveProductImageUrl({
        game: payload.game,
        category: payload.category,
        rankTier,
      }),
      is_popular: Boolean(payload.isPopular),
      is_active: payload.isActive !== false,
    })
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('Supabase updateProduct error:', error);
    throw new Error(formatSupabaseError(error, 'Gagal memperbarui produk di Supabase.'));
  }
  if (!data) {
    throw new Error('Produk tidak ditemukan atau tidak memiliki izin untuk mengubah data.');
  }

  return mapSupabaseProductRow(data as Record<string, unknown>);
}

export async function deleteProduct(id: number): Promise<void> {
  const supabase = await getSupabaseClient();
  if (!supabase) {
    throw new Error('Koneksi Supabase belum tersedia.');
  }

  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) {
    console.error('Supabase deleteProduct error:', error);
    throw new Error(formatSupabaseError(error, 'Gagal menghapus produk di Supabase.'));
  }
}

export async function fetchOrders(): Promise<Order[]> {
  const supabase = await getSupabaseClient();
  if (!supabase) {
    throw new Error('Koneksi Supabase belum tersedia.');
  }

  const currentUser = await fetchCurrentUser();
  if (!currentUser) {
    return [];
  }

  if (currentUser.role === 'admin') {
    const joined = await supabase
      .from('orders')
      .select('*, users(name, full_name, email)')
      .order('created_at', { ascending: false });

    if (!joined.error) {
      return Array.isArray(joined.data)
        ? joined.data.map((row) => mapSupabaseOrderRow(row as Record<string, unknown>))
        : [];
    }

    // Fallback tanpa join relasi jika FK / RLS join tidak tersedia
    const plain = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (plain.error) {
      console.error('Supabase fetchOrders admin error:', plain.error);
      throw new Error(formatSupabaseError(plain.error, 'Gagal memuat semua pesanan dari Supabase.'));
    }

    return Array.isArray(plain.data)
      ? plain.data.map((row) => mapSupabaseOrderRow(row as Record<string, unknown>))
      : [];
  }

  if (!/^\d+$/.test(String(currentUser.id))) {
    return [];
  }

  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('user_id', Number(currentUser.id))
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Supabase fetchOrders user error:', error);
    throw new Error(formatSupabaseError(error, 'Gagal memuat riwayat pesanan dari Supabase.'));
  }

  return Array.isArray(data)
    ? data.map((row) => mapSupabaseOrderRow(row as Record<string, unknown>))
    : [];
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
  const supabase = await getSupabaseClient();
  if (!supabase) {
    throw new Error('Koneksi Supabase belum tersedia.');
  }

  const quantity = Math.round(Number(payload.quantity));
  const targetAccountId = payload.targetAccountId.trim();
  const targetServer = payload.targetServer.trim();
  const jokiCurrentRank = payload.jokiCurrentRank.trim();
  const jokiTargetRank = payload.jokiTargetRank.trim();
  const jokiNotes = payload.jokiNotes.trim();

  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error('Jumlah pesanan minimal 1.');
  }
  if (targetAccountId.length < 3 || targetAccountId.length > 100) {
    throw new Error('ID Akun / Email Login Game wajib diisi dengan benar.');
  }

  const { data: productRow, error: productErr } = await supabase
    .from('products')
    .select('*')
    .eq('id', payload.productId)
    .maybeSingle();

  if (productErr) {
    console.error('Supabase product lookup error:', productErr);
    throw new Error(formatSupabaseError(productErr, 'Gagal memverifikasi produk di Supabase.'));
  }
  if (!productRow || productRow.is_active === false) {
    throw new Error('Produk tidak tersedia atau sedang dinonaktifkan.');
  }

  const product = mapSupabaseProductRow(productRow as Record<string, unknown>);
  const maxQty = product.category === 'joki' ? MAX_JOKI_STARS : MAX_TOPUP_QUANTITY;
  if (quantity > maxQty) {
    throw new Error(
      product.category === 'joki'
        ? `Jumlah bintang joki maksimal ${maxQty} per transaksi.`
        : `Jumlah paket top-up maksimal ${maxQty} per transaksi.`
    );
  }

  const totalPrice = product.price * quantity;
  if (!Number.isSafeInteger(totalPrice) || totalPrice > MAX_ORDER_TOTAL_PRICE) {
    throw new Error('Total nominal transaksi melebihi batas maksimal Rp 50.000.000 per pesanan.');
  }

  if (product.game === 'Mobile Legends' && product.category === 'topup' && !targetServer) {
    throw new Error('Zone ID Mobile Legends wajib diisi.');
  }
  if (product.game === 'Genshin Impact' && !targetServer) {
    throw new Error('Pilih server Genshin Impact terlebih dahulu.');
  }
  if (product.category === 'joki' && (!jokiCurrentRank || !jokiTargetRank)) {
    throw new Error('Rank saat ini dan target rank joki wajib diisi.');
  }

  const currentUser = await fetchCurrentUser().catch(() => null);
  const resolvedUserId =
    currentUser && /^\d+$/.test(String(currentUser.id)) ? Number(currentUser.id) : null;

  const basePayload: Record<string, unknown> = {
    order_code: generateOrderCode(),
    product_id: product.id,
    product_name: product.name,
    game: product.game,
    category: product.category,
    quantity,
    total_price: totalPrice,
    target_account_id: targetAccountId,
    target_server: targetServer,
    joki_current_rank: jokiCurrentRank,
    joki_target_rank: jokiTargetRank,
    joki_notes: jokiNotes,
    payment_method: payload.paymentMethod,
    status: 'pending',
    created_at: new Date().toISOString(),
  };

  const payloadWithUser =
    resolvedUserId !== null ? { ...basePayload, user_id: resolvedUserId } : basePayload;

  let { data, error } = await supabase
    .from('orders')
    .insert(payloadWithUser)
    .select('*')
    .single();

  if (
    error &&
    resolvedUserId !== null &&
    (error.code === '22P02' ||
      error.code === '23503' ||
      (error.message ?? '').toLowerCase().includes('user_id'))
  ) {
    console.warn('Retry Supabase orders.insert without user_id:', error.message);
    const retryRes = await supabase.from('orders').insert(basePayload).select('*').single();
    data = retryRes.data;
    error = retryRes.error;
  }

  if (error || !data) {
    console.error('Supabase createOrder error:', error);
    throw new Error(formatSupabaseError(error, 'Gagal menyimpan pesanan ke Supabase.'));
  }

  return mapSupabaseOrderRow(data as Record<string, unknown>);
}

export async function updateOrderStatus(id: number, status: OrderStatus): Promise<Order> {
  const supabase = await getSupabaseClient();
  if (!supabase) {
    throw new Error('Koneksi Supabase belum tersedia.');
  }

  const joined = await supabase
    .from('orders')
    .update({ status })
    .eq('id', id)
    .select('*, users(name, full_name, email)')
    .maybeSingle();

  if (!joined.error && joined.data) {
    return mapSupabaseOrderRow(joined.data as Record<string, unknown>);
  }

  if (joined.error && (joined.error.message ?? '').toLowerCase().includes('relationship')) {
    const plain = await supabase
      .from('orders')
      .update({ status })
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (plain.error) {
      console.error('Supabase updateOrderStatus error:', plain.error);
      throw new Error(formatSupabaseError(plain.error, 'Gagal memperbarui status pesanan.'));
    }
    if (!plain.data) {
      throw new Error('Pesanan tidak ditemukan atau tidak memiliki izin update.');
    }
    return mapSupabaseOrderRow(plain.data as Record<string, unknown>);
  }

  if (joined.error) {
    console.error('Supabase updateOrderStatus error:', joined.error);
    throw new Error(formatSupabaseError(joined.error, 'Gagal memperbarui status pesanan.'));
  }

  throw new Error('Pesanan tidak ditemukan atau tidak memiliki izin update.');
}

export async function fetchAdminStats(): Promise<AdminStats> {
  const supabase = await getSupabaseClient();
  if (!supabase) {
    throw new Error('Koneksi Supabase belum tersedia.');
  }

  const [ordersRes, activeProductsRes, usersRes] = await Promise.all([
    supabase.from('orders').select('total_price, status'),
    supabase.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('users').select('id', { count: 'exact', head: true }),
  ]);

  if (ordersRes.error) {
    console.error('Supabase fetchAdminStats orders error:', ordersRes.error);
    throw new Error(formatSupabaseError(ordersRes.error, 'Gagal memuat statistik pesanan.'));
  }

  const allOrders = Array.isArray(ordersRes.data) ? ordersRes.data : [];
  const totalRevenue = allOrders
    .filter((o) => o.status !== 'cancelled')
    .reduce((acc, o) => acc + Number(o.total_price ?? 0), 0);
  const pendingOrders = allOrders.filter(
    (o) => o.status === 'pending' || o.status === 'processing'
  ).length;

  return {
    totalRevenue,
    totalOrders: allOrders.length,
    pendingOrders,
    activeProducts: activeProductsRes.count ?? 0,
    totalUsers: usersRes.count ?? 0,
  };
}
