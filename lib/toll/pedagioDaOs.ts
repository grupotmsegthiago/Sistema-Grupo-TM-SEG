/**
 * Pedágio desta OS: histórico próprio, reedição depois da aprovação
 * e ocorrência gravada na mesma OS. Não consulta outras missões.
 */

export type LinhaHistoricoPedagio = {
  quando: string;
  quem: string;
  texto: string;
};

export type LogPedagioOs = {
  created_at?: string | null;
  user_name?: string | null;
  action_type?: string | null;
  entity?: string | null;
  details?: unknown;
};

export function pedagioAlterado(antes: number, depois: number): boolean {
  return Math.abs((Number(antes) || 0) - (Number(depois) || 0)) > 0.009;
}

export function dinheiroPedagio(valor: number): string {
  return (Number(valor) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function lerDetalhe(details: unknown): Record<string, unknown> {
  if (!details) return {};
  if (typeof details === 'object') return details as Record<string, unknown>;
  try {
    const parsed = JSON.parse(String(details));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Linhas de pedágio do cliente e do fornecedor, só dos logs desta OS. */
export function linhasHistoricoPedagioDaOs(logs: LogPedagioOs[] | null | undefined): LinhaHistoricoPedagio[] {
  const saida: LinhaHistoricoPedagio[] = [];
  for (const row of logs || []) {
    const detalhe = lerDetalhe(row.details);
    const quem = String(row.user_name || detalhe.user || '—');
    const quando = String(row.created_at || detalhe.date || detalhe.confirmed_at || '');
    const mudancas = Array.isArray(detalhe.changes) ? detalhe.changes : [];
    for (const linha of mudancas) {
      const texto = String(linha || '').trim();
      if (/ped[aá]gio/i.test(texto)) saida.push({ quando, quem, texto });
    }
    if (row.entity === 'MissionTollConfirmation' || row.action_type === 'TOLL_CONFIRMATION') {
      const semPedagio = detalhe.has_toll === false;
      const texto = semPedagio
        ? 'Confirmação: sem pedágio'
        : `Confirmação do pedágio: R$ ${dinheiroPedagio(Number(detalhe.value ?? 0))}`;
      saida.push({ quando, quem, texto });
    }
  }
  return saida;
}

export async function buscarHistoricoPedagioDaOs(
  client: { from: (tabela: string) => any },
  missionId: string,
): Promise<LinhaHistoricoPedagio[]> {
  const { data, error } = await client
    .from('system_logs')
    .select('created_at, user_name, action_type, entity, details')
    .eq('entity_id', missionId)
    .in('entity', ['MissionEditHistory', 'MissionTollConfirmation'])
    .order('created_at', { ascending: false })
    .limit(80);
  if (error) throw error;
  return linhasHistoricoPedagioDaOs(data || []);
}

export function textoOcorrenciaPedagioAprovado(input: {
  quem: string;
  clienteDe: number;
  clientePara: number;
  fornecedorDe: number;
  fornecedorPara: number;
}): string {
  return [
    `Pedágio alterado depois da aprovação financeira por ${input.quem}.`,
    `Cliente: de R$ ${dinheiroPedagio(input.clienteDe)} para R$ ${dinheiroPedagio(input.clientePara)}.`,
    `Fornecedor: de R$ ${dinheiroPedagio(input.fornecedorDe)} para R$ ${dinheiroPedagio(input.fornecedorPara)}.`,
  ].join(' ');
}

type GravacaoOcorrencia = {
  from: (tabela: string) => any;
};

export function textoOcorrenciaFornecedorAusenteParaZero(input: {
  quem: string;
  clienteAntes: number;
  clienteDepois: number;
  fornecedorAntes: number;
  lucroAntes: number;
  lucroDepois: number;
}): string {
  return [
    `Pedágio do fornecedor informado como zero por ${input.quem}.`,
    `O fornecedor estava ausente. A leitura histórica era R$ ${dinheiroPedagio(input.fornecedorAntes)}.`,
    'O valor gravado agora é R$ 0,00.',
    `Pedágio cobrável: de R$ ${dinheiroPedagio(input.clienteAntes)} para R$ ${dinheiroPedagio(input.clienteDepois)}.`,
    `Lucro do pedágio: de R$ ${dinheiroPedagio(input.lucroAntes)} para R$ ${dinheiroPedagio(input.lucroDepois)}.`,
  ].join(' ');
}

export async function gravarOcorrenciaFornecedorAusenteParaZero(
  client: GravacaoOcorrencia,
  input: {
    missionId: string;
    quem: string;
    impacto: {
      clienteAntes: number;
      clienteDepois: number;
      fornecedorAntes: number;
      lucroAntes: number;
      lucroDepois: number;
    };
  },
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const description = textoOcorrenciaFornecedorAusenteParaZero({ quem: input.quem, ...input.impacto });
  const { error: insertError } = await client.from('mission_occurrences').insert([{
    mission_id: input.missionId,
    description,
    evidence_url: null,
    created_by: input.quem,
  }]);
  if (insertError) {
    return { ok: false, erro: insertError.message || 'Não foi possível gravar a ocorrência do pedágio nesta OS.' };
  }
  await client.from('system_logs').insert([{
    user_name: input.quem,
    action_type: 'OTHER',
    entity: 'MissionOccurrence',
    entity_id: input.missionId,
    details: JSON.stringify({
      texto: description,
      fornecedorAntes: 'ausente',
      fornecedorDepois: 0,
      clienteAntes: input.impacto.clienteAntes,
      clienteDepois: input.impacto.clienteDepois,
      lucroAntes: input.impacto.lucroAntes,
      lucroDepois: input.impacto.lucroDepois,
    }),
  }]);
  return { ok: true };
}

export async function gravarOcorrenciaPedagioAprovado(
  client: GravacaoOcorrencia,
  input: {
    missionId: string;
    quem: string;
    clienteDe: number;
    clientePara: number;
    fornecedorDe: number;
    fornecedorPara: number;
  },
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const description = textoOcorrenciaPedagioAprovado(input);
  const { error: insertError } = await client.from('mission_occurrences').insert([{
    mission_id: input.missionId,
    description,
    evidence_url: null,
    created_by: input.quem,
  }]);
  if (insertError) {
    return { ok: false, erro: insertError.message || 'Não foi possível gravar a ocorrência do pedágio nesta OS.' };
  }

  const contagem = await client
    .from('mission_occurrences')
    .select('id', { count: 'exact', head: true })
    .eq('mission_id', input.missionId)
    .is('resolved_at', null);
  if (!contagem?.error) {
    await client.from('missions').update({ occurrence_count: contagem.count || 0 }).eq('id', input.missionId);
  }

  await client.from('system_logs').insert([{
    user_name: input.quem,
    action_type: 'OTHER',
    entity: 'MissionOccurrence',
    entity_id: input.missionId,
    details: JSON.stringify({
      texto: description,
      aviso: 'Pedágio alterado depois da aprovação financeira.',
    }),
  }]);
  return { ok: true };
}

export async function senhaDoUsuarioConfere(
  _client: GravacaoOcorrencia,
  usuario: { id?: string | number | null; email?: string | null },
  senha: string,
  confirmar: (usuarioId: string | null, email: string, senha: string) => Promise<boolean> = confirmarSenhaNoServidor,
): Promise<boolean> {
  const limpa = String(senha || '').trim();
  if (!limpa) return false;
  const id = usuario?.id == null || usuario.id === '' ? null : String(usuario.id);
  const email = String(usuario?.email || '').trim();
  if (!id && !email) return false;
  return confirmar(id, email, limpa);
}

async function confirmarSenhaNoServidor(usuarioId: string | null, email: string, senha: string): Promise<boolean> {
  try {
    const token = globalThis.localStorage?.getItem('authToken') || '';
    const resposta = await fetch('/api/ponte-auth/confirmar-senha', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', authorization: token ? `Bearer ${token}` : '' },
      body: JSON.stringify({ senha, usuarioId, email }),
    });
    if (!resposta.ok) return false;
    const corpo = await resposta.json() as { ok?: boolean };
    return corpo.ok === true;
  } catch {
    return false;
  }
}
