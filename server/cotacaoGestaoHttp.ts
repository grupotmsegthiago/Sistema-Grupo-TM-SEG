/** Inativar, excluir e enviar a cotação. A exclusão marca status, sem coluna nova. */

import type { Request, Response } from 'express';
import { origemDoTokenPortal } from '../lib/cevaPortal/equipeInterna.js';
import { PORTAL_CEVA, PORTAL_IBL, portalGenerico, type PortalServidor } from '../lib/cevaPortal/portalServidor.js';
import {
  cartaEmailCotacao,
  decisaoExcluir,
  decisaoInativar,
  emailDestinoValido,
  montarDestinatariosEnvio,
  pdfAnexoAceito,
  podeEnviarCotacao,
  registroAuditoriaCotacao,
  type AtorCotacao,
  type CotacaoGestao,
} from '../lib/portalCliente/gestaoCotacao.js';
import { lerSnapshot, nomePdfCotacao } from '../lib/portalCliente/historicoCotacoes.js';
import { cartaDaProposta, htmlDaProposta, propostaRecebida } from '../lib/portalCliente/apresentacao.js';

type Banco = {
  from: (tabela: string) => any;
};

function perfilDoJoin(profiles: { name?: string } | { name?: string }[] | null | undefined): string {
  const linha = Array.isArray(profiles) ? profiles[0] : profiles;
  return String(linha?.name || '');
}

async function atorDoSistema(sb: Banco, id: string): Promise<AtorCotacao | null> {
  const { data, error } = await sb
    .from('system_users')
    .select('id, name, email, status, profiles:profile_id ( name )')
    .eq('id', id)
    .maybeSingle();
  if (error || !data || String(data.status || '') !== 'Ativo') return null;
  return {
    nome: String(data.name || '').trim(),
    email: String(data.email || '').trim().toLowerCase(),
    perfil: perfilDoJoin(data.profiles),
  };
}

async function atorDoPortal(sb: Banco, portal: PortalServidor, id: string): Promise<AtorCotacao | null> {
  const { data, error } = await sb
    .from(portal.tabelas.usuarios)
    .select('id, nome, email, perfil, status')
    .eq('id', id)
    .maybeSingle();
  if (error || !data || String(data.status || '').toLowerCase() !== 'ativo') return null;
  return {
    nome: String(data.nome || '').trim(),
    email: String(data.email || '').trim().toLowerCase(),
    perfil: String(data.perfil || ''),
    portalCliente: portal.clienteNome,
  };
}

async function portalGenericoDoToken(sb: Banco, token: string): Promise<{ portal: PortalServidor; id: string; equipe: boolean } | null> {
  const equipe = token.match(/^portal-([a-z0-9-]{2,48})-interno-(\d+)-\d{10,}$/);
  const pessoa = token.match(/^portal-([a-z0-9-]{2,48})-(\d+)-\d{10,}$/);
  const achado = equipe || pessoa;
  if (!achado) return null;
  const { data } = await sb.from('clients').select('id, name, trading_name, portal_slug').eq('portal_slug', achado[1]).maybeSingle();
  const portal = data ? portalGenerico(data) : null;
  if (!portal) return null;
  return { portal, id: achado[2], equipe: Boolean(equipe) };
}

