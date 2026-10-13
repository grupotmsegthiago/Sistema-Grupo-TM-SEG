/**
 * Troca o número da fatura de uma comissão TORRES e puxa de novo a fatura viva.
 * Serve quando a NF foi cancelada e outra foi emitida no lugar.
 * Não cria uma segunda comissão e não mexe em comissão já paga ou já lançada.
 */
import { calcularComissao } from './comissaoCalc.js';
import type { ComissaoDbClient } from './comissaoCore.js';
import { faturaCancelada } from './quadroFaturamentoComissao.js';
import { dataIsoCivil } from './rotaMissaoComissao.js';
import { faturaTorresPaga } from './sincronizarComissoesTorres.js';

export type FaturaTorresReligar = {
  id: string;
  nfseNumero: string | null;
  cliente: string | null;
  valor: number;
  status: string | null;
  paymentDate: string | null;
  dueDate: string | null;
};

export type MissaoFaturaTorres = {
  osId: string;
  osNumero: string | null;
  dataMissao: string | null;
};

export type PatchReligarFatura = {
  origem_fatura_id: string;
  fatura_numero: string;
  ordem_servico_id: string | null;
  cliente_nome: string | null;
  valor_faturamento: number;
  valor_base_liquida: number;
  valor_comissao: number;
  data_faturamento: string;
  status: 'AGUARDANDO_PAGAMENTO_CLIENTE' | 'LIBERADO_PARA_PAGAMENTO';
  data_recebimento_cliente: string | null;
};

export function normalizarNumeroFatura(raw: string | null | undefined): string {
  return String(raw || '')
    .trim()
    .replace(/^nf[\s:-]*/i, '')
    .replace(/^torres-inv-/i, '')
    .trim();
}

export function montarPatchReligarFatura(input: {
  statusAtual: string | null;
  contaPagarId?: string | null;
  percentualImposto: number;
  percentualComissao: number;
  dataAtual?: string | null;
  dataRecebimentoAtual?: string | null;
  fatura: FaturaTorresReligar;
  missoes: MissaoFaturaTorres[];
  outraComissaoId?: string | null;
}): { ok: true; patch: PatchReligarFatura; liberouAgora: boolean; osNumeros: string[] } | { ok: false; error: string } {
  if (String(input.statusAtual || '').toUpperCase() === 'PAGO') {
    return { ok: false, error: 'Comissão já paga. O número da fatura não muda.' };
  }
  if (String(input.contaPagarId || '').trim()) {
    return { ok: false, error: 'Esta comissão já foi lançada no Contas a Pagar. O número da fatura não muda.' };
  }
  if (input.outraComissaoId) {
    return { ok: false, error: `A fatura ${input.fatura.id} já está em outra comissão. Não criei outra linha.` };
  }
  if (faturaCancelada(input.fatura.status)) {
    return { ok: false, error: `A fatura ${input.fatura.id} também está cancelada na TORRES.` };
  }
  const calc = calcularComissao(
    Number(input.fatura.valor) || 0,
    Number(input.percentualImposto),
    Number(input.percentualComissao),
  );
  const datas = input.missoes
    .map((missao) => dataIsoCivil(missao.dataMissao))
    .filter((data): data is string => !!data)
    .sort();
  const dataFaturamento = datas[0] || dataIsoCivil(input.dataAtual) || dataIsoCivil(input.fatura.dueDate) || '';
  if (!dataFaturamento) return { ok: false, error: 'A fatura da TORRES não tem data da missão nem data de vencimento.' };
  const paga = faturaTorresPaga({ status: input.fatura.status, paymentDate: input.fatura.paymentDate });
  const status = paga ? 'LIBERADO_PARA_PAGAMENTO' : 'AGUARDANDO_PAGAMENTO_CLIENTE';
  const jaLiberada = String(input.statusAtual || '').toUpperCase() === 'LIBERADO_PARA_PAGAMENTO';
  const recebimento = paga
    ? (dataIsoCivil(input.fatura.paymentDate) || dataIsoCivil(input.dataRecebimentoAtual))
    : null;
  const os = input.missoes.find((missao) => String(missao.osId || '').trim());
  return {
    ok: true,
    liberouAgora: paga && !jaLiberada,
    osNumeros: input.missoes.map((missao) => missao.osNumero || missao.osId).filter(Boolean),
    patch: {
      origem_fatura_id: input.fatura.id,
      fatura_numero: input.fatura.id,
      ordem_servico_id: os ? String(os.osId) : null,
      cliente_nome: String(input.fatura.cliente || '').trim() || null,
      valor_faturamento: calc.valorFaturamento,
      valor_base_liquida: calc.valorBaseLiquida,
      valor_comissao: calc.valorComissao,
      data_faturamento: dataFaturamento,
      status,
      data_recebimento_cliente: recebimento,
    },
  };
}

