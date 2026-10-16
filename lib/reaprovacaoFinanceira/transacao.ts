/**
 * Contrato da transação única.
 * A função PostgreSQL reaprovar_os_financeira faz o mesmo no banco:
 * trava a tentativa, trava a linha da OS, revalida e só então grava
 * valor, evento e notificação. Se um passo falha, nada disso permanece.
 */
import { aplicarCamposNaOs, validarCamposEdicao, valorConfere } from './camposEdicao';
import {
  camposAlterados,
  centavos,
  montarPatchValores,
  montarResumo,
  montarResumoEdicao,
  motivoBloqueioEdicaoTotal,
  motivoBloqueioReaprovacao,
  nomeAprovadorOriginal,
  osJaAprovada,
  patchSeguro,
} from './regras';
import type { CampoAuditado, EventoReaprovacao, NotificacaoDiretoria, OsReaprovacao } from './tipos';

export type EntradaAtomica = {
  tentativaId: string;
  missionId: string;
  receitaNova: number;
  custoNovo: number;
  receitaEsperada: number;
  custoEsperado: number;
  justificativa: string;
  alteradoPor: string;
  capturaAntesPath: string;
  capturaDepoisPath: string;
  quando: string;
};

export type ResultadoAtomico =
  | { ok: true; evento: EventoReaprovacao; repetida: boolean }
  | { ok: false; erro: string; codigo: 'conflito' | 'trava' | 'banco' | 'sem_mudanca' | 'tentativa' };

export type EstadoAtomico = {
  missoes: Map<string, OsReaprovacao>;
  eventos: Map<string, EventoReaprovacao>;
  avisos: NotificacaoDiretoria[];
  patches: Record<string, unknown>[];
  confirmacoes: number;
};

const cadeados = new Map<string, Promise<unknown>>();

/** Fila por chave. A mesma ordem (tentativa, depois OS) evita bloqueio cruzado. */
export function comCadeado<T>(chave: string, fn: () => Promise<T> | T): Promise<T> {
  const anterior = cadeados.get(chave) ?? Promise.resolve();
  const execucao = anterior.then(() => fn(), () => fn());
  cadeados.set(chave, execucao.then(() => undefined, () => undefined));
  return execucao;
}

export function criarEstadoAtomico(missoes: OsReaprovacao[]): EstadoAtomico {
  return {
    missoes: new Map(missoes.map((os) => [os.id, { ...os, snapshot_data: os.snapshot_data }])),
    eventos: new Map(),
    avisos: [],
    patches: [],
    confirmacoes: 0,
  };
}

function eventoCompleto(evento: EventoReaprovacao | null | undefined, missionId: string): evento is EventoReaprovacao {
  return !!evento
    && evento.status === 'concluida'
    && evento.missionId === missionId
    && !!evento.capturaAntesPath
    && !!evento.capturaDepoisPath
    && !!evento.notificacaoId
    && evento.valoresAplicados === true;
}

