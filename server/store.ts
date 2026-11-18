import crypto from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  db,
  hashPassword,
  verifyPassword,
  mapUserRow,
  mapProductRow,
  mapOrderRow,
} from './db.ts';
import type {
  AdminStats,
  GameName,
  Order,
  OrderStatus,
  PaymentMethod,
  Product,
  ProductCategory,
  User,
} from '../src/types.ts';

function cleanEnvValue(raw: string | undefined): string {
  if (!raw) return '';
  return raw.trim().replace(/^['"]+|['"]+$/g, '').trim();
}

function normalizeSupabaseUrl(raw: string): string {
  const cleaned = cleanEnvValue(raw);
  if (!cleaned) return '';

  // Handle Postgres connection string pasted by mistake: db.<ref>.supabase.co
  const pgMatch = cleaned.match(/db\.([a-z0-9-]+)\.supabase\.co/i);
  if (pgMatch && (cleaned.startsWith('postgres://') || cleaned.startsWith('postgresql://'))) {
    return `https://${pgMatch[1]}.supabase.co`;
  }

  // Handle Supabase Dashboard URL: https://supabase.com/dashboard/project/<ref>/...
  const dashboardMatch = cleaned.match(
    /^https?:\/\/(?:app\.)?supabase\.com\/(?:dashboard\/)?project\/([a-z0-9-]+)/i
  );
  if (dashboardMatch) {
    return `https://${dashboardMatch[1]}.supabase.co`;
  }

  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.origin;
    }
  } catch {
    // Try prepending https:// if scheme was omitted (e.g. xyz.supabase.co)
    if (/^[a-z0-9-]+\.supabase\.co/i.test(cleaned)) {
      try {
        return new URL(`https://${cleaned}`).origin;
      } catch {
        return '';
      }
    }
  }

  return '';
}

const DEFAULT_SUPABASE_URL = 'https://umqydufawjccmuqqqupu.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_wnH3w58TBJ7iUjFQzrIwhw_1DuVRX_c';

const RAW_SUPABASE_URL =
  cleanEnvValue(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) || DEFAULT_SUPABASE_URL;
const SUPABASE_URL = normalizeSupabaseUrl(RAW_SUPABASE_URL) || DEFAULT_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  cleanEnvValue(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY) ||
  DEFAULT_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SERVICE_KEY = cleanEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY);
const SUPABASE_KEY = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;

const isSupabaseEnabled =
  SUPABASE_URL.startsWith('https://') && SUPABASE_KEY.length > 20;

const supabase: SupabaseClient | null = isSupabaseEnabled
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

