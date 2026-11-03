/**
 * Consulta somente leitura dos lançamentos da evidência histórica.
 * Usa o mesmo cliente já usado pelo Gestor Fiscal. Não cria rota e não grava.
 */
import { supabase } from '../supabase';
import { fetchAllPages } from '../supabasePaging';
import { TMSEG_SUPABASE_PROJECT_REF } from '../supabaseDefaults';
import { AUDITORIA_CLASSE_A, conciliarLancamentos, mascararDescricao, type LeituraLancamento } from './lancamentosHomologacao';

const INICIO = '2026-01-01';
const FIM = '2026-10-31';
const COLUNAS = 'id, description, notes, amount, status, due_date, payment_date, category_id, entity_type, doc_nf_status, account_id';

type Linha = Record<string, unknown>;

function texto(v: unknown): string {
  return String(v ?? '').trim();
}

function centavos(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function norm(v: string): string {
  return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

function contaExata(nome: string): string {
  const n = norm(nome);
  if (n === 'TM SEGURANCA' || n === 'TM SECURITY' || n === 'TM GESTAO') return n;
  return '';
}

async function paginar(tabela: string, aplicar: (q: any) => any): Promise<Linha[]> {
  const { rows, complete } = await fetchAllPages<Linha>(async (from, size) => {
    const res = await aplicar(supabase.from(tabela)).order('id', { ascending: true }).range(from, from + size - 1);
    return { data: res.data as Linha[] | null, error: res.error, count: res.count };
  }, 1000, 50_000, {
    getRowKey: (row) => {
      const id = texto(row.id);
      if (!id) throw new Error(`Registro de ${tabela} sem id. A consulta parou.`);
      return id;
    },
  });
  if (!complete) throw new Error(`Consulta de ${tabela} incompleta. Nenhum lançamento parcial foi usado.`);
  return rows;
}

function leituraDe(row: Linha, categoria: string, conta: string): LeituraLancamento {
  const status = texto(row.status);
  return {
    id: texto(row.id),
    valorCentavos: centavos(row.amount),
    categoria,
    contaPagadora: conta,
    vencimento: texto(row.due_date).slice(0, 10),
    pagamento: texto(row.payment_date).slice(0, 10),
    documento: texto(row.doc_nf_status) || '(vazio)',
    descricaoMascarada: mascararDescricao(`${texto(row.description)} ${texto(row.notes)}`),
    status,
    cancelado: status.toUpperCase() === 'CANCELLED',
  };
}

export async function consultarLancamentosAuditados() {
  const url = String((supabase as { supabaseUrl?: string }).supabaseUrl || '');
  if (!url.includes(TMSEG_SUPABASE_PROJECT_REF) || url.includes('erjhxwbutjyylxdthuuz')) {
    throw new Error('A consulta não está no projeto da TM SEG.');
  }
  const categorias = await paginar('financial_categories', (q) => q.select('id, name, tag'));
  const catPorId = new Map(categorias.map((c) => [texto(c.id), c]));
  const contas = await paginar('financial_accounts', (q) => q.select('id, name'));
  const contaPorId = new Map(contas.map((c) => [texto(c.id), texto(c.name)]));
  const transacoes = await paginar('financial_transactions', (q) => q.select(COLUNAS).eq('type', 'EXPENSE').gte('due_date', INICIO).lte('due_date', FIM));
  const porId = new Map(transacoes.map((row) => [texto(row.id), row]));
  const faltantes = AUDITORIA_CLASSE_A.map((item) => item.id).filter((id) => !porId.has(id));
  for (let i = 0; i < faltantes.length; i += 100) {
    const lote = faltantes.slice(i, i + 100);
    const res = await supabase.from('financial_transactions').select(COLUNAS).in('id', lote);
    if (res.error) throw new Error(res.error.message);
    for (const row of (res.data || []) as Linha[]) porId.set(texto(row.id), row);
  }
  const leituras = AUDITORIA_CLASSE_A.map((item) => {
    const row = porId.get(item.id);
    if (!row) return null;
    const cat = catPorId.get(texto(row.category_id));
    return leituraDe(row, texto(cat?.name), contaPorId.get(texto(row.account_id)) || '');
  }).filter((item): item is LeituraLancamento => item !== null);

  const conhecidos = new Set(AUDITORIA_CLASSE_A.map((item) => item.id));
  const extras = transacoes.flatMap((row) => {
    const id = texto(row.id);
    if (conhecidos.has(id) || texto(row.status).toUpperCase() === 'CANCELLED') return [];
    const conta = contaPorId.get(texto(row.account_id)) || '';
    if (!contaExata(conta)) return [];
    const cat = catPorId.get(texto(row.category_id));
    const nome = texto(cat?.name);
    const tag = norm(texto(cat?.tag));
    const n = norm(nome);
    if (!n || n.startsWith('FORNECEDOR') || n.includes('INVESTIMENTO') || n.includes('TRANSFER') || tag === 'IMPOSTO' || n.includes('IMPOSTO') || n.includes('TRIBUTO')) return [];
    const blob = norm(`${texto(row.description)} ${texto(row.notes)}`);
    const classeA = (nome === 'SALÁRIO' && /SALARIO|FERIAS|RESCIS|ADIANT|DECIMO|FGTS|FOLHA|FUNCIONAR|QUITACAO/.test(blob))
      || (nome === 'PESSOAL PF' && /SALARIO|FERIAS|RESCIS|ADIANT|DECIMO|FGTS|FOLHA|FUNCIONAR|QUITACAO/.test(blob))
      || (nome === 'COMISSÃO' && /COMISSAO/.test(blob) && !/\bBONUS\b|\bPREMIO\b/.test(blob))
      || (nome === 'BONUS' && /\bBONUS\b|\bPREMIO\b/.test(blob))
      || (nome === 'CONTABILIDADE' && /CONTABIL|HONORAR|ESCRITOR/.test(blob) && !/\bDAS\b/.test(blob))
      || (['PENSÃO', 'MENSALIDADE', 'CONSUMO', 'CESTA BÁSICA', 'VIVO', 'VT', 'SEGURO', 'TARIFAS', 'ADVOGADO'].includes(nome) && blob.length >= 3 && !/\bDAS\b|INVESTIMENTO|APARTAMENTO|\bCARRO\b|CONSORCIO|FINANCIAMENTO/.test(blob));
    if (!classeA) return [];
    return [leituraDe(row, nome, conta)];
  });

  return {
    ...conciliarLancamentos([...leituras, ...extras]),
    lidoEm: new Date().toISOString(),
    origem: 'financial_transactions, somente leitura, evidência histórica de 19/10/2026',
  };
}
