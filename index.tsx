import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { APP_VERSION } from './constants';

// ============================================================
// AUTO-UPDATE NO BOOT (sem ser invasivo)
// Em todo boot:
//  1) Desregistra Service Workers órfãos (escopos diferentes do nosso /sw.js)
//  2) Detecta bump local de APP_VERSION e limpa sessionStorage
//  3) Compara versão local x versão publicada no servidor (/api/version, no-store).
//     Se divergir → limpa caches + SWs + sessionStorage + reload com bypass,
//     preservando token de login. Flag de sessão evita loop.
// Não fazemos limpeza incondicional de cache em todo boot — só quando
// realmente precisa (versão diferente). O sw.js já é network-only.
// ============================================================

const REDIRECTED_FLAG = '__tmseg_just_reloaded__';

async function clearCachesAndSWs(): Promise<void> {
  if ('caches' in window) {
    try {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n).catch(() => false)));
    } catch {}
  }
  if ('serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    } catch {}
  }
}

(async () => {
  try {
    // 1) Remove SWs órfãos (de scopes ou URLs diferentes do nosso /sw.js)
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        const scope = reg.scope || '';
        const swUrl =
          reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || '';
        if (!swUrl.endsWith('/sw.js') || !scope.endsWith('/')) {
          await reg.unregister().catch(() => false);
          console.log(`[SW] Desregistrado SW órfão: ${swUrl}`);
        }
      }
    }

    // 2) Detecta mudança de versão LOCAL e limpa sessionStorage
    const storedVersion = localStorage.getItem('app_version');
    if (storedVersion && storedVersion !== APP_VERSION) {
      console.log(`[Versão] Atualizado de ${storedVersion} → ${APP_VERSION}`);
      try { sessionStorage.clear(); } catch {}
    }

    // 3) Compara com versão publicada no servidor — só age se divergir.
    if (window.location.hostname !== 'localhost' && !sessionStorage.getItem(REDIRECTED_FLAG)) {
      try {
        const res = await fetch('/api/version', {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (res.ok) {
          const { version: serverVersion } = await res.json();
          if (serverVersion && serverVersion !== APP_VERSION) {
            console.warn(
              `[AutoUpdate] Versão local (${APP_VERSION}) ≠ servidor (${serverVersion}). Atualizando…`
            );
            sessionStorage.setItem(REDIRECTED_FLAG, '1');
            await clearCachesAndSWs();
            const url = new URL(window.location.href);
            url.searchParams.set('_v', serverVersion);
            window.location.replace(url.toString());
            return;
          }
        }
      } catch {
        // Sem rede ou backend fora — segue com versão local
      }
    }
    try { sessionStorage.removeItem(REDIRECTED_FLAG); } catch {}
  } catch (err) {
    console.warn('[Boot] Falha na verificação de versão:', err);
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