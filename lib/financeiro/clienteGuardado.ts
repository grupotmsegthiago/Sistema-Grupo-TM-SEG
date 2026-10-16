/**
 * No navegador, missions não pede coluna financeira no Supabase.
 * O valor volta pela API, que confere a sessão e o perfil no cadastro.
 * Tabelas de preço não usam mais a chave anônima.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { ehTabelaConsultaFinanceira } from './consultaFinanceira';
import { reescreverSelectOs } from './colunasProtegidas';
import { aplicarPedidoTabela, pedidoTabelaVazio, type PedidoTabela } from './filtrarTabela';

type Linha = Record<string, unknown>;

function sessaoAtual(): { token: string; sessao: string } {
  if (typeof window === 'undefined') return { token: '', sessao: '' };
  return {
    token: window.localStorage.getItem('authToken') || '',
    sessao: window.localStorage.getItem('authSessao') || '',
  };
}

async function chamarApi(caminho: string, corpo: unknown): Promise<{ ok: boolean; status: number; body: any }> {
  const { token, sessao } = sessaoAtual();
  const resposta = await fetch(caminho, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token ? `Bearer ${token}` : '',
      'x-tmseg-sessao': sessao,
    },
    body: JSON.stringify(corpo),
  });
  const body = await resposta.json().catch(() => ({}));
  return { ok: resposta.ok, status: resposta.status, body };
}

function comoLista(data: unknown): { lista: Linha[]; unico: boolean } {
  if (Array.isArray(data)) return { lista: data as Linha[], unico: false };
  if (data && typeof data === 'object') return { lista: [data as Linha], unico: true };
  return { lista: [], unico: false };
}

async function completarValores(data: unknown): Promise<unknown> {
  const { lista, unico } = comoLista(data);
  const ids = [...new Set(lista.map((linha) => String(linha.id || '')).filter(Boolean))];
  if (ids.length === 0) return data;
  const porId = new Map<string, Linha>();
  for (let i = 0; i < ids.length; i += 400) {
    const lote = ids.slice(i, i + 400);
    const resposta = await chamarApi('/api/financeiro/os/valores', { ids: lote });
    if (!resposta.ok) return data;
    for (const linha of resposta.body?.linhas || []) {
      if (linha?.id) porId.set(String(linha.id), linha);
    }
  }
  const juntas = lista.map((linha) => ({ ...linha, ...(porId.get(String(linha.id || '')) || {}) }));
  return unico ? juntas[0] || data : juntas;
}

function envolverLeitura(filtro: any, hidratar: boolean) {
  if (!hidratar || typeof filtro?.then !== 'function') return filtro;
  const original = filtro.then.bind(filtro);
  filtro.then = (ok?: any, erro?: any) => original(async (resultado: any) => {
    if (resultado?.data) resultado.data = await completarValores(resultado.data);
    return ok ? ok(resultado) : resultado;
  }, erro);
  return filtro;
}

function protegerMissions(builder: any) {
  const selectOriginal = builder.select.bind(builder);
  const updateOriginal = builder.update.bind(builder);
  builder.select = (colunas?: string, opcoes?: { head?: boolean; count?: string }) => {
    const reescrito = reescreverSelectOs(colunas);
    const filtro = selectOriginal(reescrito.sql, opcoes);
    return envolverLeitura(filtro, reescrito.hidratar && !opcoes?.head);
  };
  builder.insert = (valores: unknown) => {
    const linhas = Array.isArray(valores) ? valores : [valores];
    return gravacaoOs('insert', linhas);
  };
  builder.update = (valores: Record<string, unknown>, opcoes?: unknown) => {
    const temProtegida = valores && typeof valores === 'object'
      && Object.keys(valores).some((chave) => [
        'revenue_value', 'cost_value', 'toll_value', 'toll_value_provider',
        'displacement_value', 'displacement_value_provider', 'snapshot_data',
        'parametros_edicao_total', 'revenue_edit_reason', 'cost_edit_reason',
        'billing_verified_by', 'snapshot_approved_by', 'snapshot_approved_at',
      ].includes(chave));
    if (!temProtegida) return updateOriginal(valores, opcoes);
    return gravacaoOs('update', valores);
  };
  return builder;
}

function gravacaoOs(modo: 'insert' | 'update', valores: unknown) {
  const filtros: { eq: Record<string, unknown>; inn: Record<string, unknown[]> } = { eq: {}, inn: {} };
  let uma = false;
  let talvez = false;
  const api: any = {
    eq(coluna: string, valor: unknown) {
      filtros.eq[coluna] = valor;
      return api;
    },
    in(coluna: string, valor: unknown[]) {
      filtros.inn[coluna] = valor;
      return api;
    },
    select() { return api; },
    single() { uma = true; return api; },
    maybeSingle() { uma = true; talvez = true; return api; },
    then(ok?: any, erro?: any) {
      return executar().then(ok, erro);
    },
  };
  async function executar() {
    if (modo === 'update' && filtros.eq.id == null && !filtros.inn.id) {
      return { data: null, error: { message: 'A gravação financeira precisa da OS.' } };
    }
    const resposta = await chamarApi('/api/financeiro/os/gravar', { modo, valores, filtros });
    if (!resposta.ok) {
      return { data: null, error: { message: resposta.body?.erro || 'A gravação financeira foi recusada.' } };
    }
    const linhas = Array.isArray(resposta.body?.linhas) ? resposta.body.linhas : [];
    if (!uma) return { data: linhas, error: null };
    if (!linhas[0] && !talvez) return { data: null, error: { message: 'A OS não voltou depois da gravação.' } };
    return { data: linhas[0] || null, error: null };
  }
  return api;
}

function guardarTabela(tabela: 'client_price_tables' | 'provider_cost_tables') {
  const pedido = pedidoTabelaVazio();
  let modo: 'select' | 'insert' | 'update' | 'delete' = 'select';
  let valores: unknown = null;
  const api: any = new Proxy({}, {
    get(_alvo, prop) {
      if (prop === 'then') {
        return (ok?: any, erro?: any) => executar().then(ok, erro);
      }
      if (typeof prop !== 'string') return undefined;
      return (...args: unknown[]) => {
        if (prop === 'select') {
          modo = 'select';
          const opcoes = args[1] as { head?: boolean } | undefined;
          pedido.soContagem = Boolean(opcoes?.head);
        } else if (prop === 'eq') pedido.filtros.push({ tipo: 'eq', coluna: String(args[0]), valor: args[1] });
        else if (prop === 'ilike') pedido.filtros.push({ tipo: 'ilike', coluna: String(args[0]), valor: args[1] });
        else if (prop === 'in') pedido.filtros.push({ tipo: 'in', coluna: String(args[0]), valor: args[1] });
        else if (prop === 'or') pedido.filtros.push({ tipo: 'or', valor: args[0] });
        else if (prop === 'order') {
          const opcoes = args[1] as { ascending?: boolean } | undefined;
          pedido.ordem.push({ coluna: String(args[0]), crescente: opcoes?.ascending !== false });
        } else if (prop === 'range') pedido.faixa = { de: Number(args[0]) || 0, ate: Number(args[1]) || 0 };
        else if (prop === 'single') pedido.uma = true;
        else if (prop === 'maybeSingle') { pedido.uma = true; pedido.talvez = true; }
        else if (prop === 'insert') { modo = 'insert'; valores = args[0]; }
        else if (prop === 'update') { modo = 'update'; valores = args[0]; }
        else if (prop === 'delete') modo = 'delete';
        return api;
      };
    },
  });
  async function executar() {
    if (modo === 'select') {
      const resposta = await chamarApi('/api/financeiro/tabelas/ler', { tabela });
      if (!resposta.ok) return { data: null, error: { message: resposta.body?.erro || 'Sem acesso à tabela.' }, count: null };
      const aplicado = aplicarPedidoTabela(resposta.body?.linhas || [], pedido);
      if (pedido.uma && !pedido.talvez && !aplicado.data) {
        return { data: null, error: { message: 'Nenhuma linha.' }, count: aplicado.count };
      }
      return { data: aplicado.data, error: null, count: aplicado.count };
    }
    const resposta = await chamarApi('/api/financeiro/tabelas/gravar', {
      tabela,
      modo,
      valores,
      filtros: pedido.filtros,
    });
    if (!resposta.ok) return { data: null, error: { message: resposta.body?.erro || 'A gravação da tabela foi recusada.' } };
    return { data: resposta.body?.linhas || null, error: null };
  }
  return api as PedidoTabela;
}

function guardarConsulta(tabela: string) {
  const passos: Array<{ m: string; args: unknown[] }> = [];
  const api: any = new Proxy({}, {
    get(_alvo, prop) {
      if (prop === 'then') return (ok?: any, erro?: any) => executar().then(ok, erro);
      if (typeof prop !== 'string') return undefined;
      return (...args: unknown[]) => {
        passos.push({ m: prop, args });
        return api;
      };
    },
  });
  async function executar() {
    const resposta = await chamarApi('/api/financeiro/consulta', { tabela, passos });
    if (!resposta.ok) {
      return { data: null, error: { message: resposta.body?.erro || 'A consulta financeira foi recusada.' }, count: null };
    }
    return {
      data: resposta.body?.data ?? null,
      error: resposta.body?.error || null,
      count: resposta.body?.count ?? null,
    };
  }
  return api;
}

export function protegerCliente<T extends SupabaseClient>(cliente: T): T {
  const original = cliente.from.bind(cliente);
  cliente.from = ((tabela: string) => {
    if (tabela === 'client_price_tables' || tabela === 'provider_cost_tables') return guardarTabela(tabela);
    if (tabela === 'missions') return protegerMissions(original('missions'));
    if (ehTabelaConsultaFinanceira(tabela)) return guardarConsulta(tabela);
    return original(tabela as never);
  }) as T['from'];
  return cliente;
}
