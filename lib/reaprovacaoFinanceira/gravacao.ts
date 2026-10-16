/**
 * Gravação da reaprovação. O banco guarda referência e histórico.
 * A imagem vai para o bucket privado, nunca para a coluna da OS.
 */
import type { EntradaAtomica, EntradaEdicaoTotal, ResultadoAtomico } from './transacao';
import type { EventoReaprovacao, NotificacaoDiretoria, OsReaprovacao } from './tipos';

export const BUCKET_REAPROVACAO = 'reaprovacao-financeira';

type ErroBanco = { code?: string; message?: string } | null | undefined;

export function classificarErroGravacao(error: ErroBanco): string | null {
  if (!error) return null;
  const msg = String(error.message || '');
  if (
    error.code === '42P01'
    || error.code === 'PGRST205'
    || /does not exist|schema cache|relation .* does not exist/i.test(msg)
  ) {
    return 'A tabela de reaprovação ainda não foi implantada. A conclusão foi impedida.';
  }
  if (/bucket not found|bucket .* not found/i.test(msg)) {
    return 'O armazenamento privado da reaprovação ainda não foi implantado. A conclusão foi impedida.';
  }
  if (/editar_os_total_financeira/i.test(msg)) {
    return 'A função de edição total ainda não foi implantada. A conclusão foi impedida.';
  }
  if (error.code === 'PGRST202' || /reaprovar_os_financeira/i.test(msg)) {
    return 'A função de reaprovação ainda não foi implantada. A conclusão foi impedida.';
  }
  return 'Falha ao gravar a reaprovação.';
}

export function classificarErroTrava(error: ErroBanco): 'ausente' | 'incompleta' | null {
  if (!error) return null;
  const msg = String(error.message || '');
  if (error.code === '42P01' || error.code === '42703' || /does not exist/i.test(msg)) return 'ausente';
  return 'incompleta';
}

function texto(valor: unknown): string | null {
  const limpo = String(valor || '').trim();
  return limpo || null;
}

export function eventoDaLinha(row: Record<string, unknown> | null | undefined): EventoReaprovacao | null {
  if (!row) return null;
  return {
    id: String(row.id || ''),
    tentativaId: String(row.tentativa_id || ''),
    missionId: String(row.mission_id || ''),
    osNumero: String(row.os_numero || row.mission_id || ''),
    incluidoPor: texto(row.incluido_por),
    aprovadoOriginalmentePor: texto(row.aprovado_originalmente_por),
    aprovadoOriginalmenteEm: texto(row.aprovado_originalmente_em),
    conferidoOriginalmentePor: texto(row.conferido_originalmente_por),
    alteradoPor: String(row.alterado_por || ''),
    reaprovadoPor: String(row.reaprovado_por || ''),
    reaprovadoEm: String(row.reaprovado_em || ''),
    justificativa: String(row.justificativa || ''),
    campos: Array.isArray(row.campos) ? row.campos as EventoReaprovacao['campos'] : [],
    capturaAntesPath: texto(row.captura_antes_path),
    capturaDepoisPath: texto(row.captura_depois_path),
    snapshotOriginal: row.snapshot_original ?? null,
    valoresAplicados: row.valores_aplicados === true,
    notificacaoId: texto(row.notificacao_id),
    status: (['pendente', 'concluida', 'falha', 'inconsistente'].includes(String(row.status))
      ? String(row.status)
      : 'pendente') as EventoReaprovacao['status'],
    erro: texto(row.erro),
  };
}

export function linhaDoEvento(evento: EventoReaprovacao): Record<string, unknown> {
  return {
    id: evento.id,
    tentativa_id: evento.tentativaId,
    mission_id: evento.missionId,
    os_numero: evento.osNumero,
    incluido_por: evento.incluidoPor,
    aprovado_originalmente_por: evento.aprovadoOriginalmentePor,
    aprovado_originalmente_em: evento.aprovadoOriginalmenteEm,
    conferido_originalmente_por: evento.conferidoOriginalmentePor,
    alterado_por: evento.alteradoPor,
    reaprovado_por: evento.reaprovadoPor,
    reaprovado_em: evento.reaprovadoEm,
    justificativa: evento.justificativa,
    campos: evento.campos,
    captura_antes_path: evento.capturaAntesPath,
    captura_depois_path: evento.capturaDepoisPath,
    snapshot_original: evento.snapshotOriginal ?? null,
    valores_aplicados: evento.valoresAplicados,
    notificacao_id: evento.notificacaoId,
    status: evento.status,
    erro: evento.erro,
  };
}

