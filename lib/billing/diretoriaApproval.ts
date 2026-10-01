export type ApprovalStageLog = {
  stage?: string | null;
  date?: string | null;
};

function momento(log: ApprovalStageLog, index: number): number {
  const time = Date.parse(String(log.date || ''));
  return Number.isFinite(time) ? time : index;
}

/** A Diretoria aprovou e ainda não desaprovou depois disso. */
export function diretoriaAindaAprova(logs: ApprovalStageLog[]): boolean {
  let ultimo: { aprova: boolean; time: number } | null = null;
  logs.forEach((log, index) => {
    const stage = String(log.stage || '');
    const aprova = stage === 'diretoria' || stage === 'diretoria_reapproval';
    const revoga = stage === 'diretoria_revogada';
    if (!aprova && !revoga) return;
    const time = momento(log, index);
    if (!ultimo || time >= ultimo.time) ultimo = { aprova, time };
  });
  return ultimo?.aprova === true;
}

/** Financeiro ou Controller seguem valendo depois que a Diretoria desaprova. */
export function faturamentoAprovadoSemDiretoria(logs: ApprovalStageLog[]): boolean {
  return logs.some((log) => log.stage === 'financeiro' || log.stage === 'controller');
}
