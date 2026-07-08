/** Detecção de nova versão publicada e reload seguro (preserva login). */

export const APP_UPDATE_RELOAD_FLAG = '__tmseg_just_reloaded__';

export type PublishedVersionInfo = {
  version: string;
  buildId: string;
  builtAt?: string;
};

export type ClientBuildInfo = {
  version: string;
  buildId: string;
};

export function isPublishedVersionNewer(
  client: ClientBuildInfo,
  server: PublishedVersionInfo
): boolean {
  if (server.buildId && client.buildId && server.buildId !== client.buildId) {
    return true;
  }
  if (server.version && client.version && server.version !== client.version) {
    return true;
  }
  return false;
}

export async function clearCachesAndServiceWorkers(): Promise<void> {
  if ('caches' in window) {
    try {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n).catch(() => false)));
    } catch {
      /* ignore */
    }
  }
  if ('serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    } catch {
      /* ignore */
    }
  }
}

export async function fetchPublishedVersion(): Promise<PublishedVersionInfo | null> {
  try {
    const res = await fetch(`/api/version?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as PublishedVersionInfo;
    if (!data?.version && !data?.buildId) return null;
    return data;
  } catch {
    return null;
  }
}

export async function reloadForPublishedUpdate(
  server: PublishedVersionInfo,
  flagKey = APP_UPDATE_RELOAD_FLAG
): Promise<void> {
  sessionStorage.setItem(flagKey, '1');
  // Preserva sessão: atualiza app_version antes do reload para o App não cair no login.
  try {
    localStorage.setItem('app_version', server.version);
  } catch {
    /* ignore */
  }
  await clearCachesAndServiceWorkers();
  const url = new URL(window.location.href);
  // Mantém ?page= e demais params — evita voltar ao dashboard após auto-update.
  url.searchParams.set('_v', server.buildId || server.version);
  window.location.replace(url.toString());
}

/** Intervalo mínimo entre checagens ao voltar para a aba (evita reload em loop). */
export const UPDATE_CHECK_COOLDOWN_MS = 10 * 60 * 1000;

let lastUpdateCheckAt = 0;

export function shouldThrottleUpdateCheck(): boolean {
  const now = Date.now();
  if (now - lastUpdateCheckAt < UPDATE_CHECK_COOLDOWN_MS) return true;
  lastUpdateCheckAt = now;
  return false;
}
