import { isFinanceProfileRole, isFinanceSupervisorName } from './financeSupervisorAccess';

/** Aviso da Diretoria sobre edição do Financeiro. Fica em system_logs, sem tabela nova. */
export const ENTIDADE_AVISO_EDICAO = 'DiretoriaAvisoEdicao';
export const ACAO_AVISO_EDICAO = 'EDICAO_OS_FINANCEIRO';

const TEXTO_MINIMO = 8;

export type AvisoEdicaoDiretoria = {
  id: string;
  os: string;
  cliente: string;
  quem: string;
  perfil: string;
  quando: string;
  texto: string;
  alteracoes: string[];
  lida: boolean;
  lidaPor?: string;
  lidaEm?: string;
  historicoId?: string;
};

export function reaprovacaoExigeConfirmacao(input: {
  aprovar: boolean;
  jaAprovada: boolean;
  perfil: string | null | undefined;
}): boolean {
  return input.aprovar === true && input.jaAprovada === true && isFinanceProfileRole(input.perfil);
}

export function textoReaprovacaoValido(texto: string | null | undefined): boolean {
  return String(texto || '').trim().length >= TEXTO_MINIMO;
}

export function montarDetalhesAviso(input: {
  os: string;
  cliente?: string | null;
  quem: string;
  perfil?: string | null;
  quando: string;
  texto: string;
  alteracoes: string[];
}): string {
  return JSON.stringify({
    os: input.os,
    cliente: String(input.cliente || '').trim(),
    quem: input.quem,
    perfil: String(input.perfil || '').trim(),
    quando: input.quando,
    texto: input.texto.trim(),
    alteracoes: input.alteracoes.filter((item) => String(item || '').trim()),
    lida: false,
  });
}

export function lerAvisoEdicao(id: string, details: string | null | undefined): AvisoEdicaoDiretoria | null {
  try {
    const cru = JSON.parse(String(details || '')) as Partial<AvisoEdicaoDiretoria>;
    if (!cru || typeof cru !== 'object') return null;
    return {
      id,
      os: String(cru.os || ''),
      cliente: String(cru.cliente || ''),
      quem: String(cru.quem || ''),
      perfil: String(cru.perfil || ''),
      quando: String(cru.quando || ''),
      texto: String(cru.texto || ''),
      alteracoes: Array.isArray(cru.alteracoes) ? cru.alteracoes.map((item) => String(item)) : [],
      lida: cru.lida === true,
      lidaPor: cru.lidaPor ? String(cru.lidaPor) : undefined,
      lidaEm: cru.lidaEm ? String(cru.lidaEm) : undefined,
      historicoId: cru.historicoId ? String(cru.historicoId) : undefined,
    };
  } catch {
    return null;
  }
}

export function avisoContinuaPendente(aviso: { lida?: boolean } | null | undefined): boolean {
  return !!aviso && aviso.lida !== true;
}

const ACOES_POS_APROVACAO = new Set(['POST_APPROVAL_EDIT', 'POST_APPROVAL_REAPPROVE']);

/** Edição já gravada no histórico da OS, para a Diretoria ver o que passou sem aviso próprio. */
export function avisoDoHistoricoPosAprovacao(linha: {
  id?: string | null;
  action_type?: string | null;
  user_name?: string | null;
  created_at?: string | null;
  entity_id?: string | null;
  details?: string | null;
}): AvisoEdicaoDiretoria | null {
  if (!ACOES_POS_APROVACAO.has(String(linha.action_type || ''))) return null;
  let cru: { user?: string; role?: string; date?: string; note?: string; changes?: unknown; cliente?: string } = {};
  try {
    cru = JSON.parse(String(linha.details || '{}'));
  } catch {
    return null;
  }
  const quem = String(linha.user_name || cru.user || '').trim();
  const perfil = String(cru.role || '').trim();
  if (!isFinanceProfileRole(perfil) && !isFinanceSupervisorName(quem)) return null;
  const alteracoes = Array.isArray(cru.changes) ? cru.changes.map((item) => String(item)).filter((item) => item.trim()) : [];
  const texto = String(cru.note || '').trim() || alteracoes.join(' · ') || 'Alteração em OS já aprovada.';
  const id = String(linha.id || '');
  if (!id) return null;
  return {
    id,
    os: String(linha.entity_id || ''),
    cliente: String(cru.cliente || '').trim(),
    quem,
    perfil,
    quando: String(cru.date || linha.created_at || ''),
    texto,
    alteracoes,
    lida: false,
    historicoId: id,
  };
}

export function historicoJaInformado(details: string | null | undefined): string {
  try {
    const cru = JSON.parse(String(details || '')) as { historicoId?: string };
    return String(cru?.historicoId || '');
  } catch {
    return '';
  }
}

export function marcadorDeHistoricoLido(
  aviso: AvisoEdicaoDiretoria,
  quem: string,
  quando: string,
): string {
  return JSON.stringify({
    os: aviso.os,
    cliente: aviso.cliente,
    quem: aviso.quem,
    perfil: aviso.perfil,
    quando: aviso.quando,
    texto: aviso.texto,
    alteracoes: aviso.alteracoes,
    lida: true,
    lidaPor: quem,
    lidaEm: quando,
    historicoId: aviso.historicoId || aviso.id,
  });
}

export function detalhesMarcadosComoLidos(
  aviso: AvisoEdicaoDiretoria,
  quem: string,
  quando: string,
): string {
  return JSON.stringify({
    ...aviso,
    id: undefined,
    lida: true,
    lidaPor: quem,
    lidaEm: quando,
  });
}
