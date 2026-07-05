
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import process from 'node:process';
import { DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_URL } from './lib/supabaseDefaults';

function clean(value: unknown): string {
  if (value == null) return '';
  return String(value).trim().replace(/^["']|["']$/g, '');
}

function isValidHttpUrl(url: string): boolean {
  return /^https?:\/\/.+/i.test(url);
}

function resolveBuildSupabaseEnv(env: Record<string, string | undefined>) {
  const urlCandidates = [
    env.VITE_SUPABASE_URL,
    env.SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_URL,
  ];
  const url =
    urlCandidates.map(clean).find(isValidHttpUrl) || DEFAULT_SUPABASE_URL;

  const anonCandidates = [
    env.VITE_SUPABASE_ANON_KEY,
    env.SUPABASE_ANON_KEY,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    env.SUPABASE_PUBLISHABLE_KEY,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ];
  const anonKey = anonCandidates.map(clean).find(Boolean) || DEFAULT_SUPABASE_ANON_KEY;

  return { url, anonKey };
}

/** Injeta Supabase no HTML — garante valores no client mesmo se import.meta.env falhar na Vercel. */
function injectSupabaseEnvPlugin(config: { url: string; anonKey: string }): Plugin {
  const payload = JSON.stringify({ url: config.url, anonKey: config.anonKey });
  const snippet = `<script>window.__TMSEG_SUPABASE__=${payload};</script>`;
  return {
    name: 'inject-supabase-env',
    transformIndexHtml(html) {
      return html.replace('<head>', `<head>${snippet}`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const supabase = resolveBuildSupabaseEnv(env);

  console.log('[build] Supabase URL:', supabase.url ? `${supabase.url.slice(0, 32)}...` : '(vazio)');

  const finalKey = env.VITE_GEMINI_API_KEY || env.VITE_API_KEY || env.GEMINI_API_KEY || '';

  return {
    plugins: [react(), injectSupabaseEnvPlugin(supabase)],
    server: {
      host: '0.0.0.0',
      port: 5000,
    },
    build: {
      target: ['es2020', 'safari13'],
    },
    define: {
      'process.env.API_KEY': JSON.stringify(finalKey),
      'process.env.NODE_ENV': JSON.stringify(mode),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabase.url),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabase.anonKey),
    },
  };
});
