
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import process from 'node:process';

export default defineConfig(({ mode }) => {
  // Carrega todas as variáveis do .env local, independente do prefixo
  const env = loadEnv(mode, process.cwd(), '');
  
  // Prioriza a chave do Gemini, mas aceita variações comuns
  const finalKey = env.VITE_GEMINI_API_KEY || env.VITE_API_KEY || env.GEMINI_API_KEY || '';

  return {
    plugins: [react()],
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
    }
  };
});
