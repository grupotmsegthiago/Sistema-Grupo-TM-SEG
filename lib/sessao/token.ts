/**
 * Sessão assinada no servidor. O navegador não consegue forjar o token.
 * O formato antigo tmseg-token e impersonation-token não abre sessão.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const PREFIXO = 'ponte.v1.';
export const TTL_SESSAO_MS = 12 * 60 * 60 * 1000;

export function segredoDaSessao(
  env: Record<string, string | undefined> = process.env,
): string {
  return String(env.SESSION_SECRET || '').trim();
}

export function tokenLegado(token: string): boolean {
  const limpo = String(token || '').replace(/^Bearer\s+/i, '').trim();
  return limpo.startsWith('tmseg-token-') || limpo.startsWith('impersonation-token-');
}

function assinar(segredo: string, carga: string): string {
  return createHmac('sha256', segredo).update(carga).digest('base64url');
}

export function emitirSessao(
  segredo: string,
  usuarioId: string,
  agora = Date.now(),
  ttl = TTL_SESSAO_MS,
  epoch = 0,
): { token: string; csrf: string; expiraEm: number; epoch: number } {
  if (!segredo || !usuarioId) throw new Error('sessao_indisponivel');
  const csrf = randomBytes(32).toString('base64url');
  const expiraEm = agora + ttl;
  const corpo = Buffer.from(JSON.stringify({ sub: usuarioId, exp: expiraEm, csrf, ep: epoch }), 'utf8').toString('base64url');
  return { token: `${PREFIXO}${corpo}.${assinar(segredo, corpo)}`, csrf, expiraEm, epoch };
}

export function abrirSessao(
  segredo: string,
  token: string,
  agora = Date.now(),
): { usuarioId: string; csrf: string; expiraEm: number; epoch: number } | null {
  const limpo = String(token || '').replace(/^Bearer\s+/i, '').trim();
  if (!segredo || tokenLegado(limpo) || !limpo.startsWith(PREFIXO)) return null;
  const resto = limpo.slice(PREFIXO.length);
  const ponto = resto.lastIndexOf('.');
  if (ponto <= 0) return null;
  const corpo = resto.slice(0, ponto);
  const assinatura = resto.slice(ponto + 1);
  const esperada = assinar(segredo, corpo);
  const recebida = Buffer.from(assinatura);
  const calculada = Buffer.from(esperada);
  if (recebida.length !== calculada.length || !timingSafeEqual(recebida, calculada)) return null;
  try {
    const json = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8')) as {
      sub?: string;
      exp?: number;
      csrf?: string;
      ep?: number;
    };
    if (!json.sub || typeof json.exp !== 'number' || !json.csrf) return null;
    if (agora >= json.exp) return null;
    return {
      usuarioId: String(json.sub),
      csrf: json.csrf,
      expiraEm: json.exp,
      epoch: typeof json.ep === 'number' ? json.ep : 0,
    };
  } catch {
    return null;
  }
}

export function usuarioIdDoToken(
  token: string,
  env?: Record<string, string | undefined>,
  agora?: number,
): string | null {
  return abrirSessao(segredoDaSessao(env), token, agora)?.usuarioId ?? null;
}
