import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Order, Product, User } from '../src/types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'karsaplay.db');
export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'user')) DEFAULT 'user',
    whatsapp TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    game TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('topup', 'joki')),
    rank_tier TEXT NOT NULL DEFAULT '',
    price INTEGER NOT NULL CHECK(price > 0),
    unit_label TEXT NOT NULL,
    description TEXT NOT NULL,
    image_url TEXT NOT NULL,
    is_popular INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_code TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    game TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('topup', 'joki')),
    quantity INTEGER NOT NULL DEFAULT 1,
    total_price INTEGER NOT NULL,
    target_account_id TEXT NOT NULL,
    target_server TEXT NOT NULL DEFAULT '',
    joki_current_rank TEXT NOT NULL DEFAULT '',
    joki_target_rank TEXT NOT NULL DEFAULT '',
    joki_notes TEXT NOT NULL DEFAULT '',
    payment_method TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending', 'processing', 'completed', 'cancelled')) DEFAULT 'pending',
    created_at TEXT NOT NULL
  );
`);

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, key] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(key, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

function parseEntityId(value: unknown): number | string {
  if (typeof value === 'number') return value;
  const str = String(value ?? '').trim();
  return /^\d+$/.test(str) ? Number(str) : str;
}

export function mapUserRow(row: Record<string, unknown>): User {
  return {
    id: parseEntityId(row.id),
    name: String(row.name ?? row.full_name ?? ''),
    email: String(row.email ?? ''),
    role: (row.role as User['role']) || 'user',
    whatsapp: String(row.whatsapp ?? row.phone ?? ''),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

export function mapProductRow(row: Record<string, unknown>): Product {
  return {
    id: Number(row.id),
    name: String(row.name),
    game: row.game as Product['game'],
    category: row.category as Product['category'],
    rankTier: String(row.rank_tier ?? ''),
    price: Number(row.price),
    unitLabel: String(row.unit_label),
    description: String(row.description),
    imageUrl: String(row.image_url),
    isPopular: Boolean(row.is_popular),
    isActive: Boolean(row.is_active),
    createdAt: String(row.created_at),
  };
}

export function mapOrderRow(row: Record<string, unknown>): Order {
  return {
    id: Number(row.id),
    orderCode: String(row.order_code),
    userId: parseEntityId(row.user_id),
    userName: row.user_name ? String(row.user_name) : undefined,
    userEmail: row.user_email ? String(row.user_email) : undefined,
    productId: Number(row.product_id),
    productName: String(row.product_name),
    game: row.game as Order['game'],
    category: row.category as Order['category'],
    quantity: Number(row.quantity),
    totalPrice: Number(row.total_price),
    targetAccountId: String(row.target_account_id),
    targetServer: String(row.target_server ?? ''),
    jokiCurrentRank: String(row.joki_current_rank ?? ''),
    jokiTargetRank: String(row.joki_target_rank ?? ''),
    jokiNotes: String(row.joki_notes ?? ''),
    paymentMethod: row.payment_method as Order['paymentMethod'],
    status: row.status as Order['status'],
    createdAt: String(row.created_at),
  };
}

const IMAGE_ML = '/assets/aistudio/image_5089c427.png';
const IMAGE_FF = '/assets/aistudio/image_b7849284.png';
const IMAGE_PUBG = '/assets/aistudio/image_3d670460.png';
const IMAGE_GENSHIN = '/assets/aistudio/image_2e8fa4c3.png';

const RANK_IMAGES: Record<string, string> = {
  Grandmaster: '/assets/aistudio/images_ff88a793.jpg',
  Epic: '/assets/aistudio/images__5__aea82872.jpg',
  Legend: '/assets/aistudio/images__1__b7bf45cd.jpg',
  Mythic: '/assets/aistudio/images__2__16fbf8b8.jpg',
  'Mythical Honor': '/assets/aistudio/images__3__17cf2851.jpg',
  'Mythical Glory': '/assets/aistudio/download_5f99fe78.jpg',
  'Mythical Immortal': '/assets/aistudio/images__4__2ca0bd55.jpg',
};

function seedInitialData(): void {
  const userCountRow = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (userCountRow.count === 0) {
    const now = new Date().toISOString();
    const insertUser = db.prepare(`
      INSERT INTO users (name, email, password_hash, role, whatsapp, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertUser.run('Admin DINTOPUP', 'admin@dintopup.id', hashPassword('Admin123!'), 'admin', '0895336487682', now);
    insertUser.run('Budi Santoso', 'budi@dintopup.id', hashPassword('User123!'), 'user', '081234567890', now);
  }

  const productCountRow = db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number };
  if (productCountRow.count === 0) {
    const now = new Date().toISOString();
    const insertProduct = db.prepare(`
      INSERT INTO products (name, game, category, rank_tier, price, unit_label, description, image_url, is_popular, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `);

    const initialProducts = [
      // Mobile Legends Top-Up (4)
      {
        name: '86 Diamonds (78 + 8 Bonus)',
        game: 'Mobile Legends',
        category: 'topup',
        rankTier: '',
        price: 22000,
        unitLabel: '86 Diamonds',
        description: 'Top-up resmi Mobile Legends via User ID dan Zone ID. Proses otomatis 1-3 menit langsung masuk ke akun.',
        imageUrl: IMAGE_ML,
        isPopular: 0,
      },
      {
        name: '172 Diamonds (156 + 16 Bonus)',
        game: 'Mobile Legends',
        category: 'topup',
        rankTier: '',
        price: 44000,
        unitLabel: '172 Diamonds',
        description: 'Paket populer untuk pembelian skin Starlight atau event kolaborasi Mobile Legends. Pengiriman instan 24 jam.',
        imageUrl: IMAGE_ML,
        isPopular: 1,
      },
      {
        name: '344 Diamonds (312 + 32 Bonus)',
        game: 'Mobile Legends',
        category: 'topup',
        rankTier: '',
        price: 88000,
        unitLabel: '344 Diamonds',
        description: 'Diamond legal 100% aman dari distributor resmi Moonton tanpa risiko minus atau banned.',
        imageUrl: IMAGE_ML,
        isPopular: 0,
      },
      {
        name: 'Weekly Diamond Pass',
        game: 'Mobile Legends',
        category: 'topup',
        rankTier: '',
        price: 27500,
        unitLabel: '220 Diamonds · 7 Hari',
        description: 'Dapatkan 80 Diamonds langsung saat aktivasi dan 20 Diamonds setiap hari selama 7 hari beserta Starlight Score.',
        imageUrl: IMAGE_ML,
        isPopular: 1,
      },
      // Free Fire Top-Up (3)
      {
        name: '140 Diamonds Free Fire',
        game: 'Free Fire',
        category: 'topup',
        rankTier: '',
        price: 18018,
        unitLabel: '140 Diamonds',
        description: 'Pengisian cepat Diamonds Free Fire & Free Fire MAX hanya menggunakan Player ID tanpa perlu login akun.',
        imageUrl: IMAGE_FF,
        isPopular: 0,
      },
      {
        name: '355 Diamonds Free Fire',
        game: 'Free Fire',
        category: 'topup',
        rankTier: '',
        price: 45045,
        unitLabel: '355 Diamonds',
        description: 'Paket hemat untuk gacha weapon skin Evo Gun, Mystery Shop, dan bundle Booyah Pass terbaru.',
        imageUrl: IMAGE_FF,
        isPopular: 1,
      },
      {
        name: '720 Diamonds Free Fire',
        game: 'Free Fire',
        category: 'topup',
        rankTier: '',
        price: 90090,
        unitLabel: '720 Diamonds',
        description: 'Stok besar Diamonds Free Fire resmi Garena. Transaksi terenkripsi dan langsung terkirim dalam hitungan detik.',
        imageUrl: IMAGE_FF,
        isPopular: 0,
      },
      // PUBG Mobile Top-Up (3)
      {
        name: '325 UC (300 + 25 Bonus)',
        game: 'PUBG Mobile',
        category: 'topup',
        rankTier: '',
        price: 89000,
        unitLabel: '325 UC',
        description: 'Top-up Unknown Cash PUBG Mobile Region Indonesia via ID Karakter. Cocok untuk upgrade Royale Pass dasar.',
        imageUrl: IMAGE_PUBG,
        isPopular: 0,
      },
      {
        name: '660 UC (600 + 60 Bonus)',
        game: 'PUBG Mobile',
        category: 'topup',
        rankTier: '',
        price: 155000,
        unitLabel: '660 UC',
        description: 'Paket paling diminati untuk membuka Elite Royale Pass penuh dan misi musiman PUBG Mobile.',
        imageUrl: IMAGE_PUBG,
        isPopular: 1,
      },
      {
        name: '1800 UC (1500 + 300 Bonus)',
        game: 'PUBG Mobile',
        category: 'topup',
        rankTier: '',
        price: 447000,
        unitLabel: '1800 UC',
        description: 'Paket UC besar dengan bonus ekstra 300 UC untuk gacha X-Suit, set mythic, dan skin senjata upgradeable.',
        imageUrl: IMAGE_PUBG,
        isPopular: 0,
      },
      // Genshin Impact Top-Up (3)
      {
        name: 'Blessing of the Welkin Moon',
        game: 'Genshin Impact',
        category: 'topup',
        rankTier: '',
        price: 62000,
        unitLabel: '300 Crystals + 2700 Primogems',
        description: 'Langganan 30 hari resmi HoYoverse. Langsung mendapat 300 Genesis Crystals plus 90 Primogems setiap login harian.',
        imageUrl: IMAGE_GENSHIN,
        isPopular: 1,
      },
      {
        name: '980 + 110 Genesis Crystals',
        game: 'Genshin Impact',
        category: 'topup',
        rankTier: '',
        price: 249000,
        unitLabel: '1090 Genesis Crystals',
        description: 'Top-up resmi via UID dan Server (Asia/America/Europe/TW-HK-MO). Bonus top-up pertama kali tetap berlaku.',
        imageUrl: IMAGE_GENSHIN,
        isPopular: 0,
      },
      {
        name: '1980 + 260 Genesis Crystals',
        game: 'Genshin Impact',
        category: 'topup',
        rankTier: '',
        price: 479000,
        unitLabel: '2240 Genesis Crystals',
        description: 'Paket kristal untuk wish banner karakter Limited B5 atau pembelian outfit karakter di Paimon Bargains.',
        imageUrl: IMAGE_GENSHIN,
        isPopular: 0,
      },
      // Jasa Joki Mobile Legends: Grandmaster sampai Mythical Immortal (7)
      {
        name: 'Joki Rank Grandmaster',
        game: 'Mobile Legends',
        category: 'joki',
        rankTier: 'Grandmaster',
        price: 4500,
        unitLabel: 'Per Bintang',
        description: 'Layanan joki cepat dan aman untuk rank Grandmaster. Dikerjakan manual oleh player berpengalaman tanpa cheat.',
        imageUrl: RANK_IMAGES.Grandmaster,
        isPopular: 0,
      },
      {
        name: 'Joki Rank Epic',
        game: 'Mobile Legends',
        category: 'joki',
        rankTier: 'Epic',
        price: 6500,
        unitLabel: 'Per Bintang',
        description: 'Push rank tier Epic dengan winrate terjaga. Bisa request hero favorit dan bonus MVP jika memungkinkan.',
        imageUrl: RANK_IMAGES.Epic,
        isPopular: 1,
      },
      {
        name: 'Joki Rank Legend',
        game: 'Mobile Legends',
        category: 'joki',
        rankTier: 'Legend',
        price: 8500,
        unitLabel: 'Per Bintang',
        description: 'Push rank terstruktur di tier Legend. Privasi akun terjamin dengan laporan progres berkala.',
        imageUrl: RANK_IMAGES.Legend,
        isPopular: 1,
      },
      {
        name: 'Joki Rank Mythic',
        game: 'Mobile Legends',
        category: 'joki',
        rankTier: 'Mythic',
        price: 14000,
        unitLabel: 'Per Bintang',
        description: 'Joki khusus tier Mythic oleh tim squad kompetitif dengan rotasi objektif yang rapi dan aman.',
        imageUrl: RANK_IMAGES.Mythic,
        isPopular: 0,
      },
      {
        name: 'Joki Rank Mythical Honor',
        game: 'Mobile Legends',
        category: 'joki',
        rankTier: 'Mythical Honor',
        price: 18000,
        unitLabel: 'Per Bintang',
        description: 'Push bintang cepat di tier Mythical Honor (25-49 bintang) oleh pemain eks-Immortal berwinrate tinggi.',
        imageUrl: RANK_IMAGES['Mythical Honor'],
        isPopular: 0,
      },
      {
        name: 'Joki Rank Mythical Glory',
        game: 'Mobile Legends',
        category: 'joki',
        rankTier: 'Mythical Glory',
        price: 22000,
        unitLabel: 'Per Bintang',
        description: 'Layanan push bintang kompetitif di tier Mythical Glory (50-99 bintang) dengan jadwal fleksibel.',
        imageUrl: RANK_IMAGES['Mythical Glory'],
        isPopular: 1,
      },
      {
        name: 'Joki Rank Mythical Immortal',
        game: 'Mobile Legends',
        category: 'joki',
        rankTier: 'Mythical Immortal',
        price: 26000,
        unitLabel: 'Per Bintang',
        description: 'Joki tier tertinggi Mythical Immortal (100+ bintang) oleh pro-squad terpercaya dan bebas cheat.',
        imageUrl: RANK_IMAGES['Mythical Immortal'],
        isPopular: 1,
      },
    ];

    for (const item of initialProducts) {
      insertProduct.run(
        item.name,
        item.game,
        item.category,
        item.rankTier,
        item.price,
        item.unitLabel,
        item.description,
        item.imageUrl,
        item.isPopular,
        now
      );
    }
  }

  const orderCountRow = db.prepare('SELECT COUNT(*) as count FROM orders').get() as { count: number };
  if (orderCountRow.count === 0) {
    const budi = db.prepare('SELECT id FROM users WHERE email IN (?, ?)').get('budi@dintopup.id', 'budi@karsaplay.id') as { id: number } | undefined;
    const mlProduct = db.prepare("SELECT * FROM products WHERE name LIKE '172 Diamonds%' LIMIT 1").get() as Record<string, unknown> | undefined;
    const jokiProduct = db.prepare("SELECT * FROM products WHERE rank_tier = 'Epic' LIMIT 1").get() as Record<string, unknown> | undefined;
    const genshinProduct = db.prepare("SELECT * FROM products WHERE name LIKE 'Blessing%' LIMIT 1").get() as Record<string, unknown> | undefined;

    if (budi && mlProduct && jokiProduct && genshinProduct) {
      const insertOrder = db.prepare(`
        INSERT INTO orders (
          order_code, user_id, product_id, product_name, game, category,
          quantity, total_price, target_account_id, target_server,
          joki_current_rank, joki_target_rank, joki_notes,
          payment_method, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const t1 = new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString();
      const t2 = new Date(Date.now() - 1000 * 60 * 60 * 14).toISOString();
      const t3 = new Date(Date.now() - 1000 * 60 * 45).toISOString();

      insertOrder.run(
        'KP-261115-8412',
        budi.id,
        Number(mlProduct.id),
        String(mlProduct.name),
        String(mlProduct.game),
        String(mlProduct.category),
        1,
        Number(mlProduct.price),
        '482910442',
        '2194',
        '',
        '',
        '',
        'QRIS',
        'completed',
        t1
      );

      insertOrder.run(
        'KP-261117-3905',
        budi.id,
        Number(jokiProduct.id),
        String(jokiProduct.name),
        String(jokiProduct.game),
        String(jokiProduct.category),
        5,
        Number(jokiProduct.price) * 5,
        'budi.mlbb@gmail.com (Moonton)',
        'WA: 081234567890',
        'Epic II (2 Bintang)',
        'Legend V',
        'Request hero Granger / Beatrix, jangan ubah emblem',
        'DANA',
        'processing',
        t2
      );

      insertOrder.run(
        'KP-261117-9120',
        budi.id,
        Number(genshinProduct.id),
        String(genshinProduct.name),
        String(genshinProduct.game),
        String(genshinProduct.category),
        1,
        Number(genshinProduct.price),
        '829401772',
        'Asia',
        '',
        '',
        '',
        'QRIS',
        'pending',
        t3
      );
    }
  }
}

seedInitialData();

// Ensure existing products and demo users reflect DINTOPUP branding and uploaded catalog/rank artwork
db.prepare("UPDATE products SET image_url = ? WHERE game = 'Mobile Legends' AND category = 'topup'").run(IMAGE_ML);
db.prepare("UPDATE products SET image_url = ? WHERE game = 'Free Fire'").run(IMAGE_FF);
db.prepare("UPDATE products SET image_url = ? WHERE game = 'PUBG Mobile'").run(IMAGE_PUBG);
db.prepare("UPDATE products SET image_url = ? WHERE game = 'Genshin Impact'").run(IMAGE_GENSHIN);

// Sync existing Joki ML titles, rank tiers, and logos
db.prepare("UPDATE products SET name = 'Joki Rank Grandmaster', image_url = ? WHERE category = 'joki' AND rank_tier = 'Grandmaster'").run(RANK_IMAGES.Grandmaster);
db.prepare("UPDATE products SET name = 'Joki Rank Epic', image_url = ? WHERE category = 'joki' AND rank_tier = 'Epic'").run(RANK_IMAGES.Epic);
db.prepare("UPDATE products SET name = 'Joki Rank Legend', image_url = ? WHERE category = 'joki' AND rank_tier = 'Legend'").run(RANK_IMAGES.Legend);
db.prepare("UPDATE products SET name = 'Joki Rank Mythic', image_url = ? WHERE category = 'joki' AND rank_tier = 'Mythic'").run(RANK_IMAGES.Mythic);
db.prepare("UPDATE products SET name = 'Joki Rank Mythical Immortal', rank_tier = 'Mythical Immortal', image_url = ? WHERE category = 'joki' AND rank_tier IN ('Immortal', 'Mythical Immortal')").run(RANK_IMAGES['Mythical Immortal']);

const ensureJokiTier = (
  rankTier: string,
  name: string,
  price: number,
  description: string,
  isPopular: number
) => {
  const exists = db
    .prepare("SELECT id FROM products WHERE category = 'joki' AND rank_tier = ?")
    .get(rankTier);
  if (!exists) {
    db.prepare(
      `INSERT INTO products (name, game, category, rank_tier, price, unit_label, description, image_url, is_popular, is_active, created_at)
       VALUES (?, 'Mobile Legends', 'joki', ?, ?, 'Per Bintang', ?, ?, ?, 1, ?)`
    ).run(name, rankTier, price, description, RANK_IMAGES[rankTier] || IMAGE_ML, isPopular, new Date().toISOString());
  } else {
    db.prepare("UPDATE products SET image_url = ? WHERE category = 'joki' AND rank_tier = ?").run(
      RANK_IMAGES[rankTier] || IMAGE_ML,
      rankTier
    );
  }
};

ensureJokiTier(
  'Mythical Honor',
  'Joki Rank Mythical Honor',
  18000,
  'Push bintang cepat di tier Mythical Honor (25-49 bintang) oleh pemain eks-Immortal berwinrate tinggi.',
  0
);
ensureJokiTier(
  'Mythical Glory',
  'Joki Rank Mythical Glory',
  22000,
  'Layanan push bintang kompetitif di tier Mythical Glory (50-99 bintang) dengan jadwal fleksibel.',
  1
);

db.prepare("UPDATE users SET name = 'Admin DINTOPUP', email = 'admin@dintopup.id' WHERE email = 'admin@karsaplay.id'").run();
db.prepare("UPDATE users SET email = 'budi@dintopup.id' WHERE email = 'budi@karsaplay.id'").run();

// Sinkronkan harga resmi terkini untuk paket top-up default (hanya jika masih memakai harga lama)
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
const updateOfficialPriceStmt = db.prepare(
  'UPDATE products SET price = ? WHERE name = ? AND price = ?'
);
for (const [productName, oldPrice, newPrice] of officialPriceUpdates) {
  updateOfficialPriceStmt.run(newPrice, productName, oldPrice);
}
