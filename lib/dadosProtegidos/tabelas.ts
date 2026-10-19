/** As dez tabelas do corte P0. O navegador não as consulta mais com a chave anônima. */

export const TABELAS_PROTEGIDAS = [
  'missions',
  'clients',
  'client_price_tables',
  'provider_cost_tables',
  'financial_transactions',
  'financial_categories',
  'financial_invoices',
  'financial_invoice_missions',
  'providers',
  'financial_accounts',
] as const;

export type TabelaProtegida = (typeof TABELAS_PROTEGIDAS)[number];

const CONJUNTO = new Set<string>(TABELAS_PROTEGIDAS);

const FINANCEIRAS = new Set<string>([
  'financial_transactions',
  'financial_categories',
  'financial_invoices',
  'financial_invoice_missions',
  'financial_accounts',
]);

export function ehTabelaProtegida(nome: string): nome is TabelaProtegida {
  return CONJUNTO.has(nome);
}

export function ehTabelaFinanceira(nome: string): boolean {
  return FINANCEIRAS.has(nome);
}

export interface FichaServidor {
  id: string;
  status: string;
  perfil: string;
  permissoes: string[];
  clienteId: string | null;
}

function dobrar(valor: string): string {
  return valor.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function portal(ficha: FichaServidor): boolean {
  return ficha.permissoes.some((item) => item === 'portal-only' || item.startsWith('portal:') || item.startsWith('portal-perfil:'));
}

function escreveFinanceiro(ficha: FichaServidor): boolean {
  const perfil = dobrar(ficha.perfil);
  if (perfil === 'avancado') return false;
  if (perfil === 'diretoria' || perfil === 'financeiro' || perfil === 'administrador' || perfil === 'ceo') return true;
  return ficha.permissoes.some((item) =>
    item === '*' || item === 'fin-dashboard' || item === 'finance-group' || item === 'diretoria-faturamento',
  );
}

/** Autorização pela ficha relida no servidor. Perfil enviado pelo navegador não entra. */
export function autorizarTabela(
  ficha: FichaServidor | null,
  tabela: string,
  method: string,
): 'ok' | 'sem_autenticacao' | 'sem_permissao' {
  if (!ficha || ficha.status !== 'Ativo') return 'sem_autenticacao';
  if (!ehTabelaProtegida(tabela)) return 'sem_permissao';
  const escrita = method !== 'GET' && method !== 'HEAD';
  if (portal(ficha)) {
    if (escrita || ehTabelaFinanceira(tabela)) return 'sem_permissao';
    if (tabela === 'missions' || tabela === 'clients') return 'ok';
    return 'sem_permissao';
  }
  if (dobrar(ficha.perfil) === 'avancado' && ehTabelaFinanceira(tabela)) return 'sem_permissao';
  if (ehTabelaFinanceira(tabela) && escrita && !escreveFinanceiro(ficha)) return 'sem_permissao';
  return 'ok';
}
