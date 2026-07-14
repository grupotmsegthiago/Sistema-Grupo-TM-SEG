/** Mantém a tela atual na URL e no sessionStorage para sobreviver a reloads/auto-update. */

import { canAccessDiretoriaMenu } from './diretoriaAccess';

export const SCREEN_STORAGE_KEY = 'tmseg_current_screen';

/** Tela padrão ao abrir o sistema (somente Thiago Moreira / Thiago Santos) */
export const DIRECTORIA_COCKPIT_SCREEN = 'diretoria-cockpit';

const PAGE_PARAM = 'page';

export function getScreenFromUrl(): string | null {
  try {
    const page = new URLSearchParams(window.location.search).get(PAGE_PARAM);
    if (page && /^[a-z0-9-]+$/i.test(page)) return page;
  } catch {
    /* ignore */
  }
  return null;
}

export function getStoredScreen(): string | null {
  try {
    const stored = sessionStorage.getItem(SCREEN_STORAGE_KEY);
    if (stored && /^[a-z0-9-]+$/i.test(stored)) return stored;
  } catch {
    /* ignore */
  }
  return null;
}

/** Cockpit só é home padrão para quem tem menu Diretoria (nome), não pelo perfil. */
export function getRoleDefaultScreen(): string | null {
  try {
    const raw = localStorage.getItem('userData');
    if (!raw) return null;
    const user = JSON.parse(raw);
    if (canAccessDiretoriaMenu(user)) return DIRECTORIA_COCKPIT_SCREEN;
  } catch {
    /* ignore */
  }
  return null;
}

export function resolveInitialScreen(fallback = 'dashboard'): string {
  const fromUrl = getScreenFromUrl();
  if (fromUrl) return fromUrl;
  const roleScreen = getRoleDefaultScreen();
  if (roleScreen) return roleScreen;
  return getStoredScreen() || fallback;
}

/** Atualiza ?page= sem recarregar — preserva outras query params (openMission, etc.). */
export function syncUrlWithScreen(screen: string): void {
  try {
    const url = new URL(window.location.href);
    if (screen === 'dashboard') {
      url.searchParams.delete(PAGE_PARAM);
    } else {
      url.searchParams.set(PAGE_PARAM, screen);
    }
    window.history.replaceState(null, '', url.toString());
  } catch {
    /* ignore */
  }
}

export function persistScreen(screen: string): void {
  syncUrlWithScreen(screen);
  try {
    if (screen === 'dashboard') {
      sessionStorage.removeItem(SCREEN_STORAGE_KEY);
    } else {
      sessionStorage.setItem(SCREEN_STORAGE_KEY, screen);
    }
  } catch {
    /* ignore */
  }
}
