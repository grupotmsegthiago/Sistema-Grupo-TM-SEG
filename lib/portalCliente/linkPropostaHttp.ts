/** Emissão e leitura do link. A página pública não recebe e-mail, id de usuário nem o restante do sistema. */

import { podeEnviarCotacao, type AtorCotacao, type CotacaoGestao } from './gestaoCotacao';
import { lerSnapshot } from './historicoCotacoes';
import {
  anexarLinkNoSnapshot,
  caminhoLinkProposta,
  criarLinkPublico,
  linkAindaVale,
  vistaPublicaDaProposta,
  type LinhaLinkProposta,
  type LinkPublicoProposta,
} from './linkProposta';

export type BancoLinkProposta = {
  ler(id: string): Promise<LinhaLinkProposta & { created_by?: string | null; is_active?: boolean | null; converted_to_order_id?: string | null } | null>;
  gravar(id: string, contractDetails: string): Promise<string | null>;
};

function cotacaoDoRegistro(linha: NonNullable<Awaited<ReturnType<BancoLinkProposta['ler']>>>): CotacaoGestao {
  const salvo = lerSnapshot(linha.contract_details);
  return {
    id: String(linha.id),
    client_name: linha.client_name,
    created_by: linha.created_by,
    solicitanteEmail: salvo?.solicitanteEmail || '',
    status: linha.status,
    is_active: linha.is_active,
    converted_to_order_id: linha.converted_to_order_id,
    origin: linha.origin,
    destination: linha.destination,
    total_km: Number(linha.total_km),
    total_value: Number(linha.total_value),
    created_at: linha.created_at ? String(linha.created_at) : null,
  };
}

export async function emitirLinkProposta(
  banco: BancoLinkProposta,
  ator: AtorCotacao | null,
  id: string,
  agora: Date,
  aleatorio: Uint8Array,
): Promise<{ status: number; corpo: { ok: true; caminho: string; expiraEm: string; reutilizado: boolean } | { error: string } }> {
  if (!ator) return { status: 401, corpo: { error: 'Entre novamente.' } };
  const linha = await banco.ler(id);
  if (!linha) return { status: 404, corpo: { error: 'Cotação não encontrada.' } };
  if (!podeEnviarCotacao(ator, cotacaoDoRegistro(linha))) {
    return { status: 403, corpo: { error: 'Você não pode gerar o link desta cotação.' } };
  }
  const salvo = lerSnapshot(linha.contract_details);
  if (!salvo) return { status: 409, corpo: { error: 'Gere a proposta no histórico antes do link.' } };
  const atual = salvo.linkPublico;
  if (atual && linkAindaVale(atual, agora)) {
    return {
      status: 200,
      corpo: { ok: true, caminho: caminhoLinkProposta(String(linha.id), atual.token), expiraEm: atual.expiraEm, reutilizado: true },
    };
  }
  let novo: LinkPublicoProposta;
  try {
    novo = criarLinkPublico(agora, aleatorio);
  } catch {
    return { status: 500, corpo: { error: 'Não foi possível gerar o link.' } };
  }
  const gravado = anexarLinkNoSnapshot(linha.contract_details, novo);
  if (!gravado) return { status: 409, corpo: { error: 'Gere a proposta no histórico antes do link.' } };
  const falha = await banco.gravar(String(linha.id), gravado);
  if (falha) return { status: 500, corpo: { error: falha } };
  return {
    status: 200,
    corpo: { ok: true, caminho: caminhoLinkProposta(String(linha.id), novo.token), expiraEm: novo.expiraEm, reutilizado: false },
  };
}

export async function lerPropostaPublica(
  banco: BancoLinkProposta,
  id: string,
  token: string,
  agora: Date,
): Promise<{ status: number; corpo: { ok: true; cliente: string; expiraEm: string; validade: string; proposta: unknown } | { error: string } }> {
  const linha = await banco.ler(id);
  if (!linha) return { status: 404, corpo: { error: 'Link inválido ou vencido.' } };
  const vista = vistaPublicaDaProposta(linha, token, agora);
  if (!vista.ok) return { status: vista.status, corpo: { error: vista.error } };
  return {
    status: 200,
    corpo: { ok: true, cliente: vista.cliente, expiraEm: vista.expiraEm, validade: vista.validade, proposta: vista.proposta },
  };
}