export async function atorDaRequisicao(sb: Banco, headers: Record<string, unknown> | undefined): Promise<AtorCotacao | null> {
  const token = String(headers?.authorization || headers?.Authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { resolveOsAnalysisPrincipal } = await import('../lib/osAnalysis/apiAuth.js');
  const interno = await resolveOsAnalysisPrincipal(token);
  if (interno) return { nome: interno.name, email: String(interno.email || '').toLowerCase(), perfil: interno.role };
  for (const portal of [PORTAL_CEVA, PORTAL_IBL]) {
    const origem = origemDoTokenPortal(portal.tokenPrefix, token);
    if (!origem) continue;
    if (origem.origem === 'equipe') return atorDoSistema(sb, origem.id);
    return atorDoPortal(sb, portal, origem.id);
  }
  const generico = await portalGenericoDoToken(sb, token);
  if (!generico) return null;
  if (generico.equipe) return atorDoSistema(sb, generico.id);
  return atorDoPortal(sb, generico.portal, generico.id);
}

async function lerCotacao(sb: Banco, id: string): Promise<CotacaoGestao | null> {
  const { data, error } = await sb
    .from('quotes')
    .select('id, client_name, origin, destination, total_km, total_value, created_at, created_by, status, is_active, converted_to_order_id, contract_details')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  const salvo = lerSnapshot(data.contract_details);
  return {
    id: String(data.id),
    client_name: data.client_name,
    created_by: data.created_by,
    solicitanteEmail: salvo?.solicitanteEmail || '',
    status: data.status,
    is_active: data.is_active,
    converted_to_order_id: data.converted_to_order_id,
    origin: data.origin,
    destination: data.destination,
    total_km: Number(data.total_km),
    total_value: Number(data.total_value),
    created_at: data.created_at ? String(data.created_at) : null,
  };
}

async function gravar(sb: Banco, id: string, dados: Record<string, unknown>): Promise<string | null> {
  const { error } = await sb.from('quotes').update(dados).eq('id', id);
  return error ? 'Não foi possível atualizar a cotação.' : null;
}

async function auditar(sb: Banco, entrada: Record<string, unknown>): Promise<void> {
  const { error } = await sb.from('system_logs').insert([entrada]);
  if (error) console.error('[cotacao] auditoria', error.message || error);
}

async function aplicar(
  sb: Banco,
  ator: AtorCotacao,
  cotacao: CotacaoGestao,
  decisao: { ok: true; dados: { is_active: false; status: string } },
  acao: 'cotacao_inativar' | 'cotacao_excluir',
): Promise<{ status: number; corpo: Record<string, unknown> }> {
  const falha = await gravar(sb, String(cotacao.id), decisao.dados);
  if (falha) return { status: 500, corpo: { error: falha } };
  await auditar(sb, registroAuditoriaCotacao({ acao, ator, cotacao }));
  return { status: 200, corpo: { ok: true, id: cotacao.id, status: decisao.dados.status, is_active: false } };
}

export async function atenderGestaoCotacao(req: Request, res: Response, acao: 'inativar' | 'excluir' | 'email'): Promise<void> {
  const { createSupabaseAdminClient } = await import('./supabaseConfig.js');
  const sb = createSupabaseAdminClient();
  if (!sb) {
    res.status(503).json({ error: 'Cotação indisponível.' });
    return;
  }
  const ator = await atorDaRequisicao(sb, req.headers as Record<string, unknown>);
  if (!ator) {
    res.status(401).json({ error: 'Entre novamente.' });
    return;
  }
  const id = String(req.params.id || '').trim();
  const cotacao = await lerCotacao(sb, id);
  if (acao === 'inativar' || acao === 'excluir') {
    const decisao = acao === 'inativar' ? decisaoInativar(ator, cotacao) : decisaoExcluir(ator, cotacao);
    if (!decisao.ok) {
      res.status(decisao.status).json({ error: decisao.error });
      return;
    }
    const resultado = await aplicar(sb, ator, cotacao as CotacaoGestao, decisao, acao === 'inativar' ? 'cotacao_inativar' : 'cotacao_excluir');
    res.status(resultado.status).json(resultado.corpo);
    return;
  }
  if (!cotacao) {
    res.status(404).json({ error: 'Cotação não encontrada.' });
    return;
  }
  if (!podeEnviarCotacao(ator, cotacao)) {
    res.status(403).json({ error: 'Você não pode enviar esta cotação.' });
    return;
  }
  const autorGravado = String(cotacao.solicitanteEmail || '').trim();
  const autor = emailDestinoValido(autorGravado) ? autorGravado : ator.email;
  const destinos = montarDestinatariosEnvio({
    selecionados: [String(req.body?.para || ''), String(req.body?.cc || '')].filter(Boolean).join(', '),
    autor,
  });
  if (!destinos.ok) {
    res.status(400).json({ error: destinos.error });
    return;
  }
  const anexo = pdfAnexoAceito(String(req.body?.pdf || ''));
  if (!anexo.ok) {
    res.status(400).json({ error: anexo.error });
    return;
  }
  const conteudo = Buffer.from(anexo.base64, 'base64');
  if (conteudo.length < 80 || conteudo.subarray(0, 4).toString() !== '%PDF') {
    res.status(400).json({ error: 'O anexo não é um PDF.' });
    return;
  }
  const recebida = propostaRecebida(req.body?.proposta);
  const mensagem = String(req.body?.mensagem || '').trim();
  const texto = recebida
    ? (mensagem || cartaDaProposta(recebida))
    : cartaEmailCotacao({
      origem: cotacao.origin,
      destino: cotacao.destination,
      km: cotacao.total_km,
      valor: cotacao.total_value,
      mensagem,
    });
  try {
    const { sendMail, SMTP_FROM } = await import('../lib/email/smtp.js');
    await sendMail({
      from: SMTP_FROM,
      to: destinos.para,
      cc: destinos.copias.length ? destinos.copias : undefined,
      subject: `Proposta Grupo TM SEG — ${cotacao.origin || 'Cotação'}`,
      text: texto,
      html: recebida ? htmlDaProposta(recebida) : undefined,
      attachments: [{
        filename: nomePdfCotacao({
          cliente: String(cotacao.client_name || 'Cliente'),
          numero: recebida?.numero ?? lerSnapshot(cotacao.contract_details)?.numero ?? null,
          data: cotacao.created_at,
        }),
        content: conteudo,
        contentType: 'application/pdf',
      }],
    });
    res.status(200).json({ ok: true, enviado: true, para: destinos.para, copias: destinos.copias });
  } catch (error) {
    console.error('[cotacao] email', error instanceof Error ? error.message : error);
    res.status(200).json({ ok: true, enviado: false, aviso: 'O e-mail não saiu agora. A cotação continua no histórico.' });
  }
}
