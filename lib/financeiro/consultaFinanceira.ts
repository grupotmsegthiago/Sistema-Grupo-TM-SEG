/**
 * Consultas financeiras que o navegador não pode mais fazer com a chave anônima.
 * O perfil vem do cadastro. Permissão * não abre auditoria nem fatura para operador.
 */
import { perfilAuditoria, podeAcessarAuditoriaFaturamento } from '../auditoriaFaturamentoAccess';
import {
  ehClientePortal,
  podeGravarTabelasPreco,
  podeLerTabelasPreco,
  type PrincipalFinanceiro,
} from './acessoCampos';

export const TABELAS_FATURA = [
  'financial_invoices',
  'financial_invoice_missions',
  'financial_invoice_nf_vinculos',
  'financial_invoice_divergencia_vista',
  'financial_transactions',
  'financial_transaction_payments',
  'financial_accounts',
  'financial_categories',
  'account_balance_snapshots',
  'rh_commissions',
  'rh_commission_rules',
] as const;

export const TABELAS_COMISSAO = ['comissoes', 'regras_comissao'] as const;

export const TABELAS_PRECO_EXTRA = ['client_price_regions'] as const;

export const TABELAS_LOG = ['system_logs'] as const;

export const ENTIDADES_AUDITORIA_LOG = ['BillingSnapshot', 'BillingAdjustment'] as const;

const METODOS = new Set([
  'select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in',
  'or', 'not', 'filter', 'match', 'order', 'limit', 'range', 'single', 'maybeSingle',
  'insert', 'update', 'upsert', 'delete',
]);

const ESCRITA = new Set(['insert', 'update', 'upsert', 'delete']);

export type PassoConsulta = { m?: string; args?: unknown[] };

export function tabelasConsultaFinanceira(): string[] {
  return [...TABELAS_FATURA, ...TABELAS_COMISSAO, ...TABELAS_PRECO_EXTRA, ...TABELAS_LOG];
}

export function ehTabelaConsultaFinanceira(tabela: string): boolean {
  return tabelasConsultaFinanceira().includes(tabela);
}

function papel(user: PrincipalFinanceiro | null | undefined): string {
  return perfilAuditoria(user?.role);
}

function podeFatura(user: PrincipalFinanceiro | null | undefined): boolean {
  if (!user || ehClientePortal(user)) return false;
  return ['diretoria', 'financeiro', 'controller', 'administrador'].includes(papel(user));
}

function podeComissao(user: PrincipalFinanceiro | null | undefined): boolean {
  if (!user || ehClientePortal(user)) return false;
  const nome = papel(user);
  return nome === 'diretoria' || nome === 'financeiro' || nome === 'comercial' || nome.includes('comercial');
}

export function podeLerConsultaFinanceira(
  user: PrincipalFinanceiro | null | undefined,
  tabela: string,
): boolean {
  if (!ehTabelaConsultaFinanceira(tabela)) return false;
  if ((TABELAS_FATURA as readonly string[]).includes(tabela)) return podeFatura(user);
  if ((TABELAS_COMISSAO as readonly string[]).includes(tabela)) return podeComissao(user);
  if ((TABELAS_PRECO_EXTRA as readonly string[]).includes(tabela)) return podeLerTabelasPreco(user);
  if ((TABELAS_LOG as readonly string[]).includes(tabela)) return Boolean(user) && !ehClientePortal(user);
  return false;
}

export function conteudoDeAuditoria(valor: unknown): boolean {
  const linhas = Array.isArray(valor) ? valor : [valor];
  return linhas.some((linha) => {
    if (!linha || typeof linha !== 'object') return false;
    const registro = linha as Record<string, unknown>;
    const entidade = String(registro.entity || '');
    if ((ENTIDADES_AUDITORIA_LOG as readonly string[]).includes(entidade)) return true;
    const detalhes = typeof registro.details === 'string'
      ? registro.details
      : JSON.stringify(registro.details || '');
    return detalhes.includes('snapshot_data') || detalhes.includes('"revenue_value"');
  });
}

export function podeGravarConsultaFinanceira(
  user: PrincipalFinanceiro | null | undefined,
  tabela: string,
  valores: unknown,
): boolean {
  if (!podeLerConsultaFinanceira(user, tabela)) return false;
  if (tabela === 'system_logs' && conteudoDeAuditoria(valores)) {
    return podeAcessarAuditoriaFaturamento(user);
  }
  if ((TABELAS_PRECO_EXTRA as readonly string[]).includes(tabela)) return podeGravarTabelasPreco(user);
  return true;
}

export function passosPermitidos(passos: PassoConsulta[]): boolean {
  if (!Array.isArray(passos) || passos.length === 0 || passos.length > 40) return false;
  return passos.every((passo) => typeof passo?.m === 'string' && METODOS.has(passo.m) && Array.isArray(passo.args));
}

export function escritaDoPedido(passos: PassoConsulta[]): boolean {
  return passos.some((passo) => ESCRITA.has(String(passo.m)));
}

export function valoresDoPedido(passos: PassoConsulta[]): unknown {
  const passo = passos.find((item) => ESCRITA.has(String(item.m)));
  return passo?.args?.[0];
}

export function filtrarLogDeAuditoria(user: PrincipalFinanceiro | null | undefined, data: unknown): unknown {
  if (podeAcessarAuditoriaFaturamento(user) || data == null) return data;
  const esconder = (linha: unknown) => conteudoDeAuditoria(linha);
  if (Array.isArray(data)) return data.filter((linha) => !esconder(linha));
  if (typeof data === 'object' && esconder(data)) return null;
  return data;
}
