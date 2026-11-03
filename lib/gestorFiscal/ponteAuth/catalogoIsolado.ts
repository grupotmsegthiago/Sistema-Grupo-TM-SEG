/** Cadastros fictícios do repositório isolado. Não há CNPJ real. */

export interface ClienteIsolado {
  id: string;
  empresaId: string;
  nome: string;
}

export interface FornecedorIsolado {
  id: string;
  empresaId: string;
  nome: string;
}

export const CLIENTES_ISOLADOS: readonly ClienteIsolado[] = [
  { id: 'cli-a', empresaId: 'FX-GESTAO', nome: 'Cliente Isolado A' },
  { id: 'cli-b', empresaId: 'FX-SEG', nome: 'Cliente Isolado B' },
];

export const FORNECEDORES_ISOLADOS: readonly FornecedorIsolado[] = [
  { id: 'for-1', empresaId: 'FX-GESTAO', nome: 'Fornecedor Isolado 1' },
  { id: 'for-2', empresaId: 'FX-SEG', nome: 'Fornecedor Isolado 2' },
];