function createEphemeralAuthClient(): SupabaseClient | null {
  const authKey = SUPABASE_ANON_KEY || SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL.startsWith('https://') || authKey.length <= 20) return null;
  return createClient(SUPABASE_URL, authKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function getPublicSupabaseConfig(): {
  supabaseUrl: string;
  supabaseAnonKey: string;
} {
  return {
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
  };
}

if (supabase) {
  console.log(`DINTOPUP storage mode: Supabase PostgreSQL (${new URL(SUPABASE_URL).host})`);
} else if (RAW_SUPABASE_URL) {
  console.warn(
    'SUPABASE_URL terdeteksi tetapi formatnya tidak valid; sementara memakai SQLite lokal.'
  );
} else {
  console.log(
    'DINTOPUP storage mode: Local SQLite (set SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY to use Supabase)'
  );
}

let supabaseSeeded = false;

async function ensureSupabaseSeeded(): Promise<void> {
  if (!supabase || supabaseSeeded) return;

  const { data: userSample, error: userErr } = await supabase
    .from('users')
    .select('id')
    .limit(1);

  if (userErr) {
    throw new Error(
      `Koneksi Supabase gagal (${userErr.message}). Pastikan SUPABASE_URL berformat https://<project-ref>.supabase.co dan skrip supabase/schema.sql sudah dijalankan di SQL Editor Supabase.`
    );
  }

  if (!Array.isArray(userSample)) {
    throw new Error(
      'Respon Supabase tidak valid. Periksa kembali SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY pada panel Secrets.'
    );
  }

  const userCount = userSample.length;

  if ((userCount ?? 0) === 0) {
    const now = new Date().toISOString();
    await supabase.from('users').insert([
      {
        name: 'Admin DINTOPUP',
        email: 'admin@dintopup.id',
        password_hash: hashPassword('Admin123!'),
        role: 'admin',
        whatsapp: '0895336487682',
        created_at: now,
      },
      {
        name: 'Budi Santoso',
        email: 'budi@dintopup.id',
        password_hash: hashPassword('User123!'),
        role: 'user',
        whatsapp: '081234567890',
        created_at: now,
      },
    ]);
  }

  const { data: productSample, error: productErr } = await supabase
    .from('products')
    .select('id')
    .limit(1);

  if (productErr) {
    throw new Error(
      `Tabel products Supabase belum siap (${productErr.message}). Jalankan skrip supabase/schema.sql di SQL Editor Supabase.`
    );
  }

  if ((productSample?.length ?? 0) === 0) {
    const sqliteProducts = db
      .prepare('SELECT * FROM products ORDER BY id ASC')
      .all() as Record<string, unknown>[];

    if (sqliteProducts.length > 0) {
      await supabase.from('products').insert(
        sqliteProducts.map((p) => ({
          name: String(p.name),
          game: String(p.game),
          category: String(p.category),
          rank_tier: String(p.rank_tier ?? ''),
          price: Number(p.price),
          unit_label: String(p.unit_label),
          description: String(p.description),
          image_url: String(p.image_url),
          is_popular: Boolean(p.is_popular),
          is_active: Boolean(p.is_active),
          created_at: String(p.created_at),
        }))
      );
    }
  } else {
    const officialPriceUpdates: Array<[string, number, number]> = [
      ['86 Diamonds (78 + 8 Bonus)', 22500, 22000],
      ['172 Diamonds (156 + 16 Bonus)', 44500, 44000],
      ['344 Diamonds (312 + 32 Bonus)', 89000, 88000],
      ['Weekly Diamond Pass', 28000, 27500],
      ['140 Diamonds Free Fire', 19500, 18018],
      ['355 Diamonds Free Fire', 48000, 45045],
      ['720 Diamonds Free Fire', 95000, 90090],
      ['325 UC (300 + 25 Bonus)', 74000, 89000],
      ['660 UC (600 + 60 Bonus)', 148000, 155000],
      ['1800 UC (1500 + 300 Bonus)', 370000, 447000],
      ['980 + 110 Genesis Crystals', 189000, 249000],
      ['1980 + 260 Genesis Crystals', 389000, 479000],
    ];
    const rankImageUpdates: Array<[string, string]> = [
      ['Mythic', '/assets/aistudio/images__2__16fbf8b8.jpg'],
      ['Mythical Glory', '/assets/aistudio/download_5f99fe78.jpg'],
      ['Mythical Immortal', '/assets/aistudio/images__4__2ca0bd55.jpg'],
      ['Immortal', '/assets/aistudio/images__4__2ca0bd55.jpg'],
    ];
    await Promise.all([
      ...officialPriceUpdates.map(([productName, oldPrice, newPrice]) =>
        supabase
          .from('products')
          .update({ price: newPrice })
          .eq('name', productName)
          .eq('price', oldPrice)
      ),
      ...rankImageUpdates.map(([rankTier, imageUrl]) =>
        supabase
          .from('products')
          .update({ image_url: imageUrl })
          .eq('category', 'joki')
          .eq('rank_tier', rankTier)
      ),
    ]);
  }

  supabaseSeeded = true;
}

export async function findUserById(id: number | string): Promise<User | null> {
  if (supabase) {
    await ensureSupabaseSeeded();
    const idStr = String(id).trim();
    const isNumericId = /^\d+$/.test(idStr);
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq(isNumericId ? 'id' : 'auth_id', isNumericId ? Number(idStr) : idStr)
      .maybeSingle();
    if (error || !data) return null;
    return mapUserRow(data as Record<string, unknown>);
  }

  const row = db
    .prepare('SELECT id, name, email, role, whatsapp, created_at FROM users WHERE id = ?')
    .get(id) as Record<string, unknown> | undefined;
  return row ? mapUserRow(row) : null;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const normalized = email.trim().toLowerCase();
  if (supabase) {
    await ensureSupabaseSeeded();
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', normalized)
      .maybeSingle();
    if (error || !data) return null;
    return mapUserRow(data as Record<string, unknown>);
  }

  const row = db
    .prepare('SELECT id, name, email, role, whatsapp, created_at FROM users WHERE email = ?')
    .get(normalized) as Record<string, unknown> | undefined;
  return row ? mapUserRow(row) : null;
}

export async function findUserByAuthId(authId: string): Promise<User | null> {
  const cleaned = authId.trim();
  if (!cleaned || !supabase) return null;
  await ensureSupabaseSeeded();
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('auth_id', cleaned)
    .maybeSingle();
  if (error || !data) return null;
  return mapUserRow(data as Record<string, unknown>);
}

async function ensurePublicUserProfile(input: {
  authUserId?: string;
  email: string;
  name: string;
  whatsapp: string;
}): Promise<User> {
  if (!supabase) {
    throw new Error('Supabase belum dikonfigurasi pada server.');
  }

  const normalizedEmail = input.email.trim().toLowerCase();

  // Cari berdasarkan email atau auth_id (tanpa menimpa id int8 auto-increment)
  const byEmail = await findUserByEmail(normalizedEmail);
  if (byEmail) return byEmail;

  if (input.authUserId) {
    const byAuthId = await findUserByAuthId(input.authUserId);
    if (byAuthId) return byAuthId;
  }

  const displayName = input.name.trim() || normalizedEmail.split('@')[0] || 'Pelanggan';
  const phone = input.whatsapp.trim();
  const now = new Date().toISOString();

  // Upsert profil tanpa mengirim field id agar database mengisi id int8 otomatis
  const { data: upsertedProfile, error: profileErr } = await supabase
    .from('users')
    .upsert(
      {
        ...(input.authUserId ? { auth_id: input.authUserId } : {}),
        email: normalizedEmail,
        name: displayName,
        full_name: displayName,
        phone,
        role: 'user',
      },
      { onConflict: 'email' }
    )
    .select('*')
    .maybeSingle();

  if (!profileErr && upsertedProfile) {
    return mapUserRow(upsertedProfile as Record<string, unknown>);
  }

  // Fallback jika tabel memakai kolom bawaan (whatsapp, password_hash) tanpa auth_id/full_name/phone
  const { data: insertedLegacy, error: legacyErr } = await supabase
    .from('users')
    .upsert(
      {
        name: displayName,
        email: normalizedEmail,
        password_hash: '',
        role: 'user',
        whatsapp: phone,
        created_at: now,
      },
      { onConflict: 'email' }
    )
    .select('*')
    .maybeSingle();

  if (!legacyErr && insertedLegacy) {
    return mapUserRow(insertedLegacy as Record<string, unknown>);
  }

  const retryEmail = await findUserByEmail(normalizedEmail);
  if (retryEmail) return retryEmail;

  return {
    id: input.authUserId || normalizedEmail,
    name: displayName,
    email: normalizedEmail,
    role: 'user',
    whatsapp: phone,
    createdAt: now,
  };
}

export async function resolveUserFromSupabaseAccessToken(accessToken: string): Promise<User> {
  if (!supabase) {
    throw new Error('Supabase belum dikonfigurasi pada server.');
  }

  await ensureSupabaseSeeded();
  const authClient = createEphemeralAuthClient() ?? supabase;
  const { data, error } = await authClient.auth.getUser(accessToken);

  if (error || !data.user || !data.user.email) {
    throw new Error('Sesi Supabase Auth tidak valid atau telah kedaluwarsa.');
  }

  const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  return ensurePublicUserProfile({
    authUserId: data.user.id,
    email: data.user.email,
    name: String(meta.name ?? meta.full_name ?? data.user.email.split('@')[0] ?? 'Pelanggan'),
    whatsapp: String(meta.phone ?? meta.whatsapp ?? ''),
  });
}

export async function syncRegisteredSupabaseUser(input: {
  userId: string;
  email: string;
  name: string;
  whatsapp: string;
  accessToken?: string;
}): Promise<User> {
  if (!supabase) {
    throw new Error('Supabase belum dikonfigurasi pada server.');
  }

  await ensureSupabaseSeeded();
  const normalizedEmail = input.email.trim().toLowerCase();

  let verifiedEmail = normalizedEmail;
  let verifiedUserId = input.userId.trim();

  if (input.accessToken) {
    const authClient = createEphemeralAuthClient() ?? supabase;
    const { data, error } = await authClient.auth.getUser(input.accessToken);
    if (error || !data.user?.email) {
      throw new Error('Gagal memverifikasi sesi akun baru.');
    }
    verifiedEmail = data.user.email.toLowerCase();
    verifiedUserId = data.user.id;
  } else if (SUPABASE_SERVICE_KEY && verifiedUserId) {
    const { data, error } = await supabase.auth.admin.getUserById(verifiedUserId);
    if (error || !data.user?.email || data.user.email.toLowerCase() !== normalizedEmail) {
      throw new Error('Data akun Supabase Auth tidak valid.');
    }
    verifiedEmail = data.user.email.toLowerCase();
    verifiedUserId = data.user.id;
  }

  return ensurePublicUserProfile({
    authUserId: verifiedUserId,
    email: verifiedEmail,
    name: input.name,
    whatsapp: input.whatsapp,
  });
}

export async function verifyUserCredentials(
  email: string,
  password: string
): Promise<User | null> {
  const normalizedEmail = email.trim().toLowerCase();

  if (supabase) {
    await ensureSupabaseSeeded();
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (data) {
      const row = data as Record<string, unknown>;
      const storedHash = String(row.password_hash ?? '');
      if (storedHash && verifyPassword(password, storedHash)) {
        return mapUserRow(row);
      }
    }

    const authClient = createEphemeralAuthClient();
    if (authClient) {
      const { data: authData, error: authErr } = await authClient.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (!authErr && authData.user?.email) {
        const meta = (authData.user.user_metadata ?? {}) as Record<string, unknown>;
        return ensurePublicUserProfile({
          authUserId: authData.user.id,
          email: authData.user.email,
          name: String(meta.name ?? meta.full_name ?? authData.user.email.split('@')[0] ?? 'Pelanggan'),
          whatsapp: String(meta.phone ?? meta.whatsapp ?? ''),
        });
      }
    }

    return null;
  }

  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail) as
    | Record<string, unknown>
    | undefined;
  if (!row || !verifyPassword(password, String(row.password_hash))) return null;
  return mapUserRow(row);
}

