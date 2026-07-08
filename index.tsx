import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { APP_VERSION } from './constants';
import {
  APP_UPDATE_RELOAD_FLAG,
  fetchPublishedVersion,
  isPublishedVersionNewer,
  reloadForPublishedUpdate,
} from './lib/appUpdate';

declare const __TMSEG_BUILD_ID__: string;
declare const __TMSEG_BUILD_VERSION__: string;

const CLIENT_BUILD = {
  version: typeof __TMSEG_BUILD_VERSION__ !== 'undefined' ? __TMSEG_BUILD_VERSION__ : APP_VERSION,
  buildId: typeof __TMSEG_BUILD_ID__ !== 'undefined' ? __TMSEG_BUILD_ID__ : APP_VERSION,
};

// ============================================================
// AUTO-UPDATE NO BOOT + AO VOLTAR PARA A ABA
// Compara buildId/version do bundle local com /api/version (no-store).
// Se divergir → limpa caches + SWs + reload com bypass, preservando login.
// ============================================================

const PUBLIC_PATHS = ['/fornecedor/dhl', '/cadastro-operacional', '/reset-password'];
const isPublicExternalRoute = (() => {
  try {
    const p = window.location.pathname.toLowerCase().replace(/\/$/, '');
    return PUBLIC_PATHS.includes(p);
  } catch {
    return false;
  }
})();

let updateCheckInFlight = false;

async function checkForPublishedUpdate(options?: { skipReloadFlag?: boolean }): Promise<boolean> {
  if (isPublicExternalRoute) return false;
  if (window.location.hostname === 'localhost') return false;
  if (!options?.skipReloadFlag && sessionStorage.getItem(APP_UPDATE_RELOAD_FLAG)) return false;
  if (updateCheckInFlight) return false;

  updateCheckInFlight = true;
  try {
    const server = await fetchPublishedVersion();
    if (!server) return false;

    if (!isPublishedVersionNewer(CLIENT_BUILD, server)) {
      return false;
    }

    console.warn(
      `[AutoUpdate] Build local (${CLIENT_BUILD.buildId} / v${CLIENT_BUILD.version}) ` +
        `≠ servidor (${server.buildId} / v${server.version}). Atualizando…`
    );
    await reloadForPublishedUpdate(server);
    return true;
  } finally {
    updateCheckInFlight = false;
  }
}

(async () => {
  try {
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

    const storedVersion = localStorage.getItem('app_version');
    if (storedVersion && storedVersion !== APP_VERSION) {
      console.log(`[Versão] Atualizado de ${storedVersion} → ${APP_VERSION}`);
      // Mantém login: só atualiza a marca de versão local (não limpa authToken/userData).
      localStorage.setItem('app_version', APP_VERSION);
      try {
        sessionStorage.clear();
      } catch {}
    }

    const updated = await checkForPublishedUpdate();
    if (updated) return;

    try {
      sessionStorage.removeItem(APP_UPDATE_RELOAD_FLAG);
    } catch {}
  } catch (err) {
    console.warn('[Boot] Falha na verificação de versão:', err);
  }
})();

if (!isPublicExternalRoute && window.location.hostname !== 'localhost') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void checkForPublishedUpdate({ skipReloadFlag: true });
    }
  });
  window.addEventListener('focus', () => {
    void checkForPublishedUpdate({ skipReloadFlag: true });
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ('serviceWorker' in navigator && window.location.hostname !== 'localhost') {
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
    } catch (err) {
      console.warn('[SW] Falha ao registrar:', err);
    }
  });
}
