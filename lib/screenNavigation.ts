/** Mantém a tela atual na URL e no sessionStorage para sobreviver a reloads/auto-update. */

import { canAccessDiretoriaMenu } from './diretoriaAccess';
import { canAccessScreen, fallbackScreenForUser } from './screenAccess';

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

function readStoredUser(): { name?: string; role?: string; permissions?: string[]; clientId?: string } | null {
  try {
    const raw = localStorage.getItem('userData');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Cockpit só é home padrão para quem tem menu Diretoria (nome), não pelo perfil. */
export function getRoleDefaultScreen(): string | null {
  const user = readStoredUser();
  if (!user) return null;
  if (canAccessDiretoriaMenu(user) && canAccessScreen(user, DIRECTORIA_COCKPIT_SCREEN)) {
    return DIRECTORIA_COCKPIT_SCREEN;
  }
  return null;
}

export function resolveInitialScreen(fallback = 'dashboard'): string {
  const user = readStoredUser();
  const fromUrl = getScreenFromUrl();
  if (fromUrl) {
    if (!user || canAccessScreen(user, fromUrl)) return fromUrl;
    return fallbackScreenForUser(user);
  }
  const roleScreen = getRoleDefaultScreen();
  if (roleScreen) return roleScreen;
  const stored = getStoredScreen();
  if (stored) {
    if (!user || canAccessScreen(user, stored)) return stored;
    return fallbackScreenForUser(user);
  }
  return fallback;
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