type LinhaComissao = {
  id: string;
  status?: string | null;
  empresa_origem?: string | null;
  conta_pagar_id?: string | null;
  percentual_imposto_aplicado?: number | null;
  percentual_comissao_aplicado?: number | null;
  data_faturamento?: string | null;
  data_recebimento_cliente?: string | null;
  cliente_nome?: string | null;
};

function primeiraLinha<T>(data: T | T[] | null | undefined): T | null {
  if (Array.isArray(data)) return data[0] || null;
  return data || null;
}

async function acharFatura(sb: ComissaoDbClient, numero: string): Promise<{ fatura: FaturaTorresReligar | null; error?: string }> {
  const colunas = 'id, client_name, value, status, due_date, payment_date, nfse_number';
  if (/^\d+$/.test(numero)) {
    const porId = await sb.from('invoices').select(colunas).eq('id', Number(numero)).maybeSingle();
    if (porId.error) return { fatura: null, error: porId.error.message };
    const linha = primeiraLinha(porId.data);
    if (linha?.id != null) return { fatura: mapearFatura(linha) };
  }
  const porNf = await sb.from('invoices').select(colunas).eq('nfse_number', numero).limit(2);
  if (porNf.error) return { fatura: null, error: porNf.error.message };
  const lista = Array.isArray(porNf.data) ? porNf.data : [];
  if (lista.length > 1) {
    return { fatura: null, error: `Há mais de uma NF ${numero} na TORRES. Use o número interno da fatura.` };
  }
  if (!lista.length) return { fatura: null };
  return { fatura: mapearFatura(lista[0]) };
}

function mapearFatura(row: {
  id?: string | number | null;
  client_name?: string | null;
  value?: number | string | null;
  status?: string | null;
  due_date?: string | null;
  payment_date?: string | null;
  nfse_number?: string | null;
}): FaturaTorresReligar {
  return {
    id: String(row.id),
    nfseNumero: String(row.nfse_number || '').trim() || null,
    cliente: row.client_name || null,
    valor: Number(row.value) || 0,
    status: row.status || null,
    paymentDate: row.payment_date || null,
    dueDate: row.due_date || null,
  };
}