export async function confirmarReaprovacaoAtomica(
  estado: EstadoAtomico,
  entrada: EntradaAtomica,
  opcoes?: { abortar?: 'aviso' | 'banco' },
): Promise<ResultadoAtomico> {
  return comCadeado(`tentativa:${entrada.tentativaId}`, () => comCadeado(`missao:${entrada.missionId}`, () => {
    const existente = estado.eventos.get(entrada.tentativaId) || null;
    if (eventoCompleto(existente, entrada.missionId)) {
      return { ok: true as const, evento: existente, repetida: true };
    }
    if (existente) {
      return {
        ok: false as const,
        codigo: 'tentativa' as const,
        erro: 'Esta tentativa já existe e não está concluída. Nada foi alterado.',
      };
    }

    const missao = estado.missoes.get(entrada.missionId);
    if (!missao) return { ok: false as const, codigo: 'trava' as const, erro: 'OS não encontrada.' };
    const trava = motivoBloqueioReaprovacao(missao);
    if (trava) return { ok: false as const, codigo: 'trava' as const, erro: trava };
    if (!osJaAprovada(missao)) {
      return { ok: false as const, codigo: 'trava' as const, erro: 'A OS ainda não tem aprovação financeira.' };
    }
    if (!entrada.capturaAntesPath || !entrada.capturaDepoisPath) {
      return { ok: false as const, codigo: 'banco' as const, erro: 'A evidência obrigatória não está no armazenamento. Nada foi alterado.' };
    }
    if (centavos(missao.revenue_value) !== centavos(entrada.receitaEsperada)
      || centavos(missao.cost_value) !== centavos(entrada.custoEsperado)) {
      return {
        ok: false as const,
        codigo: 'conflito' as const,
        erro: 'A OS foi alterada por outra edição. A reaprovação não foi concluída.',
      };
    }

    const campos = camposAlterados(missao, {
      revenue_value: entrada.receitaNova,
      cost_value: entrada.custoNovo,
    });
    if (campos.length === 0) {
      return { ok: false as const, codigo: 'sem_mudanca' as const, erro: 'Nenhum valor financeiro foi alterado.' };
    }
    const patch = montarPatchValores(campos, entrada.justificativa, entrada.alteradoPor, entrada.quando);
    const seguro = patchSeguro(patch);
    if (!seguro.ok) return { ok: false as const, codigo: 'banco' as const, erro: seguro.erro };

    const eventoId = crypto.randomUUID();
    const avisoId = crypto.randomUUID();
    const rascunhoMissao: OsReaprovacao = { ...missao };
    if (Object.prototype.hasOwnProperty.call(seguro.patch, 'revenue_value')) {
      rascunhoMissao.revenue_value = Number(seguro.patch.revenue_value);
      rascunhoMissao.revenue_edit_reason = String(seguro.patch.revenue_edit_reason || '');
    }
    if (Object.prototype.hasOwnProperty.call(seguro.patch, 'cost_value')) {
      rascunhoMissao.cost_value = Number(seguro.patch.cost_value);
      rascunhoMissao.cost_edit_reason = String(seguro.patch.cost_edit_reason || '');
    }
    const evento: EventoReaprovacao = {
      id: eventoId,
      tentativaId: entrada.tentativaId,
      missionId: missao.id,
      osNumero: missao.id,
      incluidoPor: String(missao.created_by || '').trim() || null,
      aprovadoOriginalmentePor: nomeAprovadorOriginal(missao),
      aprovadoOriginalmenteEm: missao.snapshot_approved_at || null,
      conferidoOriginalmentePor: String(missao.billing_verified_by || '').trim() || null,
      alteradoPor: entrada.alteradoPor,
      reaprovadoPor: entrada.alteradoPor,
      reaprovadoEm: entrada.quando,
      justificativa: entrada.justificativa,
      campos,
      capturaAntesPath: entrada.capturaAntesPath,
      capturaDepoisPath: entrada.capturaDepoisPath,
      snapshotOriginal: missao.snapshot_data ?? null,
      valoresAplicados: true,
      notificacaoId: avisoId,
      status: 'concluida',
      erro: null,
    };
    const aviso: NotificacaoDiretoria = {
      id: avisoId,
      reaprovacaoId: eventoId,
      situacao: 'pendente',
      historico: [],
      resumo: montarResumo(evento),
    };

    if (opcoes?.abortar) {
      return {
        ok: false as const,
        codigo: 'banco' as const,
        erro: opcoes.abortar === 'aviso'
          ? 'Falha ao avisar a Diretoria. A transação foi desfeita. Receita e custo não foram alterados.'
          : 'Falha no banco. A transação foi desfeita. Receita e custo não foram alterados.',
      };
    }

    estado.missoes.set(missao.id, rascunhoMissao);
    estado.eventos.set(entrada.tentativaId, evento);
    estado.avisos.push(aviso);
    estado.patches.push(seguro.patch);
    estado.confirmacoes += 1;
    return { ok: true as const, evento, repetida: false };
  }));
}

export type EntradaEdicaoTotal = {
  tentativaId: string;
  missionId: string;
  campos: CampoAuditado[];
  justificativa: string;
  alteradoPor: string;
  capturaAntesPath: string;
  capturaDepoisPath: string;
  quando: string;
  cliente?: string | null;
};

