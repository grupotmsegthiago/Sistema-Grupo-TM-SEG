/**
 * Quem pode ler e gravar valor financeiro quando a chamada já passou pelo servidor.
 * O perfil vem do cadastro, não do que o navegador declara.
 */
import { podeAcessarAuditoriaFaturamento, perfilAuditoria } from '../auditoriaFaturamentoAccess';
import { canSeeMissionBillingSummary } from '../financeSupervisorAccess';
import { isProviderOnlyControllerUser } from '../plinioMissionRestrictions';
import {
  COLUNAS_AUDITORIA_OS,
  COLUNAS_PROTEGIDAS_OS,
  COLUNAS_VALOR_CLIENTE_BLOQUEADAS_CONTROLLER,
  COLUNAS_VALOR_OS,
  ehColunaProtegidaOs,
} from './colunasProtegidas';

export type PrincipalFinanceiro = {
  id?: string | number | null;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  permissions?: string[] | null;
};

function papel(user: PrincipalFinanceiro | null | undefined): string {
  return perfilAuditoria(user?.role);
}

export function ehClientePortal(user: PrincipalFinanceiro | null | undefined): boolean {
  const nome = papel(user);
  return nome === 'cliente' || nome === 'client';
}

/** Quem opera OS por dentro precisa do valor para calcular, finalizar e não zerar sem querer. */
export function podeLerValoresOs(user: PrincipalFinanceiro | null | undefined): boolean {
  if (!user || ehClientePortal(user)) return false;
  if (podeAcessarAuditoriaFaturamento(user) || canSeeMissionBillingSummary(user)) return true;
  const nome = papel(user);
  return nome === 'operador' || nome === 'avancado' || nome === 'administrador';
}

/** Snapshot, parâmetros da edição total e carimbo de conferência. */
export function podeLerAuditoriaOs(user: PrincipalFinanceiro | null | undefined): boolean {
  return podeAcessarAuditoriaFaturamento(user);
}

export function colunasProtegidasLegiveis(user: PrincipalFinanceiro | null | undefined): string[] {
  const colunas: string[] = [];
  if (podeLerValoresOs(user)) colunas.push(...COLUNAS_VALOR_OS);
  if (podeLerAuditoriaOs(user)) colunas.push(...COLUNAS_AUDITORIA_OS);
  else if (podeLerValoresOs(user)) {
    colunas.push('revenue_edit_reason', 'cost_edit_reason');
  }
  return colunas;
}

function podeGravarAuditoriaCheia(user: PrincipalFinanceiro | null | undefined): boolean {
  return podeAcessarAuditoriaFaturamento(user) && !isProviderOnlyControllerUser(user);
}

function valorPermitido(
  user: PrincipalFinanceiro,
  coluna: string,
  modo: 'insert' | 'update',
): boolean {
  if (ehClientePortal(user)) return false;
  if (isProviderOnlyControllerUser(user)) {
    if ((COLUNAS_VALOR_CLIENTE_BLOQUEADAS_CONTROLLER as readonly string[]).includes(coluna)) return false;
    return true;
  }
  if (modo === 'insert') return true;
  return podeLerValoresOs(user);
}

function auditoriaPermitida(
  user: PrincipalFinanceiro,
  coluna: string,
  valor: unknown,
): boolean {
  if (coluna === 'revenue_edit_reason' || coluna === 'cost_edit_reason') {
    return !ehClientePortal(user);
  }
  if (coluna === 'parametros_edicao_total') return podeGravarAuditoriaCheia(user);
  if (valor === null || valor === '') return !ehClientePortal(user);
  return podeGravarAuditoriaCheia(user);
}

/** Tira do payload o que este perfil não pode gravar. Não inventa zero no lugar de um valor existente. */
export function filtrarGravacaoOs(
  user: PrincipalFinanceiro | null | undefined,
  payload: Record<string, unknown>,
  modo: 'insert' | 'update',
): Record<string, unknown> {
  const saida: Record<string, unknown> = { ...payload };
  if (!user) return {};
  for (const coluna of COLUNAS_PROTEGIDAS_OS) {
    if (!Object.prototype.hasOwnProperty.call(saida, coluna)) continue;
    const valor = saida[coluna];
    const permitido = ehColunaProtegidaOs(coluna) && (COLUNAS_VALOR_OS as readonly string[]).includes(coluna)
      ? valorPermitido(user, coluna, modo)
      : auditoriaPermitida(user, coluna, valor);
    if (!permitido) delete saida[coluna];
  }
  if (modo === 'insert') {
    if (saida.revenue_value == null) saida.revenue_value = 0;
    if (saida.cost_value == null) saida.cost_value = 0;
  }
  return saida;
}

export function podeLerTabelasPreco(user: PrincipalFinanceiro | null | undefined): boolean {
  return Boolean(user) && !ehClientePortal(user);
}

export function podeGravarTabelasPreco(user: PrincipalFinanceiro | null | undefined): boolean {
  if (!podeLerTabelasPreco(user)) return false;
  const nome = papel(user);
  return ['diretoria', 'administrador', 'financeiro', 'controller', 'comercial'].includes(nome)
    || isProviderOnlyControllerUser(user);
}
