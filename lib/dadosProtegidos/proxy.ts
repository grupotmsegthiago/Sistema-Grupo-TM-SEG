/**
 * Encaminha a consulta das dez tabelas com a chave do servidor, depois da sessão.
 * A chave não volta para o navegador. Token antigo é recusado.
 */
import { createClient } from '@supabase/supabase-js';
import { getSupabaseServiceRoleKey, getSupabaseUrl } from '../supabaseAdmin';
import { abrirSessao, segredoDaSessao, tokenLegado } from '../sessao/token';
import { autorizarTabela, ehTabelaProtegida, type FichaServidor } from './tabelas';

export interface PedidoDados {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
  authorization: string | null;
}

export interface RespostaDados {
  status: number;
  body: string;
  contentType: string;
  contentRange: string | null;
}

const CABECALHOS_UTEIS = ['accept', 'content-type', 'prefer', 'range'];

export function tabelaDaUrl(url: string, origemEsperada: string): { tabela: string; destino: string } | null {
  let lida: URL;
  try {
    lida = new URL(url);
  } catch {
    return null;
  }
  let origem: URL;
  try {
    origem = new URL(origemEsperada);
  } catch {
    return null;
  }
  if (lida.host !== origem.host) return null;
  const partes = lida.pathname.split('/').filter(Boolean);
  if (partes.length !== 3 || partes[0] !== 'rest' || partes[1] !== 'v1') return null;
  const tabela = partes[2];
  if (!ehTabelaProtegida(tabela)) return null;
  if (/system_users|password/i.test(lida.search)) return null;
  return { tabela, destino: `${origem.origin}/rest/v1/${tabela}${lida.search}` };
}

function fichaDe(linha: {
  id: string;
  status?: string | null;
  permissions?: string[] | null;
  client_id?: string | null;
  profiles?: { name?: string; permissions?: string[] } | { name?: string; permissions?: string[] }[] | null;
}): FichaServidor {
  const bruto = linha.profiles;
  const perfil = Array.isArray(bruto) ? bruto[0] : bruto;
  const doPerfil = Array.isArray(perfil?.permissions) ? perfil.permissions : [];
  const doUsuario = Array.isArray(linha.permissions) ? linha.permissions : [];
  return {
    id: String(linha.id),
    status: String(linha.status || ''),
    perfil: String(perfil?.name || ''),
    permissoes: [...new Set([...doPerfil, ...doUsuario])],
    clienteId: linha.client_id ? String(linha.client_id) : null,
  };
}

export async function atenderDadosProtegidos(
  pedido: PedidoDados,
  opcoes: { env?: Record<string, string | undefined>; agora?: number; chave?: string; buscar?: (id: string) => Promise<FichaServidor | null | 'erro'>; encaminhar?: (destino: string, init: RequestInit) => Promise<Response> } = {},
): Promise<RespostaDados> {
  const env = opcoes.env ?? process.env;
  const segredo = segredoDaSessao(env);
  const negado = (status: number, codigo: string): RespostaDados => ({
    status,
    body: JSON.stringify({ ok: false, codigo, message: codigo }),
    contentType: 'application/json',
    contentRange: null,
  });
  if (!segredo || tokenLegado(String(pedido.authorization || ''))) return negado(401, 'sessao_invalida');
  const aberta = abrirSessao(segredo, String(pedido.authorization || ''), opcoes.agora);
  if (!aberta) return negado(401, 'sessao_invalida');
  const origem = getSupabaseUrl();
  const alvo = tabelaDaUrl(pedido.url, origem);
  if (!alvo) return negado(403, 'sem_permissao');
  const buscar = opcoes.buscar ?? ((id) => lerFicha(id));
  const ficha = await buscar(aberta.usuarioId);
  if (ficha === 'erro') return negado(503, 'fonte_indisponivel');
  const metodo = String(pedido.method || 'GET').toUpperCase();
  if (autorizarTabela(ficha, alvo.tabela, metodo) !== 'ok') return negado(403, 'sem_permissao');
  const chave = opcoes.chave ?? getSupabaseServiceRoleKey();
  if (!chave) return negado(503, 'fonte_indisponivel');
  const cabecalhos = new Headers();
  cabecalhos.set('apikey', chave);
  cabecalhos.set('authorization', `Bearer ${chave}`);
  for (const nome of CABECALHOS_UTEIS) {
    const valor = pedido.headers[nome] || pedido.headers[nome.toLowerCase()];
    if (valor) cabecalhos.set(nome, valor);
  }
  const encaminhar = opcoes.encaminhar ?? ((destino, init) => fetch(destino, init));
  const resposta = await encaminhar(alvo.destino, {
    method: metodo,
    headers: cabecalhos,
    body: metodo === 'GET' || metodo === 'HEAD' ? undefined : pedido.body,
  });
  return {
    status: resposta.status,
    body: await resposta.text(),
    contentType: resposta.headers.get('content-type') || 'application/json',
    contentRange: resposta.headers.get('content-range'),
  };
}

async function lerFicha(id: string): Promise<FichaServidor | null | 'erro'> {
  const chave = getSupabaseServiceRoleKey();
  if (!chave) return 'erro';
  const cliente = createClient(getSupabaseUrl(), chave);
  const { data, error } = await cliente
    .from('system_users')
    .select('id, status, permissions, client_id, profiles:profile_id ( name, permissions )')
    .eq('id', id)
    .maybeSingle();
  if (error) return 'erro';
  if (!data) return null;
  return fichaDe(data as Parameters<typeof fichaDe>[0]);
}
