import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_PUBLIC_SUPABASE_URL = 'https://umqydufawjccmuqqqupu.supabase.co';
const DEFAULT_PUBLIC_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVtcXlkdWZhd2pjY211cXFxdXB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ5ODI4NzcsImV4cCI6MjExMDU1ODg3N30.Vg22mCkJ93u8QIf0dXt_w_95A_Ugnvt-Gw5QN8yDDIEhw_1DuVRX_c';

let cachedClient: SupabaseClient | null = null;
let clientPromise: Promise<SupabaseClient | null> | null = null;

function normalizeSupabaseOrigin(value: string): string {
  const cleaned = value.trim().replace(/^['"]+|['"]+$/g, '').trim();
  if (!cleaned) return '';
  try {
    const url = new URL(cleaned);
    if (url.protocol === 'https:' || url.protocol === 'http:') {
      return url.origin;
    }
  } catch {
    return '';
  }
  return '';
}

export async function getSupabaseClient(): Promise<SupabaseClient | null> {
  if (cachedClient) return cachedClient;
  if (clientPromise) return clientPromise;

  clientPromise = (async () => {
    let url = normalizeSupabaseOrigin(String(import.meta.env.VITE_SUPABASE_URL ?? ''));
    let anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

    if (!url || anonKey.length < 20) {
      try {
        const res = await fetch('/api/config/public');
        if (res.ok) {
          const data = (await res.json()) as {
            supabaseUrl?: string;
            supabaseAnonKey?: string;
          };
          const runtimeUrl = normalizeSupabaseOrigin(String(data.supabaseUrl ?? ''));
          if (runtimeUrl) {
            url = runtimeUrl;
          }
          if (typeof data.supabaseAnonKey === 'string' && data.supabaseAnonKey.trim().length >= 20) {
            anonKey = data.supabaseAnonKey.trim();
          }
        }
      } catch {
        // Fallback ke konfigurasi publik default
      }
    }

    if (!url) url = DEFAULT_PUBLIC_SUPABASE_URL;
    if (anonKey.length < 20) anonKey = DEFAULT_PUBLIC_SUPABASE_KEY;

    cachedClient = createClient(url, anonKey);
    return cachedClient;
  })();

  return clientPromise;
}
