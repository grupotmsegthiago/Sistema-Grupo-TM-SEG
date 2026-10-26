/** Link temporário de uma proposta. Não abre o restante do sistema. */

import { KIND_PORTAL_COTACAO, propostaDoHistorico, type LinhaHistoricoCotacao } from './historicoCotacoes';
import type { PropostaPortal } from './cotacao';

export const DIAS_LINK_PROPOSTA = 10;
export const MS_LINK_PROPOSTA = DIAS_LINK_PROPOSTA * 24 * 60 * 60 * 1000;

export type LinkPublicoProposta = {
  token: string;
  expiraEm: string;
};

export function tokenDeBytes(bytes: Uint8Array): string {
  return Array.from(bytes, (item) => item.toString(16).padStart(2, '0')).join('');
}

export function criarLinkPublico(agora: Date, aleatorio: Uint8Array): LinkPublicoProposta {
  if (aleatorio.length < 16) throw new Error('Token curto.');
  return {
    token: tokenDeBytes(aleatorio),
    expiraEm: new Date(agora.getTime() + MS_LINK_PROPOSTA).toISOString(),
  };
}

export function linkAindaVale(link: LinkPublicoProposta | null | undefined, agora: Date): boolean {
  if (!link || !/^[a-f0-9]{32,64}$/.test(link.token)) return false;
  const expira = new Date(link.expiraEm);
  return !Number.isNaN(expira.getTime()) && expira.getTime() > agora.getTime();
}

export function tokensIguais(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function caminhoLinkProposta(id: string, token: string): string {
  return `/proposta/v/${encodeURIComponent(id)}/${token}`;
}

export function lerCaminhoLinkProposta(pathname: string): { id: string; token: string } | null {
  const achado = String(pathname || '').match(/\/proposta\/v\/([^/]+)\/([a-f0-9]{32,64})\/?$/i);
  if (!achado) return null;
  try {
    return { id: decodeURIComponent(achado[1]), token: achado[2].toLowerCase() };
  } catch {
    return null;
  }
}

export function dataLinkProposta(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  return data.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Mantém o JSON da proposta e só grava o link. Texto livre de cotação antiga não é reescrito. */
export function anexarLinkNoSnapshot(bruto: string | null | undefined, link: LinkPublicoProposta): string | null {
  if (!bruto) return null;
  try {
    const dados = JSON.parse(bruto) as { kind?: string };
    if (!dados || dados.kind !== KIND_PORTAL_COTACAO) return null;
    return JSON.stringify({ ...dados, linkPublico: { token: link.token, expiraEm: link.expiraEm } });
  } catch {
    return null;
  }
}

export type LinhaLinkProposta = Pick<LinhaHistoricoCotacao, 'id' | 'client_name' | 'origin' | 'destination' | 'total_km' | 'total_hours' | 'total_value' | 'created_at' | 'status' | 'contract_details'>;

export function vistaPublicaDaProposta(
  linha: LinhaLinkProposta,
  token: string,
  agora: Date,
): { ok: true; cliente: string; expiraEm: string; validade: string; proposta: PropostaPortal } | { ok: false; status: number; error: string } {
  let link: LinkPublicoProposta | null = null;
  try {
    const dados = JSON.parse(String(linha.contract_details || '')) as { linkPublico?: LinkPublicoProposta };
    if (dados?.linkPublico?.token && dados.linkPublico.expiraEm) link = dados.linkPublico;
  } catch {
    link = null;
  }
  if (!link || !tokensIguais(link.token, token.toLowerCase())) {
    return { ok: false, status: 404, error: 'Link inválido ou vencido.' };
  }
  if (!linkAindaVale(link, agora)) return { ok: false, status: 410, error: 'Este link venceu. Peça um novo.' };
  return {
    ok: true,
    cliente: String(linha.client_name || '').trim(),
    expiraEm: link.expiraEm,
    validade: dataLinkProposta(link.expiraEm),
    proposta: propostaDoHistorico(linha),
  };
}
