import { colunaRegionalAusente } from '../precificacao/tabela2027.js';
import { cartaDaProposta, marcoDeOperacoes } from './apresentacao.js';
import { consultaDoCliente, montarProposta, tabelaDeLinha, valoresDaRegiao, type PropostaPortal, type TabelaCotacao } from './cotacao.js';
import {
  JANELA_HISTORICO_VIGENCIA,
  TAMANHO_PAGINA_HISTORICO,
  normalizarLinhaHistorico,
  pedidoParaRegistro,
  reservarNumeroCotacao,
  vigenciaDaCotacao,
  type LinhaHistoricoCotacao,
  type PedidoRegistroCotacao,
} from './historicoCotacoes.js';
import { cotacaoExcluida } from './gestaoCotacao.js';
import type { VersaoTabelaRegional } from '../precificacao/tabela2027.js';

type ClientePortal = { name?: string | null; trading_name?: string | null } | null;

type Resposta = { status: number; corpo: { tabelas: TabelaCotacao[]; operacoes: string | null } | { error: string } };

export async function rotuloDeOperacoes(sb: { from: (tabela: string) => any }): Promise<string | null> {
  const { count, error } = await sb.from('missions').select('id', { count: 'exact', head: true });
  if (error || typeof count !== 'number') return null;
  return marcoDeOperacoes(count);
}

export async function listarTabelasCotacao(
  sb: { from: (tabela: string) => any },
  cliente: ClientePortal,
): Promise<Resposta> {
  const nomes = [...new Set(
    [cliente?.name, cliente?.trading_name].map((nome) => String(nome || '').trim()).filter(Boolean),
  )];
  if (!nomes.length) return { status: 503, corpo: { error: 'Cliente do portal não encontrado.' } };

  const { data, error } = await sb
    .from('client_price_tables')
    .select('id, operation_type, activation_fee, franchise_hours, franchise_km, price_per_extra_km, price_per_extra_hour')
    .or(nomes.map((nome) => consultaDoCliente(nome)).join(','));
  if (error) return { status: 500, corpo: { error: 'Não foi possível ler a tabela do cliente.' } };

  const tabelas = ((data || []) as Parameters<typeof tabelaDeLinha>[0][])
    .map((row) => tabelaDeLinha(row))
    .filter((row): row is TabelaCotacao => row != null)
    .sort((a, b) => a.operacao.localeCompare(b.operacao, 'pt-BR'));
  const operacoes = await rotuloDeOperacoes(sb);
  return { status: 200, corpo: { tabelas, operacoes } };
}