export async function confirmarEdicaoTotalAtomica(
  estado: EstadoAtomico,
  entrada: EntradaEdicaoTotal,
  opcoes?: { abortar?: 'aviso' | 'banco' },
): Promise<ResultadoAtomico> {
  return comCadeado(`tentativa:${entrada.tentativaId}`, () => comCadeado(`missao:${entrada.missionId}`, () => {
    const existente = estado.eventos.get(entrada.tentativaId) || null;
    if (eventoCompleto(existente, entrada.missionId)) {
      return { ok: true as const, evento: existente, repetida: true };
    }
    if (existente) {
      return {
        ok: false as const,
        codigo: 'tentativa' as const,
        erro: 'Esta tentativa já existe e não está concluída. Nada foi alterado.',
      };
    }

    const missao = estado.missoes.get(entrada.missionId);
    if (!missao) return { ok: false as const, codigo: 'trava' as const, erro: 'OS não encontrada.' };
    const trava = motivoBloqueioEdicaoTotal(missao);
    if (trava) return { ok: false as const, codigo: 'trava' as const, erro: trava };
    if (!entrada.capturaAntesPath || !entrada.capturaDepoisPath) {
      return { ok: false as const, codigo: 'banco' as const, erro: 'A evidência obrigatória não está no armazenamento. Nada foi alterado.' };
    }
    const pedido = validarCamposEdicao(entrada.campos);
    if (!pedido.ok) return { ok: false as const, codigo: 'sem_mudanca' as const, erro: pedido.erro };
    for (const campo of pedido.campos) {
      if (!valorConfere(missao, campo)) {
        return {
          ok: false as const,
          codigo: 'conflito' as const,
          erro: 'A OS foi alterada por outra edição. A edição total não foi concluída.',
        };
      }
    }

    const snapshotAntes = JSON.stringify(missao.snapshot_data ?? null);
    const aprovacaoAntes = {
      billing_approved: missao.billing_approved,
      billing_verified_by: missao.billing_verified_by,
      snapshot_approved_by: missao.snapshot_approved_by,
      snapshot_approved_at: missao.snapshot_approved_at,
    };
    const carimbo = `[${entrada.alteradoPor}] Edição total: ${entrada.justificativa}`;
    const rascunho = aplicarCamposNaOs(missao, pedido.campos, carimbo);
    if (JSON.stringify(rascunho.snapshot_data ?? null) !== snapshotAntes
      || rascunho.billing_approved !== aprovacaoAntes.billing_approved
      || rascunho.billing_verified_by !== aprovacaoAntes.billing_verified_by
      || rascunho.snapshot_approved_by !== aprovacaoAntes.snapshot_approved_by
      || rascunho.snapshot_approved_at !== aprovacaoAntes.snapshot_approved_at) {
      return { ok: false as const, codigo: 'banco' as const, erro: 'A edição total tentou mexer na aprovação. Nada foi alterado.' };
    }

    const eventoId = crypto.randomUUID();
    const avisoId = crypto.randomUUID();
    const evento: EventoReaprovacao = {
      id: eventoId,
      tentativaId: entrada.tentativaId,
      missionId: missao.id,
      osNumero: missao.id,
      incluidoPor: String(missao.created_by || '').trim() || null,
      aprovadoOriginalmentePor: nomeAprovadorOriginal(missao),
      aprovadoOriginalmenteEm: missao.snapshot_approved_at || null,
      conferidoOriginalmentePor: String(missao.billing_verified_by || '').trim() || null,
      alteradoPor: entrada.alteradoPor,
      reaprovadoPor: entrada.alteradoPor,
      reaprovadoEm: entrada.quando,
      justificativa: entrada.justificativa,
      campos: pedido.campos,
      capturaAntesPath: entrada.capturaAntesPath,
      capturaDepoisPath: entrada.capturaDepoisPath,
      snapshotOriginal: missao.snapshot_data ?? null,
      valoresAplicados: true,
      notificacaoId: avisoId,
      status: 'concluida',
      erro: null,
    };
    const aviso: NotificacaoDiretoria = {
      id: avisoId,
      reaprovacaoId: eventoId,
      situacao: 'pendente',
      historico: [],
      resumo: montarResumoEdicao(evento, entrada.cliente || null),
    };

    if (opcoes?.abortar) {
      return {
        ok: false as const,
        codigo: 'banco' as const,
        erro: opcoes.abortar === 'aviso'
          ? 'Falha ao avisar a Diretoria. A transação foi desfeita. Nenhum campo foi alterado.'
          : 'Falha no banco. A transação foi desfeita. Nenhum campo foi alterado.',
      };
    }

    estado.missoes.set(missao.id, rascunho);
    estado.eventos.set(entrada.tentativaId, evento);
    estado.avisos.push(aviso);
    estado.patches.push({ campos: pedido.campos });
    estado.confirmacoes += 1;
    return { ok: true as const, evento, repetida: false };
  }));
}
