import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import {
  createOrderRecord,
  createProductRecord,
  createUser,
  deleteProductRecord,
  findProductById,
  findUserById,
  getAdminDashboardStats,
  getPublicSupabaseConfig,
  listOrdersForUser,
  listProducts,
  resolveUserFromSupabaseAccessToken,
  syncRegisteredSupabaseUser,
  updateOrderStatusRecord,
  updateProductRecord,
  verifyUserCredentials,
} from './server/store.ts';
import type {
  GameName,
  OrderStatus,
  PaymentMethod,
  ProductCategory,
  User,
} from './src/types.ts';

const PORT = Number(process.env.PORT) || 3000;
const TOKEN_SECRET =
  process.env.AUTH_SECRET ||
  crypto.createHash('sha256').update(`karsaplay-${process.cwd()}`).digest('hex');

interface TokenPayload {
  userId: number | string;
  role: 'admin' | 'user';
  exp: number;
}

interface AuthenticatedRequest extends Request {
  authUser?: User;
}

function signToken(payload: TokenPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${signature}`;
}

function verifyToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  const expected = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as TokenPayload;
    if (!parsed.userId || !parsed.exp || Date.now() > parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function extractUserFromHeader(req: Request): Promise<User | null> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  const payload = verifyToken(token);
  if (!payload) return null;
  return findUserById(payload.userId);
}

async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = await extractUserFromHeader(req);
    if (!user) {
      res.status(401).json({ error: 'Sesi login tidak valid atau telah berakhir. Silakan masuk kembali.' });
      return;
    }
    req.authUser = user;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Gagal memverifikasi sesi login.' });
  }
}

async function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = await extractUserFromHeader(req);
    if (!user) {
      res.status(401).json({ error: 'Silakan masuk terlebih dahulu.' });
      return;
    }
    if (user.role !== 'admin') {
      res.status(403).json({ error: 'Akses ditolak. Menu ini hanya tersedia untuk akun Admin.' });
      return;
    }
    req.authUser = user;
    next();
  } catch (error) {
    console.error('Admin auth error:', error);
    res.status(500).json({ error: 'Gagal memverifikasi hak akses admin.' });
  }
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const VALID_GAMES = new Set(['Mobile Legends', 'Free Fire', 'PUBG Mobile', 'Genshin Impact']);
const VALID_CATEGORIES = new Set(['topup', 'joki']);
const VALID_PAYMENTS = new Set(['QRIS', 'DANA', 'OVO', 'GoPay', 'ShopeePay']);
const VALID_STATUSES = new Set(['pending', 'processing', 'completed', 'cancelled']);

const RANK_IMAGES: Record<string, string> = {
  Grandmaster: '/assets/aistudio/images_ff88a793.jpg',
  Epic: '/assets/aistudio/images__5__aea82872.jpg',
  Legend: '/assets/aistudio/images__1__b7bf45cd.jpg',
  Mythic: '/assets/aistudio/images__2__16fbf8b8.jpg',
  'Mythical Honor': '/assets/aistudio/images__3__17cf2851.jpg',
  'Mythical Glory': '/assets/aistudio/download_5f99fe78.jpg',
  'Mythical Immortal': '/assets/aistudio/images__4__2ca0bd55.jpg',
  Immortal: '/assets/aistudio/images__4__2ca0bd55.jpg',
};

const DEFAULT_GAME_IMAGES: Record<string, string> = {
  'Mobile Legends': '/assets/aistudio/image_5089c427.png',
  'Free Fire': '/assets/aistudio/image_b7849284.png',
  'PUBG Mobile': '/assets/aistudio/image_3d670460.png',
  'Genshin Impact': '/assets/aistudio/image_2e8fa4c3.png',
};

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Public Client Configuration (hanya URL & anon key publik, tidak pernah mengekspos service_role)
  app.get('/api/config/public', (_req: Request, res: Response) => {
    res.json(getPublicSupabaseConfig());
  });

  // Auth Routes
  app.post('/api/auth/supabase-session', async (req: Request, res: Response) => {
    try {
      const accessToken = String(req.body?.accessToken ?? '').trim();
      if (!accessToken) {
        res.status(400).json({ error: 'Token sesi Supabase wajib disertakan.' });
        return;
      }

      const user = await resolveUserFromSupabaseAccessToken(accessToken);
      const token = signToken({
        userId: user.id,
        role: user.role,
        exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
      });

      res.json({ token, user });
    } catch (error) {
      console.error('Supabase session exchange error:', error);
      res.status(401).json({
        error:
          error instanceof Error
            ? error.message
            : 'Gagal memverifikasi sesi Supabase Authentication.',
      });
    }
  });

  app.post('/api/auth/register-sync', async (req: Request, res: Response) => {
    try {
      const userId = String(req.body?.authId ?? req.body?.userId ?? '').trim();
      const email = String(req.body?.email ?? '').trim().toLowerCase();
      const name = String(req.body?.name ?? '').trim();
      const whatsapp = String(req.body?.whatsapp ?? '').trim();
      const accessToken = String(req.body?.accessToken ?? '').trim();

      if (!email || (!userId && !accessToken)) {
        res.status(400).json({ error: 'Data akun pendaftaran tidak lengkap.' });
        return;
      }

      const user = await syncRegisteredSupabaseUser({
        userId,
        email,
        name,
        whatsapp,
        accessToken: accessToken || undefined,
      });

      const token = signToken({
        userId: user.id,
        role: user.role,
        exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
      });

      res.json({ token, user });
    } catch (error) {
      console.error('Register sync error:', error);
      res.status(400).json({
        error:
          error instanceof Error ? error.message : 'Gagal menyinkronkan profil pengguna.',
      });
    }
  });

  app.post('/api/auth/register', async (req: Request, res: Response) => {
    try {
      const name = String(req.body?.name ?? '').trim();
      const email = String(req.body?.email ?? '').trim().toLowerCase();
      const password = String(req.body?.password ?? '');
      const whatsapp = String(req.body?.whatsapp ?? '').trim();

      if (name.length < 2 || name.length > 80) {
        res.status(400).json({ error: 'Nama lengkap harus terdiri dari 2 hingga 80 karakter.' });
        return;
      }
      if (!isValidEmail(email)) {
        res.status(400).json({ error: 'Format alamat email tidak valid.' });
        return;
      }
      if (password.length < 6) {
        res.status(400).json({ error: 'Kata sandi minimal 6 karakter.' });
        return;
      }

      const result = await createUser({ name, email, password, whatsapp });
      if (result.requiresEmailConfirmation || !result.user) {
        res.status(201).json({
          token: null,
          user: null,
          requiresEmailConfirmation: true,
        });
        return;
      }

      const token = signToken({
        userId: result.user.id,
        role: result.user.role,
        exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
      });

      res.status(201).json({ token, user: result.user, requiresEmailConfirmation: false });
    } catch (error) {
      if (error instanceof Error && error.message === 'EMAIL_EXISTS') {
        res.status(409).json({ error: 'Email sudah terdaftar. Silakan gunakan halaman masuk.' });
        return;
      }
      console.error('Register error:', error);
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'Terjadi kesalahan pada server saat mendaftarkan akun.',
      });
    }
  });

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const email = String(req.body?.email ?? '').trim().toLowerCase();
      const password = String(req.body?.password ?? '');

      if (!email || !password) {
        res.status(400).json({ error: 'Email dan kata sandi wajib diisi.' });
        return;
      }

      const user = await verifyUserCredentials(email, password);
      if (!user) {
        res.status(401).json({ error: 'Email atau kata sandi salah.' });
        return;
      }

      const token = signToken({
        userId: user.id,
        role: user.role,
        exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
      });

      res.json({ token, user });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Gagal memproses permintaan login.',
      });
    }
  });

  app.post('/api/auth/logout', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    res.json({ user: req.authUser });
  });

  // Product Routes
  app.get('/api/products', async (req: Request, res: Response) => {
    try {
      const includeInactive = req.query.includeInactive === 'true';
      const user = await extractUserFromHeader(req);
      const showAll = includeInactive && user?.role === 'admin';
      const products = await listProducts(showAll);
      res.json({ products });
    } catch (error) {
      console.error('Get products error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Gagal memuat daftar produk.',
      });
    }
  });

  app.post('/api/products', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const name = String(req.body?.name ?? '').trim();
      const game = String(req.body?.game ?? '').trim() as GameName;
      const category = String(req.body?.category ?? '').trim() as ProductCategory;
      const rankTier = String(req.body?.rankTier ?? '').trim();
      const price = Number(req.body?.price);
      const unitLabel = String(req.body?.unitLabel ?? '').trim();
      const description = String(req.body?.description ?? '').trim();
      const isPopular = Boolean(req.body?.isPopular);
      const isActive = req.body?.isActive !== false;

      if (name.length < 3 || name.length > 120) {
        res.status(400).json({ error: 'Nama produk harus antara 3 hingga 120 karakter.' });
        return;
      }
      if (!VALID_GAMES.has(game)) {
        res.status(400).json({ error: 'Pilihan game tidak valid.' });
        return;
      }
      if (!VALID_CATEGORIES.has(category)) {
        res.status(400).json({ error: 'Kategori produk tidak valid.' });
        return;
      }
      if (!Number.isInteger(price) || price < 1000) {
        res.status(400).json({ error: 'Harga harus berupa angka bulat minimal Rp 1.000.' });
        return;
      }
      if (!unitLabel || !description) {
        res.status(400).json({ error: 'Satuan dan deskripsi produk wajib diisi.' });
        return;
      }

      const imageUrl =
        String(req.body?.imageUrl ?? '').trim() ||
        (category === 'joki' && rankTier ? RANK_IMAGES[rankTier] : '') ||
        DEFAULT_GAME_IMAGES[game];

      const product = await createProductRecord({
        name,
        game,
        category,
        rankTier,
        price,
        unitLabel,
        description,
        imageUrl,
        isPopular,
        isActive,
      });

      res.status(201).json({ product });
    } catch (error) {
      console.error('Create product error:', error);
      res.status(500).json({ error: 'Gagal menambahkan produk baru.' });
    }
  });

  app.put('/api/products/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const productId = Number(req.params.id);
      if (!Number.isInteger(productId) || productId <= 0) {
        res.status(400).json({ error: 'ID produk tidak valid.' });
        return;
      }

      const existing = await findProductById(productId);
      if (!existing) {
        res.status(404).json({ error: 'Produk tidak ditemukan.' });
        return;
      }

      const name = String(req.body?.name ?? existing.name).trim();
      const game = String(req.body?.game ?? existing.game).trim() as GameName;
      const category = String(req.body?.category ?? existing.category).trim() as ProductCategory;
      const rankTier = String(req.body?.rankTier ?? existing.rankTier).trim();
      const price = Number(req.body?.price ?? existing.price);
      const unitLabel = String(req.body?.unitLabel ?? existing.unitLabel).trim();
      const description = String(req.body?.description ?? existing.description).trim();
      const isPopular =
        req.body?.isPopular !== undefined ? Boolean(req.body.isPopular) : existing.isPopular;
      const isActive =
        req.body?.isActive !== undefined ? Boolean(req.body.isActive) : existing.isActive;

      if (name.length < 3 || !VALID_GAMES.has(game) || !VALID_CATEGORIES.has(category)) {
        res.status(400).json({ error: 'Data produk tidak lengkap atau tidak valid.' });
        return;
      }
      if (!Number.isInteger(price) || price < 1000) {
        res.status(400).json({ error: 'Harga minimal Rp 1.000.' });
        return;
      }

      const imageUrl =
        String(req.body?.imageUrl ?? '').trim() ||
        (category === 'joki' && rankTier ? RANK_IMAGES[rankTier] : '') ||
        DEFAULT_GAME_IMAGES[game] ||
        existing.imageUrl;

      const updated = await updateProductRecord(productId, {
        name,
        game,
        category,
        rankTier,
        price,
        unitLabel,
        description,
        imageUrl,
        isPopular,
        isActive,
      });

      if (!updated) {
        res.status(404).json({ error: 'Produk tidak ditemukan.' });
        return;
      }

      res.json({ product: updated });
    } catch (error) {
      console.error('Update product error:', error);
      res.status(500).json({ error: 'Gagal memperbarui data produk.' });
    }
  });

  app.delete('/api/products/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const productId = Number(req.params.id);
      if (!Number.isInteger(productId) || productId <= 0) {
        res.status(400).json({ error: 'ID produk tidak valid.' });
        return;
      }

      const deleted = await deleteProductRecord(productId);
      if (!deleted) {
        res.status(404).json({ error: 'Produk tidak ditemukan.' });
        return;
      }

      res.json({ ok: true });
    } catch (error) {
      console.error('Delete product error:', error);
      res.status(500).json({ error: 'Gagal menghapus produk.' });
    }
  });

  // Order Routes
  app.get('/api/orders', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const orders = await listOrdersForUser(req.authUser!);
      res.json({ orders });
    } catch (error) {
      console.error('Get orders error:', error);
      res.status(500).json({ error: 'Gagal memuat riwayat pesanan.' });
    }
  });

  app.post('/api/orders', async (req: Request, res: Response) => {
    try {
      const user = await extractUserFromHeader(req);
      const productId = Number(req.body?.productId);
      const quantity = Number(req.body?.quantity ?? 1);
      const targetAccountId = String(req.body?.targetAccountId ?? '').trim();
      const targetServer = String(req.body?.targetServer ?? '').trim();
      const jokiCurrentRank = String(req.body?.jokiCurrentRank ?? '').trim();
      const jokiTargetRank = String(req.body?.jokiTargetRank ?? '').trim();
      const jokiNotes = String(req.body?.jokiNotes ?? '').trim();
      const paymentMethod = String(req.body?.paymentMethod ?? '').trim() as PaymentMethod;

      if (!Number.isInteger(productId) || productId <= 0) {
        res.status(400).json({ error: 'Produk yang dipilih tidak valid.' });
        return;
      }
      if (!Number.isInteger(quantity) || quantity < 1) {
        res.status(400).json({ error: 'Jumlah pesanan minimal 1.' });
        return;
      }
      if (targetAccountId.length < 3 || targetAccountId.length > 100) {
        res.status(400).json({ error: 'ID Akun / Email Login Game wajib diisi dengan benar.' });
        return;
      }
      if (!VALID_PAYMENTS.has(paymentMethod)) {
        res.status(400).json({ error: 'Metode pembayaran tidak valid.' });
        return;
      }

      const product = await findProductById(productId);
      if (!product || !product.isActive) {
        res.status(404).json({ error: 'Produk tidak tersedia atau sedang dinonaktifkan.' });
        return;
      }

      const maxQty = product.category === 'joki' ? 500 : 50;
      if (quantity > maxQty) {
        res.status(400).json({
          error:
            product.category === 'joki'
              ? `Jumlah bintang joki maksimal ${maxQty} per transaksi.`
              : `Jumlah paket top-up maksimal ${maxQty} per transaksi.`,
        });
        return;
      }

      const totalPrice = product.price * quantity;
      if (!Number.isSafeInteger(totalPrice) || totalPrice > 50_000_000) {
        res.status(400).json({
          error: 'Total nominal transaksi melebihi batas maksimal Rp 50.000.000 per pesanan.',
        });
        return;
      }

      if (product.game === 'Mobile Legends' && product.category === 'topup' && !targetServer) {
        res.status(400).json({ error: 'Zone ID Mobile Legends wajib diisi.' });
        return;
      }
      if (product.game === 'Genshin Impact' && !targetServer) {
        res.status(400).json({ error: 'Pilih server Genshin Impact terlebih dahulu.' });
        return;
      }
      if (product.category === 'joki' && (!jokiCurrentRank || !jokiTargetRank)) {
        res.status(400).json({ error: 'Rank saat ini dan target rank joki wajib diisi.' });
        return;
      }

      const order = await createOrderRecord({
        userId: user ? user.id : null,
        userEmail: user?.email ?? null,
        product,
        quantity,
        targetAccountId,
        targetServer,
        jokiCurrentRank,
        jokiTargetRank,
        jokiNotes,
        paymentMethod,
      });

      res.status(201).json({ order });
    } catch (error) {
      console.error('Create order error:', error);
      const detail =
        error instanceof Error && error.message
          ? error.message
          : 'Terjadi kesalahan saat menyimpan pesanan.';
      res.status(500).json({ error: detail });
    }
  });

  app.patch(
    '/api/orders/:id/status',
    requireAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const orderId = Number(req.params.id);
        const status = String(req.body?.status ?? '').trim() as OrderStatus;

        if (!Number.isInteger(orderId) || orderId <= 0) {
          res.status(400).json({ error: 'ID pesanan tidak valid.' });
          return;
        }
        if (!VALID_STATUSES.has(status)) {
          res.status(400).json({ error: 'Status pesanan tidak valid.' });
          return;
        }

        const updated = await updateOrderStatusRecord(orderId, status);
        if (!updated) {
          res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
          return;
        }

        res.json({ order: updated });
      } catch (error) {
        console.error('Update order status error:', error);
        res.status(500).json({ error: 'Gagal memperbarui status pesanan.' });
      }
    }
  );

  app.get('/api/admin/stats', requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const stats = await getAdminDashboardStats();
      res.json({ stats });
    } catch (error) {
      console.error('Admin stats error:', error);
      res.status(500).json({ error: 'Gagal memuat statistik admin.' });
    }
  });

  // Vite / Static Serving
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DINTOPUP server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