export async function executarReligarFaturaTorres(
  sbTm: ComissaoDbClient,
  sbTorres: ComissaoDbClient | null,
  input: { comissaoId?: string | null; faturaNumero?: string | null },
): Promise<{
  ok: boolean;
  error?: string;
  id?: string;
  liberouAgora?: boolean;
  mensagem?: string;
  patch?: PatchReligarFatura;
}> {
  const comissaoId = String(input.comissaoId || '').trim();
  const numero = normalizarNumeroFatura(input.faturaNumero);
  if (!comissaoId || !numero) return { ok: false, error: 'Informe a comissão e o número da fatura.' };
  if (!sbTorres) return { ok: false, error: 'A TORRES não está ligada neste computador.' };

  const atual = await sbTm
    .from('comissoes')
    .select('id, status, empresa_origem, conta_pagar_id, percentual_imposto_aplicado, percentual_comissao_aplicado, data_faturamento, data_recebimento_cliente, cliente_nome')
    .eq('id', comissaoId)
    .maybeSingle();
  if (atual.error) return { ok: false, error: atual.error.message };
  const row = primeiraLinha(atual.data) as LinhaComissao | null;
  if (!row?.id) return { ok: false, error: 'Comissão não encontrada.' };
  if (String(row.empresa_origem || '').toUpperCase() !== 'TORRES') {
    return { ok: false, error: 'Só a fatura da TORRES pode ser trocada por aqui.' };
  }

  const busca = await acharFatura(sbTorres, numero);
  if (busca.error) return { ok: false, error: busca.error };
  if (!busca.fatura) return { ok: false, error: `Não achei a fatura ${numero} na TORRES.` };

  const outras = await sbTm
    .from('comissoes')
    .select('id')
    .eq('empresa_origem', 'TORRES')
    .eq('origem_fatura_id', busca.fatura.id)
    .neq('id', row.id)
    .limit(1);
  if (outras.error) return { ok: false, error: outras.error.message };
  const outra = primeiraLinha(outras.data) as { id?: string } | null;

  const bills = await sbTorres
    .from('escort_billings')
    .select('service_order_id, data_missao, os_number')
    .eq('invoice_id', Number(busca.fatura.id));
  if (bills.error) return { ok: false, error: bills.error.message };
  const itens = (Array.isArray(bills.data) ? bills.data : []) as Array<{
    service_order_id?: number | string | null;
    data_missao?: string | null;
    os_number?: string | null;
  }>;
  const osIds = [...new Set(itens.map((item) => String(item.service_order_id || '').trim()).filter(Boolean))];
  const nomes = new Map<string, string>();
  if (osIds.length) {
    const os = await sbTorres.from('service_orders').select('id, os_number').in('id', osIds.map((id) => Number(id)));
    if (!os.error) {
      for (const linha of (Array.isArray(os.data) ? os.data : []) as Array<{ id?: number | string; os_number?: string | null }>) {
        const nome = String(linha.os_number || '').trim();
        if (linha.id != null && nome) nomes.set(String(linha.id), nome);
      }
    }
  }
  const missoes: MissaoFaturaTorres[] = itens
    .map((item) => {
      const osId = String(item.service_order_id || '').trim();
      if (!osId) return null;
      return {
        osId,
        osNumero: nomes.get(osId) || String(item.os_number || '').trim() || null,
        dataMissao: item.data_missao || null,
      };
    })
    .filter((item): item is MissaoFaturaTorres => !!item);

  const plano = montarPatchReligarFatura({
    statusAtual: row.status || null,
    contaPagarId: row.conta_pagar_id,
    percentualImposto: Number(row.percentual_imposto_aplicado) > 0 ? Number(row.percentual_imposto_aplicado) : 16,
    percentualComissao: Number(row.percentual_comissao_aplicado) > 0 ? Number(row.percentual_comissao_aplicado) : 3,
    dataAtual: row.data_faturamento,
    dataRecebimentoAtual: row.data_recebimento_cliente,
    fatura: busca.fatura,
    missoes,
    outraComissaoId: outra?.id || null,
  });
  if (!plano.ok) return { ok: false, error: plano.error };

  const gravou = await sbTm.from('comissoes').update(plano.patch).eq('id', row.id).select('id');
  if (gravou.error) return { ok: false, error: gravou.error.message };
  const nf = busca.fatura.nfseNumero ? ` NF ${busca.fatura.nfseNumero}` : '';
  const osTexto = plano.osNumeros.length ? ` OS ${plano.osNumeros.join(', ')}.` : '';
  return {
    ok: true,
    id: row.id,
    liberouAgora: plano.liberouAgora,
    patch: plano.patch,
    mensagem: `Fatura ${busca.fatura.id}${nf} puxada da TORRES.${osTexto}`,
  };
}

export async function tratarPedidoReligarFaturaTorres(
  req: { method?: string; body?: { id?: string; faturaNumero?: string }; headers?: Record<string, string | string[] | undefined> },
  res: { status: (code: number) => { json: (body: unknown) => void } },
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }
  try {
    const { assertComissoesQuadroAccess } = await import('./comissaoQuadroAuth.js');
    const access = await assertComissoesQuadroAccess(req);
    if (!access.ok) {
      res.status(access.status).json({ ok: false, error: access.error });
      return;
    }
    if (!access.podeEscrever) {
      res.status(403).json({ ok: false, error: 'Permissão negada' });
      return;
    }
    const { createSupabaseAdminClient } = await import('../supabaseAdmin.js');
    const { createTorresAdminClient } = await import('./torresSupabase.js');
    const sb = createSupabaseAdminClient();
    if (!sb) {
      res.status(500).json({ ok: false, error: 'supabase_unavailable' });
      return;
    }
    const result = await executarReligarFaturaTorres(sb, createTorresAdminClient(), {
      comissaoId: req.body?.id,
      faturaNumero: req.body?.faturaNumero,
    });
    if (result.ok && result.liberouAgora && result.id) {
      const { instalarAvisoComissaoLiberada, enviarLiberacaoPorIds } = await import('./enviarAvisoComissaoLiberada.js');
      instalarAvisoComissaoLiberada();
      await enviarLiberacaoPorIds(sb, [result.id]);
    }
    res.status(200).json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[comissao] religar fatura TORRES:', message);
    res.status(200).json({ ok: false, error: message });
  }
}
