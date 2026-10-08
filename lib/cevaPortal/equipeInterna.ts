import { timingSafeEqual } from 'crypto';
import { usuarioSoPortal } from './regrasAcesso.js';

/** Cadastro do sistema (system_users) usado para reconhecer a equipe interna. */
export type CadastroEquipeInterna = {
  id?: number | string | null;
  status?: string | null;
  user_type?: string | null;
  client_id?: unknown;
  provider_id?: unknown;
  permissions?: unknown;
};

/**
 * Equipe interna ativa: o mesmo critério da lista de usuários internos.
 * Cliente, fornecedor e acesso só do portal continuam no login do cliente.
 */
export function ehEquipeInterna(usuario: CadastroEquipeInterna | null | undefined): boolean {
  if (!usuario || usuario.id == null || String(usuario.id) === '') return false;
  if (String(usuario.status || '') !== 'Ativo') return false;
  if (usuarioSoPortal(usuario.permissions)) return false;
  const tipo = String(usuario.user_type || '').trim().toLowerCase();
  if (tipo === 'client' || tipo === 'provider') return false;
  if (tipo === 'internal') return true;
  return !tipo && !usuario.client_id && !usuario.provider_id;
}

/** Mesma comparação do login do sistema: senha em texto, com a digitada sem espaços nas pontas. */
export function senhaEquipeConfere(informada: string, gravada: string | null | undefined): boolean {
  const limpa = String(informada ?? '').trim();
  const salva = gravada == null ? '' : String(gravada);
  if (!limpa || !salva) return false;
  const digitada = Buffer.from(limpa);
  const armazenada = Buffer.from(salva);
  if (digitada.length !== armazenada.length) return false;
  return timingSafeEqual(digitada, armazenada);
}

/** Prefixo próprio para o id do sistema não cair na tabela de usuários do portal. */
export function tokenDaEquipeInterna(prefixo: string, userId: string | number, agora = Date.now()): string {
  return `${prefixo}-interno-${userId}-${agora}`;
}

export type OrigemTokenPortal = 'portal' | 'equipe';

export function origemDoTokenPortal(
  prefixo: string,
  header: string | null | undefined,
): { origem: OrigemTokenPortal; id: string } | null {
  const raw = String(header || '').replace(/^Bearer\s+/i, '').trim();
  const seguro = prefixo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const equipe = raw.match(new RegExp(`^${seguro}-interno-(\\d+)-(\\d{10,})$`));
  if (equipe) return { origem: 'equipe', id: equipe[1] };
  const portal = raw.match(new RegExp(`^${seguro}-(\\d+)-(\\d{10,})$`));
  if (portal) return { origem: 'portal', id: portal[1] };
  return null;
}
