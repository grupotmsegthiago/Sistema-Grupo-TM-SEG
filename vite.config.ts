
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import process from 'node:process';

export default defineConfig(({ mode }) => {
  // .env local + variáveis injetadas pela Vercel em process.env no build
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };

  const finalKey = env.VITE_GEMINI_API_KEY || env.VITE_API_KEY || env.GEMINI_API_KEY || '';

  const supabaseUrl =
    env.VITE_SUPABASE_URL ||
    env.SUPABASE_URL ||
    env.NEXT_PUBLIC_SUPABASE_URL ||
    '';
  const supabaseAnonKey =
    env.VITE_SUPABASE_ANON_KEY ||
    env.SUPABASE_ANON_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';

  // Vite já injeta VITE_* do process.env — só usamos define como fallback SUPABASE_* → VITE_*.
  const define: Record<string, string> = {
    'process.env.API_KEY': JSON.stringify(finalKey),
    'process.env.NODE_ENV': JSON.stringify(mode),
  };
  if (!env.VITE_SUPABASE_URL && supabaseUrl) {
    define['import.meta.env.VITE_SUPABASE_URL'] = JSON.stringify(supabaseUrl);
  }
  if (!env.VITE_SUPABASE_ANON_KEY && supabaseAnonKey) {
    define['import.meta.env.VITE_SUPABASE_ANON_KEY'] = JSON.stringify(supabaseAnonKey);
  }

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5000,
    },
    build: {
      target: ['es2020', 'safari13'],
    },
    define,
  };
});