export function notificacaoDaLinha(row: Record<string, unknown> | null | undefined): NotificacaoDiretoria | null {
  if (!row) return null;
  const resumo = row.resumo && typeof row.resumo === 'object'
    ? row.resumo as NotificacaoDiretoria['resumo']
    : null;
  if (!resumo) return null;
  return {
    id: String(row.id || ''),
    reaprovacaoId: String(row.reaprovacao_id || ''),
    situacao: (['pendente', 'lido', 'questionado', 'encerrado'].includes(String(row.situacao))
      ? String(row.situacao)
      : 'pendente') as NotificacaoDiretoria['situacao'],
    historico: Array.isArray(row.historico) ? row.historico as NotificacaoDiretoria['historico'] : [],
    resumo: { ...resumo, aprovacaoFinanceiraAlterada: false },
  };
}

export function osDaLinha(
  row: Record<string, unknown> | null | undefined,
  extra?: { faturaPaga?: boolean; consultaTravaIncompleta?: boolean },
): OsReaprovacao | null {
  if (!row?.id) return null;
  return {
    id: String(row.id),
    client: texto(row.client),
    created_by: texto(row.created_by),
    status: texto(row.status),
    invoice_number: texto(row.invoice_number),
    billing_approved: row.billing_approved === true,
    billing_verified_by: texto(row.billing_verified_by),
    snapshot_approved_by: texto(row.snapshot_approved_by),
    snapshot_approved_at: texto(row.snapshot_approved_at),
    snapshot_data: row.snapshot_data ?? null,
    negative_margin_locked: row.negative_margin_locked === true,
    faturaPaga: extra?.faturaPaga === true,
    consultaTravaIncompleta: extra?.consultaTravaIncompleta === true,
    revenue_value: Number(row.revenue_value || 0),
    cost_value: Number(row.cost_value || 0),
    revenue_edit_reason: texto(row.revenue_edit_reason),
    cost_edit_reason: texto(row.cost_edit_reason),
    toll_value: row.toll_value == null ? null : Number(row.toll_value),
    toll_value_provider: row.toll_value_provider == null ? null : Number(row.toll_value_provider),
  };
}

type Cliente = {
  from: (tabela: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: Record<string, unknown> | null; error: ErroBanco }>;
  storage: {
    from: (bucket: string) => {
      upload: (path: string, body: Uint8Array, opts: { contentType: string; upsert: boolean }) => Promise<{ error: ErroBanco }>;
      createSignedUrl: (path: string, expiresIn: number) => Promise<{ data: { signedUrl?: string } | null; error: ErroBanco }>;
    };
  };
};

function falha(error: ErroBanco): { ok: false; erro: string } {
  return { ok: false, erro: classificarErroGravacao(error) || 'Falha ao gravar a reaprovação.' };
}

