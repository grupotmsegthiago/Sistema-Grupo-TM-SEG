/**
 * Logout global: força todos a autenticar de novo.
 * Sinal em system_settings (Realtime) + contagem no /api/version.
 */

export const FORCE_LOGOUT_SETTINGS_KEY = 'force_logout_signal';
export const FORCE_LOGOUT_SEEN_KEY = 'tmseg:force_logout_seen';

/** Token de emergência de uso único deste pedido (rota admin). */
export const FORCE_LOGOUT_EMERGENCY_TOKEN = 'TMSEG-FORCE-ALL-20260929';

export function parseForceLogoutSignal(raw: unknown): string {
  if (raw == null) return '';
  if (typeof raw === 'string') return raw.trim();
  try {
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
}
