import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { APP_VERSION } from './constants';

// ============================================================
// AUTO-LIMPEZA DE CACHE + AUTO-UPDATE NO BOOT
// Toda vez que o app abre:
//  1) Apaga Cache Storage API (caches herdados de SWs antigos)
//  2) Desregistra Service Workers órfãos (escopos antigos)
//  3) Limpa sessionStorage e cache HTTP do React Query (sessionStorage)
//  4) Compara versão do bundle local com versão publicada no servidor
//     (GET /api/version, no-store). Se divergir → HARD RESET completo
//     (apaga tudo menos token de login + IndexedDB + reload com bypass).
// Isso garante que o usuário NUNCA fique preso em uma versão antiga.
// ============================================================

const REDIRECTED_FLAG = '__tmseg_just_reloaded__';

async function nukeBrowserState(preserveAuth: boolean = true): Promise<void> {
  // Preserva autenticação para usuário não precisar relogar
  const keepKeys = ['authToken', 'auth_token', 'userData', 'tmseg-token', 'app_version', 'notificationSound'];
  const preserved: Record<string, string> = {};
  if (preserveAuth) {
    for (const k of keepKeys) {
      const v = localStorage.getItem(k);
      if (v !== null) preserved[k] = v;
    }
  }
  try { sessionStorage.clear(); } catch {}
  try {
    localStorage.clear();
    for (const [k, v] of Object.entries(preserved)) localStorage.setItem(k, v);
  } catch {}
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
  if ('indexedDB' in window && (indexedDB as any).databases) {
    try {
      const dbs: Array<{ name?: string }> = await (indexedDB as any).databases();
      await Promise.all(
        dbs.filter((d) => d.name).map(
          (d) =>
            new Promise<void>((resolve) => {
              const req = indexedDB.deleteDatabase(d.name as string);
              req.onsuccess = req.onerror = req.onblocked = () => resolve();
            })
        )
      );
    } catch {}
  }
}

(async () => {
  try {
    // 1) Cleanup leve em todo boot: caches do navegador + SWs órfãos
    if ('caches' in window) {
      const names = await caches.keys();
      if (names.length > 0) {
        await Promise.all(names.map((n) => caches.delete(n).catch(() => false)));
        console.log(`[Cache] Limpos ${names.length} cache(s) do navegador no boot`);
      }
    }

    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        const scope = reg.scope || '';
        const swUrl =
          reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || '';
        // Mantém só o nosso /sw.js no scope raiz; qualquer outro vai embora
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

    // 3) HARD CHECK contra o SERVIDOR — pega versão publicada e compara.
    //    Em produção: hostname não é localhost. Sem rede: ignora silenciosamente.
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
              `[AutoUpdate] Versão local (${APP_VERSION}) ≠ servidor (${serverVersion}). Limpando tudo e recarregando…`
            );
            sessionStorage.setItem(REDIRECTED_FLAG, '1');
            await nukeBrowserState(true);
            const url = new URL(window.location.href);
            url.searchParams.set('_v', serverVersion);
            url.searchParams.set('_t', String(Date.now()));
            window.location.replace(url.toString());
            return; // não monta o React; o reload vai acontecer
          }
        }
      } catch (e) {
        // Sem rede ou backend fora — segue com versão local
        console.log('[AutoUpdate] Não foi possível verificar versão do servidor (segue offline)');
      }
    }
    // Limpa flag se chegamos até aqui sem precisar redirect
    try { sessionStorage.removeItem(REDIRECTED_FLAG); } catch {}
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