function numero(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function emailValido(valor: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
}

async function tabelasDoCliente(sb: { from: (tabela: string) => any }, cliente: ClientePortal): Promise<TabelaCotacao[] | { error: string; status: number }> {
  const lista = await listarTabelasCotacao(sb, cliente);
  if ('error' in lista.corpo) return { error: lista.corpo.error, status: lista.status };
  return lista.corpo.tabelas;
}

export function montarPropostaDoPedido(
  tabelas: TabelaCotacao[],
  pedido: { regiao?: unknown; origem?: unknown; destino?: unknown; paradas?: unknown; km?: unknown },
): PropostaPortal | { error: string } {
  const regiao = String(pedido.regiao || '').trim();
  const origem = String(pedido.origem || '').trim();
  const destino = String(pedido.destino || '').trim();
  const paradas = Array.isArray(pedido.paradas) ? pedido.paradas.map((item) => String(item || '')) : [];
  const km = numero(pedido.km);
  const tabelaRegiao = valoresDaRegiao(tabelas.filter((item) => item.regiao === regiao));
  if (!regiao || !origem || !destino || !tabelaRegiao || km <= 0) return { error: 'Faltam região, origem, destino ou a rota.' };
  return montarProposta({ tabelas, regiao, origem, destino, paradas, kmRota: km, tabelaRegiao });
}

export function textoDaProposta(proposta: PropostaPortal, operacoes?: string | null): string {
  return cartaDaProposta(proposta, operacoes);
}

export async function salvarPropostaPortal(
  sb: { from: (tabela: string) => any },
  cliente: ClientePortal,
  pedido: { regiao?: unknown; origem?: unknown; destino?: unknown; paradas?: unknown; km?: unknown },
): Promise<{ status: number; corpo: { ok: true; operacao: string } | { error: string } }> {
  const tabelas = await tabelasDoCliente(sb, cliente);
  if (!Array.isArray(tabelas)) return { status: tabelas.status, corpo: { error: tabelas.error } };
  const proposta = montarPropostaDoPedido(tabelas, pedido);
  if ('error' in proposta) return { status: 400, corpo: proposta };
  if (proposta.acordada) return { status: 409, corpo: { error: 'Essa rota já está acordada na tabela do cliente.' } };
  const regiao = valoresDaRegiao(tabelas.filter((item) => item.regiao === proposta.regiao));
  const nomeCliente = String(cliente?.name || '').trim();
  const { error } = await sb.from('client_price_tables').insert({
    client: nomeCliente,
    operation_type: proposta.operacao,
    activation_fee: proposta.acionamento,
    franchise_km: proposta.kmFranquia,
    franchise_hours: proposta.horasFranquia,
    price_per_extra_km: regiao?.kmExtra || 0,
    price_per_extra_hour: regiao?.horaExtra || 0,
  });
  if (error) return { status: 500, corpo: { error: 'Não foi possível gravar a proposta na tabela do cliente.' } };
  return { status: 200, corpo: { ok: true, operacao: proposta.operacao } };
}

const COLUNAS_HISTORICO = 'id, client_id, client_name, origin, destination, total_km, total_hours, total_value, created_at, created_by, status, is_active, converted_to_order_id, contract_details';

export async function listarHistoricoCotacoes(
  sb: { from: (tabela: string) => any },
  cliente: { id?: unknown; name?: string | null } | null,
  pagina = 0,
  vigencia?: VersaoTabelaRegional | null,
): Promise<{ status: number; corpo: { cotacoes: LinhaHistoricoCotacao[]; temMais: boolean; aviso?: string } | { error: string } }> {
  const idCliente = Number(cliente?.id);
  if (!Number.isFinite(idCliente) || idCliente <= 0) return { status: 503, corpo: { error: 'Cliente do portal não encontrado.' } };
  const inicio = Math.max(0, Math.floor(Number(pagina) || 0)) * TAMANHO_PAGINA_HISTORICO;
  const faixa = vigencia === '2026' || vigencia === '2027'
    ? { de: 0, ate: JANELA_HISTORICO_VIGENCIA - 1 }
    : { de: inicio, ate: inicio + TAMANHO_PAGINA_HISTORICO - 1 };
  const { data, error } = await sb
    .from('quotes')
    .select(COLUNAS_HISTORICO)
    .eq('client_id', idCliente)
    .order('created_at', { ascending: false })
    .range(faixa.de, faixa.ate);
  if (error) {
    if (colunaRegionalAusente(error)) {
      return { status: 200, corpo: { cotacoes: [], temMais: false, aviso: 'O histórico de cotações ainda não está disponível neste banco.' } };
    }
    return { status: 500, corpo: { error: 'Não foi possível ler o histórico de cotações.' } };
  }
  const lidas = ((data || []) as Record<string, unknown>[])
    .map((row) => normalizarLinhaHistorico(row))
    .filter((linha) => !cotacaoExcluida(linha));
  const linhas = vigencia === '2026' || vigencia === '2027'
    ? lidas.filter((linha) => vigenciaDaCotacao(linha) === vigencia)
    : lidas;
  const paginaLinhas = vigencia === '2026' || vigencia === '2027'
    ? linhas.slice(inicio, inicio + TAMANHO_PAGINA_HISTORICO)
    : linhas;
  const temMais = vigencia === '2026' || vigencia === '2027'
    ? linhas.length > inicio + TAMANHO_PAGINA_HISTORICO
    : linhas.length === TAMANHO_PAGINA_HISTORICO;
  return { status: 200, corpo: { cotacoes: paginaLinhas, temMais } };
}

export async function registrarCotacaoPortal(
  sb: { from: (tabela: string) => any },
  cliente: { id?: unknown; name?: string | null } | null,
  solicitante: { name?: string | null; email?: string | null },
  pedido: PedidoRegistroCotacao,
): Promise<{ status: number; corpo: { ok: true; id: string; created_at: string | null; numero: number | null } | { error: string } }> {
  const numero = await reservarNumeroCotacao(async (inicio, fim) => {
    const { data, error } = await sb.from('quotes').select('id, contract_details').order('created_at', { ascending: true }).range(inicio, fim);
    if (error) return null;
    return { linhas: Array.isArray(data) ? data : [] };
  });
  const registro = pedidoParaRegistro({ ...pedido, numero }, cliente || {}, solicitante);
  if (!registro.ok) return { status: 400, corpo: { error: registro.error } };
  const { data, error } = await sb.from('quotes').insert(registro.linha).select('id, created_at').single();
  if (error) {
    if (colunaRegionalAusente(error)) return { status: 503, corpo: { error: 'O histórico de cotações ainda não está disponível neste banco.' } };
    return { status: 500, corpo: { error: 'Não foi possível gravar a cotação no histórico.' } };
  }
  return { status: 201, corpo: { ok: true, id: String(data?.id || ''), created_at: data?.created_at ? String(data.created_at) : null, numero } };
}

export async function propostaParaEmail(
  sb: { from: (tabela: string) => any },
  cliente: ClientePortal,
  pedido: { para?: unknown; regiao?: unknown; origem?: unknown; destino?: unknown; paradas?: unknown; km?: unknown },
): Promise<{ status: number; corpo: { error: string } | { ok: true; para: string; assunto: string; texto: string } }> {
  const para = String(pedido.para || '').trim().toLowerCase();
  if (!emailValido(para)) return { status: 400, corpo: { error: 'Informe um e-mail válido.' } };
  const tabelas = await tabelasDoCliente(sb, cliente);
  if (!Array.isArray(tabelas)) return { status: tabelas.status, corpo: { error: tabelas.error } };
  const proposta = montarPropostaDoPedido(tabelas, pedido);
  if ('error' in proposta) return { status: 400, corpo: proposta };
  return {
    status: 200,
    corpo: {
      ok: true,
      para,
      assunto: `Proposta Grupo TM SEG — ${proposta.operacao}`,
      texto: textoDaProposta(proposta, await rotuloDeOperacoes(sb)),
    },
  };
}
