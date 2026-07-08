
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { resolveSupabasePublicEnv } from './lib/supabasePublicEnv';

function readBuildMeta(): { version: string; buildId: string; builtAt: string } {
  const metaPath = path.join(process.cwd(), 'client', 'public', 'build-meta.json');
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  } catch {
    return { version: 'unknown', buildId: 'dev', builtAt: '' };
  }
}

/** Injeta Supabase no HTML — garante valores do projeto TM SEG no client. */
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
  const supabase = resolveSupabasePublicEnv(env);

  console.log('[build] Supabase URL:', supabase.url ? `${supabase.url.slice(0, 40)}...` : '(vazio)');

  const finalKey = env.VITE_GEMINI_API_KEY || env.VITE_API_KEY || env.GEMINI_API_KEY || '';
  const buildMeta = readBuildMeta();

  return {
    plugins: [react(), injectSupabaseEnvPlugin(supabase)],
    // Garante UMA única instância de React em todo o app. Sem o dedupe, uma
    // reotimização de dependências do Vite no meio da sessão podia servir duas
    // cópias do React, deixando o "dispatcher" nulo e quebrando os hooks com
    // "Cannot read properties of null (reading 'useEffect')".
    resolve: {
      dedupe: ['react', 'react-dom'],
    },
    // Pré-empacota o React de forma estável no dev-server, evitando que um
    // import descoberto tardiamente dispare nova otimização com hash diferente.
    optimizeDeps: {
      include: ['react', 'react-dom', 'react/jsx-runtime'],
    },
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
      __TMSEG_BUILD_ID__: JSON.stringify(buildMeta.buildId),
      __TMSEG_BUILD_VERSION__: JSON.stringify(buildMeta.version),
    },
  };
});