export async function createUser(input: {
  name: string;
  email: string;
  password: string;
  whatsapp: string;
}): Promise<{ user: User; requiresEmailConfirmation: boolean }> {
  const now = new Date().toISOString();
  const normalizedEmail = input.email.trim().toLowerCase();

  if (supabase) {
    await ensureSupabaseSeeded();
    const authClient = createEphemeralAuthClient() ?? supabase;

    const { data, error } = await authClient.auth.signUp({
      email: normalizedEmail,
      password: input.password,
      options: {
        data: {
          name: input.name,
          full_name: input.name,
          phone: input.whatsapp,
          whatsapp: input.whatsapp,
        },
      },
    });

    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('already registered') || msg.includes('already exists')) {
        throw new Error('EMAIL_EXISTS');
      }
      throw new Error(error.message);
    }

    const syncedUser = await ensurePublicUserProfile({
      authUserId: data.user?.id,
      email: normalizedEmail,
      name: input.name,
      whatsapp: input.whatsapp,
    });

    return { user: syncedUser, requiresEmailConfirmation: false };
  }

  const passwordHash = hashPassword(input.password);
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) {
    throw new Error('EMAIL_EXISTS');
  }

  const result = db
    .prepare(
      `INSERT INTO users (name, email, password_hash, role, whatsapp, created_at)
       VALUES (?, ?, ?, 'user', ?, ?)`
    )
    .run(input.name, normalizedEmail, passwordHash, input.whatsapp, now);

  const userRow = db
    .prepare('SELECT id, name, email, role, whatsapp, created_at FROM users WHERE id = ?')
    .get(Number(result.lastInsertRowid)) as Record<string, unknown>;
  return { user: mapUserRow(userRow), requiresEmailConfirmation: false };
}

