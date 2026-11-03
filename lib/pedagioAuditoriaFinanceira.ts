import { isFinanceProfileRole, isFinanceSupervisorName } from './financeSupervisorAccess';

export type RegistroAuditoriaPedagio = {
  user?: string | null;
  role?: string | null;
  stage?: string | null;
  changes?: string[] | null;
  date?: string | null;
};

export type LadoPedagio = 'cliente' | 'fornecedor';

function semAcento(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function ehFinanceiro(entry: RegistroAuditoriaPedagio): boolean {
  const role = semAcento(String(entry.role || ''));
  const stage = semAcento(String(entry.stage || ''));
  if (role === 'financeiro' || role.includes('financeiro') || stage === 'financeiro') return true;
  return isFinanceProfileRole(entry.role) || isFinanceSupervisorName(entry.user);
}

function ladoMencionado(texto: string): 'cliente' | 'fornecedor' | 'ambos' | null {
  const t = semAcento(texto);
  if (!t.includes('pedagio')) return null;
  const cliente = t.includes('cliente');
  const fornecedor = t.includes('fornecedor');
  if (cliente && !fornecedor) return 'cliente';
  if (fornecedor && !cliente) return 'fornecedor';
  return 'ambos';
}

/** Quem alterou aquele lado do pedágio por último, seja financeiro ou operação. */
export function ultimoQueAlterouPedagio(
  registros: RegistroAuditoriaPedagio[],
  lado: LadoPedagio,
): string | null {
  const ordenados = [...registros].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  for (const entry of ordenados) {
    const alvo = ladoMencionado((entry.changes || []).join(' | '));
    if (!alvo || (alvo !== 'ambos' && alvo !== lado)) continue;
    const nome = String(entry.user || '').trim();
    if (nome) return nome;
  }
  return null;
}

/** Nome de quem no financeiro alterou aquele lado do pedágio. O mais recente vence. */
export function nomeAuditorFinanceiroDoPedagio(
  registros: RegistroAuditoriaPedagio[],
  lado: LadoPedagio,
): string | null {
  const ordenados = [...registros].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  for (const entry of ordenados) {
    if (!ehFinanceiro(entry)) continue;
    const alvo = ladoMencionado((entry.changes || []).join(' | '));
    if (!alvo || (alvo !== 'ambos' && alvo !== lado)) continue;
    return String(entry.user || '').trim() || 'Financeiro';
  }
  return null;
}

export function frasePedagioAuditadoPeloFinanceiro(nome: string): string {
  const quem = String(nome || '').trim() || 'Financeiro';
  return `Esse pedagio ja foi auditado pela: ${quem}`;
}
