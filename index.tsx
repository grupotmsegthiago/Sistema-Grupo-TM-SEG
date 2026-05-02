import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { APP_VERSION } from './constants';

// ============================================================
// FORÇA LIMPEZA DE CACHE NO BOOT
// Garante que toda vez que o app abrir, o cache do navegador
// (Cache Storage API) e service workers órfãos sejam limpos.
// ============================================================
(async () => {
  try {
    // 1) Limpa TUDO da Cache Storage API (caches deixados por SWs antigos)
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
      if (names.length > 0) console.log(`[Cache] Limpos ${names.length} cache(s) do navegador`);
    }

    // 2) Desregistra service workers órfãos (de escopos antigos)
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        const scope = reg.scope;
        const swUrl = reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || '';
        // Mantém só o nosso /sw.js no scope raiz; remove qualquer outro
        if (!swUrl.endsWith('/sw.js') || !scope.endsWith('/')) {
          await reg.unregister();
          console.log(`[SW] Desregistrado SW órfão: ${swUrl}`);
        }
      }
    }

    // 3) Detecta mudança de versão do app e limpa sessionStorage
    //    (mantém localStorage para preservar token de login)
    const storedVersion = localStorage.getItem('app_version');
    if (storedVersion && storedVersion !== APP_VERSION) {
      console.log(`[Versão] Atualizado de ${storedVersion} → ${APP_VERSION}`);
      sessionStorage.clear();
    }
  } catch (err) {
    console.warn('[Cache] Falha ao limpar caches no boot:', err);
  }
})();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Service Worker: registro automático + detecção de nova versão + reload.
// Garante que o app NUNCA fique travado em uma versão antiga após um deploy.
if ('serviceWorker' in navigator && window.location.hostname !== 'localhost') {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });

      // Quando o SW novo termina de instalar, ativa imediatamente e recarrega.
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('[SW] Nova versão detectada — recarregando…');
            sw.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });

      // Quando o SW muda de controller (skipWaiting + clients.claim), recarrega 1x.
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      });

      // A cada 5 min e ao voltar para a aba, força check de update.
      const checkUpdate = () => { reg.update().catch(() => {}); };
      setInterval(checkUpdate, 5 * 60 * 1000);
      window.addEventListener('focus', checkUpdate);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkUpdate();
      });
    } catch (err) {
      console.warn('[SW] Falha ao registrar:', err);
    }
  });
}