export async function listProducts(includeInactive: boolean): Promise<Product[]> {
  if (supabase) {
    await ensureSupabaseSeeded();
    let query = supabase
      .from('products')
      .select('*')
      .order('category', { ascending: true })
      .order('game', { ascending: true })
      .order('price', { ascending: true });

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => mapProductRow(row as Record<string, unknown>));
  }

  const rows = includeInactive
    ? (db
        .prepare('SELECT * FROM products ORDER BY category ASC, game ASC, price ASC')
        .all() as Record<string, unknown>[])
    : (db
        .prepare('SELECT * FROM products WHERE is_active = 1 ORDER BY category ASC, game ASC, price ASC')
        .all() as Record<string, unknown>[]);
  return rows.map(mapProductRow);
}

export async function createProductRecord(input: {
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
}): Promise<Product> {
  const now = new Date().toISOString();

  if (supabase) {
    await ensureSupabaseSeeded();
    const { data, error } = await supabase
      .from('products')
      .insert({
        name: input.name,
        game: input.game,
        category: input.category,
        rank_tier: input.rankTier,
        price: input.price,
        unit_label: input.unitLabel,
        description: input.description,
        image_url: input.imageUrl,
        is_popular: input.isPopular,
        is_active: input.isActive,
        created_at: now,
      })
      .select('*')
      .single();

    if (error || !data) throw new Error(error?.message || 'Gagal menambah produk.');
    return mapProductRow(data as Record<string, unknown>);
  }

  const result = db
    .prepare(
      `INSERT INTO products (name, game, category, rank_tier, price, unit_label, description, image_url, is_popular, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.name,
      input.game,
      input.category,
      input.rankTier,
      input.price,
      input.unitLabel,
      input.description,
      input.imageUrl,
      input.isPopular ? 1 : 0,
      input.isActive ? 1 : 0,
      now
    );

  const created = db
    .prepare('SELECT * FROM products WHERE id = ?')
    .get(Number(result.lastInsertRowid)) as Record<string, unknown>;
  return mapProductRow(created);
}

export async function findProductById(id: number): Promise<Product | null> {
  if (supabase) {
    await ensureSupabaseSeeded();
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return null;
    return mapProductRow(data as Record<string, unknown>);
  }

  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? mapProductRow(row) : null;
}

export async function updateProductRecord(
  id: number,
  input: {
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
  }
): Promise<Product | null> {
  if (supabase) {
    await ensureSupabaseSeeded();
    const { data, error } = await supabase
      .from('products')
      .update({
        name: input.name,
        game: input.game,
        category: input.category,
        rank_tier: input.rankTier,
        price: input.price,
        unit_label: input.unitLabel,
        description: input.description,
        image_url: input.imageUrl,
        is_popular: input.isPopular,
        is_active: input.isActive,
      })
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? mapProductRow(data as Record<string, unknown>) : null;
  }

  const result = db
    .prepare(
      `UPDATE products
       SET name = ?, game = ?, category = ?, rank_tier = ?, price = ?, unit_label = ?, description = ?, image_url = ?, is_popular = ?, is_active = ?
       WHERE id = ?`
    )
    .run(
      input.name,
      input.game,
      input.category,
      input.rankTier,
      input.price,
      input.unitLabel,
      input.description,
      input.imageUrl,
      input.isPopular ? 1 : 0,
      input.isActive ? 1 : 0,
      id
    );

  if (result.changes === 0) return null;
  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as Record<
    string,
    unknown
  >;
  return mapProductRow(updated);
}

export async function deleteProductRecord(id: number): Promise<boolean> {
  if (supabase) {
    await ensureSupabaseSeeded();
    const { error, count } = await supabase
      .from('products')
      .delete({ count: 'exact' })
      .eq('id', id);
    if (error) throw new Error(error.message);
    return (count ?? 0) > 0;
  }

  const result = db.prepare('DELETE FROM products WHERE id = ?').run(id);
  return result.changes > 0;
}

export async function listOrdersForUser(user: User): Promise<Order[]> {
  if (supabase) {
    await ensureSupabaseSeeded();
    if (user.role === 'admin') {
      const { data, error } = await supabase
        .from('orders')
        .select('*, users(name, email)')
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);

      return (data ?? []).map((row) => {
        const record = row as Record<string, unknown>;
        const joinedUser = record.users as { name?: string; email?: string } | null;
        return mapOrderRow({
          ...record,
          user_name: joinedUser?.name,
          user_email: joinedUser?.email,
        });
      });
    }

    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => mapOrderRow(row as Record<string, unknown>));
  }

  if (user.role === 'admin') {
    const rows = db
      .prepare(
        `SELECT o.*, u.name as user_name, u.email as user_email
         FROM orders o
         JOIN users u ON o.user_id = u.id
         ORDER BY o.created_at DESC`
      )
      .all() as Record<string, unknown>[];
    return rows.map(mapOrderRow);
  }

  const rows = db
    .prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC')
    .all(user.id) as Record<string, unknown>[];
  return rows.map(mapOrderRow);
}

export async function createOrderRecord(input: {
  userId: number | string | null;
  userEmail?: string | null;
  product: Product;
  quantity: number;
  targetAccountId: string;
  targetServer: string;
  jokiCurrentRank: string;
  jokiTargetRank: string;
  jokiNotes: string;
  paymentMethod: PaymentMethod;
}): Promise<Order> {
  const totalPrice = input.product.price * input.quantity;
  const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const randPart = crypto.randomInt(1000, 9999);
  const orderCode = `KP-${datePart}-${randPart}`;
  const now = new Date().toISOString();

  if (supabase) {
    await ensureSupabaseSeeded();

    let resolvedUserId: number | null = null;
    if (input.userId !== null && input.userId !== undefined) {
      const rawId = String(input.userId).trim();
      if (/^\d+$/.test(rawId)) {
        resolvedUserId = Number(rawId);
      } else if (input.userEmail) {
        const matched = await findUserByEmail(input.userEmail);
        if (matched && /^\d+$/.test(String(matched.id))) {
          resolvedUserId = Number(matched.id);
        }
      }
    }

    const basePayload: Record<string, unknown> = {
      order_code: orderCode,
      product_id: input.product.id,
      product_name: input.product.name,
      game: input.product.game,
      category: input.product.category,
      quantity: input.quantity,
      total_price: totalPrice,
      target_account_id: input.targetAccountId,
      target_server: input.targetServer,
      joki_current_rank: input.jokiCurrentRank,
      joki_target_rank: input.jokiTargetRank,
      joki_notes: input.jokiNotes,
      payment_method: input.paymentMethod,
      status: 'pending',
      created_at: now,
    };

    const payloadWithUser =
      resolvedUserId !== null ? { ...basePayload, user_id: resolvedUserId } : basePayload;

    let { data, error } = await supabase
      .from('orders')
      .insert(payloadWithUser)
      .select('*')
      .single();

    // Jika gagal karena constraint/tipe user_id (UUID/FK/integer), coba ulang tanpa mengirim user_id
    if (
      error &&
      resolvedUserId !== null &&
      (error.code === '22P02' ||
        error.code === '23503' ||
        error.message.toLowerCase().includes('user_id'))
    ) {
      console.warn('Retry Supabase orders.insert without user_id:', error.message);
      const retryRes = await supabase
        .from('orders')
        .insert(basePayload)
        .select('*')
        .single();
      data = retryRes.data;
      error = retryRes.error;
    }

    if (error || !data) {
      console.error('Supabase createOrderRecord error:', error);
      const detail = error
        ? [error.message, error.details, error.hint].filter(Boolean).join(' — ')
        : 'Data pesanan kosong dari Supabase.';
      throw new Error(detail);
    }

    return mapOrderRow(data as Record<string, unknown>);
  }

  let sqliteUserId: number | null =
    input.userId !== null && /^\d+$/.test(String(input.userId)) ? Number(input.userId) : null;
  if (sqliteUserId === null) {
    const fallbackUser = db.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').get() as
      | { id: number }
      | undefined;
    sqliteUserId = fallbackUser?.id ?? 1;
  }

  const result = db
    .prepare(
      `INSERT INTO orders (
        order_code, user_id, product_id, product_name, game, category,
        quantity, total_price, target_account_id, target_server,
        joki_current_rank, joki_target_rank, joki_notes,
        payment_method, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
    )
    .run(
      orderCode,
      sqliteUserId,
      input.product.id,
      input.product.name,
      input.product.game,
      input.product.category,
      input.quantity,
      totalPrice,
      input.targetAccountId,
      input.targetServer,
      input.jokiCurrentRank,
      input.jokiTargetRank,
      input.jokiNotes,
      input.paymentMethod,
      now
    );

  const created = db
    .prepare('SELECT * FROM orders WHERE id = ?')
    .get(Number(result.lastInsertRowid)) as Record<string, unknown>;
  return mapOrderRow(created);
}

export async function updateOrderStatusRecord(
  orderId: number,
  status: OrderStatus
): Promise<Order | null> {
  if (supabase) {
    await ensureSupabaseSeeded();
    const { data, error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', orderId)
      .select('*, users(name, email)')
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    const record = data as Record<string, unknown>;
    const joinedUser = record.users as { name?: string; email?: string } | null;
    return mapOrderRow({
      ...record,
      user_name: joinedUser?.name,
      user_email: joinedUser?.email,
    });
  }

  const result = db
    .prepare('UPDATE orders SET status = ? WHERE id = ?')
    .run(status, orderId);
  if (result.changes === 0) return null;

  const updated = db
    .prepare(
      `SELECT o.*, u.name as user_name, u.email as user_email
       FROM orders o
       JOIN users u ON o.user_id = u.id
       WHERE o.id = ?`
    )
    .get(orderId) as Record<string, unknown>;
  return mapOrderRow(updated);
}

export async function getAdminDashboardStats(): Promise<AdminStats> {
  if (supabase) {
    await ensureSupabaseSeeded();
    const [ordersRes, activeProductsRes, usersRes] = await Promise.all([
      supabase.from('orders').select('total_price, status'),
      supabase.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('users').select('id', { count: 'exact', head: true }),
    ]);

    const allOrders = ordersRes.data ?? [];
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

  const revenueRow = db
    .prepare("SELECT COALESCE(SUM(total_price), 0) as total FROM orders WHERE status != 'cancelled'")
    .get() as { total: number };
  const ordersRow = db.prepare('SELECT COUNT(*) as total FROM orders').get() as { total: number };
  const pendingRow = db
    .prepare("SELECT COUNT(*) as total FROM orders WHERE status IN ('pending', 'processing')")
    .get() as { total: number };
  const productsRow = db
    .prepare('SELECT COUNT(*) as total FROM products WHERE is_active = 1')
    .get() as { total: number };
  const usersRow = db.prepare('SELECT COUNT(*) as total FROM users').get() as { total: number };

  return {
    totalRevenue: Number(revenueRow.total),
    totalOrders: Number(ordersRow.total),
    pendingOrders: Number(pendingRow.total),
    activeProducts: Number(productsRow.total),
    totalUsers: Number(usersRow.total),
  };
}
