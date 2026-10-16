/**
 * Reaprovação financeira depois da aprovação.
 * O registro original da OS permanece. Este módulo só descreve o evento novo.
 */

export const CAMPOS_CORRIGIVEIS = ['revenue_value', 'cost_value'] as const;

export type CampoCorrigivel = (typeof CAMPOS_CORRIGIVEIS)[number];

export const ETAPAS_REAPROVACAO = [
  'permissao',
  'justificativa',
  'senha',
  'capturas',
  'storage',
  'gravacao',
  'notificacao',
  'confirmacao',
] as const;

export type EtapaReaprovacao = (typeof ETAPAS_REAPROVACAO)[number];

export type EtapasReaprovacao = Record<EtapaReaprovacao, boolean>;

export type UsuarioReaprovacao = {
  id?: string | null;
  name?: string | null;
  role?: string | null;
};

export type OsReaprovacao = {
  id: string;
  created_by?: string | null;
  status?: string | null;
  invoice_number?: string | null;
  billing_approved?: boolean | null;
  billing_verified_by?: string | null;
  snapshot_approved_by?: string | null;
  snapshot_approved_at?: string | null;
  snapshot_data?: unknown;
  negative_margin_locked?: boolean | null;
  faturaPaga?: boolean | null;
  /** Consulta de fatura/pagamento não fechou. Não tratar como “não está paga”. */
  consultaTravaIncompleta?: boolean | null;
  revenue_value?: number | null;
  cost_value?: number | null;
  revenue_edit_reason?: string | null;
  cost_edit_reason?: string | null;
  toll_value?: number | null;
  toll_value_provider?: number | null;
};

export type CampoAlterado = {
  campo: CampoCorrigivel;
  antes: number;
  depois: number;
};

export type StatusEventoReaprovacao = 'pendente' | 'concluida' | 'falha' | 'inconsistente';

export type EventoReaprovacao = {
  id: string;
  tentativaId: string;
  missionId: string;
  osNumero: string;
  incluidoPor: string | null;
  aprovadoOriginalmentePor: string | null;
  aprovadoOriginalmenteEm: string | null;
  conferidoOriginalmentePor: string | null;
  alteradoPor: string;
  reaprovadoPor: string;
  reaprovadoEm: string;
  justificativa: string;
  campos: CampoAlterado[];
  capturaAntesPath: string | null;
  capturaDepoisPath: string | null;
  snapshotOriginal: unknown;
  valoresAplicados: boolean;
  notificacaoId: string | null;
  status: StatusEventoReaprovacao;
  erro: string | null;
};

export const ACOES_DIRETORIA = ['LIDO', 'QUESTIONAR', 'ENCERRAR'] as const;

export type AcaoDiretoria = (typeof ACOES_DIRETORIA)[number];

export type SituacaoDiretoria = 'pendente' | 'lido' | 'questionado' | 'encerrado';

export type HistoricoDiretoria = {
  acao: AcaoDiretoria;
  por: string;
  em: string;
  observacao: string | null;
};

/** O que a Diretoria lê. Não é carimbo de aprovação financeira. */
export type ResumoNotificacao = {
  osNumero: string;
  incluidoPor: string | null;
  aprovadoOriginalmentePor: string | null;
  aprovadoOriginalmenteEm: string | null;
  alteradoPor: string;
  reaprovadoPor: string;
  reaprovadoEm: string;
  justificativa: string;
  campos: CampoAlterado[];
  capturaAntesPath: string | null;
  capturaDepoisPath: string | null;
  preservados: string[];
  aprovacaoFinanceiraAlterada: false;
};

export type NotificacaoDiretoria = {
  id: string;
  reaprovacaoId: string;
  situacao: SituacaoDiretoria;
  historico: HistoricoDiretoria[];
  resumo: ResumoNotificacao;
};

export type ResultadoReaprovacao = {
  ok: boolean;
  http: number;
  erro?: string;
  percentual: number;
  etapas: EtapasReaprovacao;
  status: 'concluida' | 'recusada' | 'falha' | 'inconsistente';
  repetida?: boolean;
  evento?: EventoReaprovacao;
  resumo?: ResumoNotificacao;
};
