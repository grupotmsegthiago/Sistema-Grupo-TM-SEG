import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { APP_VERSION } from './constants';
import {
  APP_UPDATE_RELOAD_BUILD_KEY,
  APP_UPDATE_RELOAD_FLAG,
  fetchPublishedVersion,
  isBootReloadGuarded,
  isPublishedVersionNewer,
  markBootReloadGuard,
  reloadForPublishedUpdate,
  shouldThrottleUpdateCheck,
} from './lib/appUpdate';
import {
  FORCE_LOGOUT_SEEN_KEY,
  clearLocalStoragePreservingForceLogoutSeen,
} from './lib/forceLogout';
import { SCREEN_STORAGE_KEY } from './lib/screenNavigation';

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

const PUBLIC_PATHS = ['/fornecedor/dhl', '/cadastro-operacional', '/reset-password', '/rastreio'];
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
  if (isBootReloadGuarded()) return false;
  if (!options?.skipReloadFlag && sessionStorage.getItem(APP_UPDATE_RELOAD_FLAG)) return false;
  if (updateCheckInFlight) return false;

  updateCheckInFlight = true;
  try {
    const server = await fetchPublishedVersion();
    if (!server) return false;

    if (!isPublishedVersionNewer(CLIENT_BUILD, server)) return false;

    // Já tentamos recarregar para este build e o bundle antigo ainda veio do cache:
    // não entrar em loop de replace a cada segundo.
    try {
      const already = sessionStorage.getItem(APP_UPDATE_RELOAD_BUILD_KEY) || '';
      if (already && already === String(server.buildId || server.version || '')) {
        console.warn(
          `[AutoUpdate] Já recarregou para ${already} e o bundle local ainda diverge — abortando loop.`,
        );
        return false;
      }
    } catch {
      /* ignore */
    }

    console.warn(
      `[AutoUpdate] Build local (${CLIENT_BUILD.buildId} / v${CLIENT_BUILD.version}) ` +
        `≠ servidor (${server.buildId} / v${server.version}). Atualizando…`,
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
        const keepScreen = sessionStorage.getItem(SCREEN_STORAGE_KEY);
        const keepReloadFlag = sessionStorage.getItem(APP_UPDATE_RELOAD_FLAG);
        const keepReloadBuild = sessionStorage.getItem(APP_UPDATE_RELOAD_BUILD_KEY);
        const keepGuard = sessionStorage.getItem('tmseg:boot_reload_guard');
        sessionStorage.clear();
        if (keepScreen) sessionStorage.setItem(SCREEN_STORAGE_KEY, keepScreen);
        if (keepReloadFlag) sessionStorage.setItem(APP_UPDATE_RELOAD_FLAG, keepReloadFlag);
        if (keepReloadBuild) sessionStorage.setItem(APP_UPDATE_RELOAD_BUILD_KEY, keepReloadBuild);
        if (keepGuard) sessionStorage.setItem('tmseg:boot_reload_guard', keepGuard);
      } catch {}
    }

    const updated = await checkForPublishedUpdate();
    if (updated) return;

    // Após carregar (ou se já estava na versão nova): sinal global de re-login
    try {
      if (!isBootReloadGuarded()) {
        const server = await fetchPublishedVersion();
        const signal = server?.forceLogoutSignal ? String(server.forceLogoutSignal).trim() : '';
        if (signal) {
          const seen = localStorage.getItem(FORCE_LOGOUT_SEEN_KEY) || '';
          if (signal !== seen) {
            console.warn('[ForceLogout] Sinal global detectado — exigindo novo login.');
            const hadAuth = Boolean(
              localStorage.getItem('authToken') || localStorage.getItem('userData'),
            );
            clearLocalStoragePreservingForceLogoutSeen();
            try {
              sessionStorage.clear();
            } catch {
              /* ignore */
            }
            localStorage.setItem(FORCE_LOGOUT_SEEN_KEY, signal);
            localStorage.setItem('app_version', APP_VERSION);
            if (hadAuth) {
              markBootReloadGuard();
              window.location.replace('/');
            }
            return;
          }
        }
      }
    } catch {
      /* ignore */
    }

    // Só remove a flag se o bundle local já bate com o servidor.
    try {
      const server = await fetchPublishedVersion();
      if (!server || !isPublishedVersionNewer(CLIENT_BUILD, server)) {
        sessionStorage.removeItem(APP_UPDATE_RELOAD_FLAG);
      }
    } catch {
      /* ignore */
    }
  } catch (err) {
    console.warn('[Boot] Falha na verificação de versão:', err);
  }
})();

if (!isPublicExternalRoute && window.location.hostname !== 'localhost') {
  const checarAtualizacaoPublicada = () => {
    if (document.visibilityState !== 'visible') return;
    if (shouldThrottleUpdateCheck()) return;
    void checkForPublishedUpdate({ skipReloadFlag: true });
  };
  document.addEventListener('visibilitychange', checarAtualizacaoPublicada);
  window.addEventListener('focus', checarAtualizacaoPublicada);
  window.setInterval(checarAtualizacaoPublicada, 60_000);
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
  let recarregouPeloSw = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recarregouPeloSw || isBootReloadGuarded()) return;
    recarregouPeloSw = true;
    markBootReloadGuard();
    window.location.reload();
  });
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
    } catch (err) {
      console.warn('[SW] Falha ao registrar:', err);
    }
  });
}