export function criarRepositorio(sb: Cliente) {
  return {
    async buscarTentativa(tentativaId: string) {
      const { data, error } = await sb.from('reaprovacao_financeira').select('*').eq('tentativa_id', tentativaId).maybeSingle();
      if (error) return falha(error);
      return { ok: true as const, evento: eventoDaLinha(data) };
    },
    async buscarPorId(id: string) {
      const { data, error } = await sb.from('reaprovacao_financeira').select('*').eq('id', id).maybeSingle();
      if (error) return falha(error);
      return { ok: true as const, evento: eventoDaLinha(data) };
    },
    async confirmar(entrada: EntradaAtomica): Promise<ResultadoAtomico> {
      const { data, error } = await sb.rpc('reaprovar_os_financeira', {
        p_tentativa_id: entrada.tentativaId,
        p_mission_id: entrada.missionId,
        p_receita_nova: entrada.receitaNova,
        p_custo_novo: entrada.custoNovo,
        p_receita_esperada: entrada.receitaEsperada,
        p_custo_esperado: entrada.custoEsperado,
        p_justificativa: entrada.justificativa,
        p_alterado_por: entrada.alteradoPor,
        p_captura_antes: entrada.capturaAntesPath,
        p_captura_depois: entrada.capturaDepoisPath,
        p_quando: entrada.quando,
      });
      if (error) return { ok: false, codigo: 'banco', erro: classificarErroGravacao(error) || 'Falha ao gravar a reaprovação.' };
      const corpo = data || {};
      if (corpo.ok !== true) {
        const codigo = corpo.codigo === 'conflito' || corpo.codigo === 'trava' || corpo.codigo === 'sem_mudanca' || corpo.codigo === 'tentativa'
          ? corpo.codigo
          : 'banco';
        return { ok: false, codigo, erro: String(corpo.erro || 'Falha ao gravar a reaprovação.') };
      }
      const evento = eventoDaLinha(corpo.evento as Record<string, unknown> | null);
      if (!evento) return { ok: false, codigo: 'banco', erro: 'A transação não devolveu o evento. A conclusão foi impedida.' };
      return { ok: true, evento, repetida: corpo.repetida === true };
    },
    async confirmarEdicao(entrada: EntradaEdicaoTotal): Promise<ResultadoAtomico> {
      const { data, error } = await sb.rpc('editar_os_total_financeira', {
        p_tentativa_id: entrada.tentativaId,
        p_mission_id: entrada.missionId,
        p_campos: entrada.campos,
        p_justificativa: entrada.justificativa,
        p_alterado_por: entrada.alteradoPor,
        p_captura_antes: entrada.capturaAntesPath,
        p_captura_depois: entrada.capturaDepoisPath,
        p_quando: entrada.quando,
      });
      if (error) return { ok: false, codigo: 'banco', erro: classificarErroGravacao(error) || 'Falha ao gravar a edição total.' };
      const corpo = data || {};
      if (corpo.ok !== true) {
        const codigo = corpo.codigo === 'conflito' || corpo.codigo === 'trava' || corpo.codigo === 'sem_mudanca' || corpo.codigo === 'tentativa'
          ? corpo.codigo
          : 'banco';
        return { ok: false, codigo, erro: String(corpo.erro || 'Falha ao gravar a edição total.') };
      }
      const evento = eventoDaLinha(corpo.evento as Record<string, unknown> | null);
      if (!evento) return { ok: false, codigo: 'banco', erro: 'A transação não devolveu o evento. A conclusão foi impedida.' };
      return { ok: true, evento, repetida: corpo.repetida === true };
    },
    async listarNotificacoes() {
      const { data, error } = await sb
        .from('reaprovacao_diretoria')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(50);
      if (error) return falha(error);
      const itens = (data || []).map((row: Record<string, unknown>) => notificacaoDaLinha(row)).filter(Boolean) as NotificacaoDiretoria[];
      return { ok: true as const, itens };
    },
    async salvarNotificacao(notificacao: NotificacaoDiretoria) {
      const { error } = await sb.from('reaprovacao_diretoria').update({
        situacao: notificacao.situacao,
        historico: notificacao.historico,
        resumo: { ...notificacao.resumo, aprovacaoFinanceiraAlterada: false },
        updated_at: new Date().toISOString(),
      }).eq('id', notificacao.id);
      if (error) return falha(error);
      return { ok: true as const };
    },
    async buscarNotificacao(id: string) {
      const { data, error } = await sb.from('reaprovacao_diretoria').select('*').eq('id', id).maybeSingle();
      if (error) return falha(error);
      return { ok: true as const, notificacao: notificacaoDaLinha(data) };
    },
  };
}

export function criarArmazenamento(sb: Cliente) {
  return {
    async guardar(path: string, bytes: Uint8Array) {
      const { error } = await sb.storage.from(BUCKET_REAPROVACAO).upload(path, bytes, {
        contentType: 'image/jpeg',
        upsert: true,
      });
      if (error) return falha(error);
      return { ok: true as const, path };
    },
    async urlAssinada(path: string) {
      const { data, error } = await sb.storage.from(BUCKET_REAPROVACAO).createSignedUrl(path, 180);
      if (error || !data?.signedUrl) return falha(error || { message: 'sem url' });
      return { ok: true as const, url: data.signedUrl };
    },
  };
}
