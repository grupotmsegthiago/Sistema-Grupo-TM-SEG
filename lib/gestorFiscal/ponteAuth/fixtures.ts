/**
 * Identidades e números fictícios. Não há senha, CNPJ real nem lançamento de produção.
 */
import type { LinhaFicticia, UsuarioConfiavel } from './tipos';

export const USUARIOS_FICTICIOS: readonly UsuarioConfiavel[] = [
  { id: 'usr-diretoria', status: 'Ativo', perfil: 'Diretoria', permissoes: ['gestor-fiscal'], empresas: [], clienteId: null },
  { id: 'usr-faturamento', status: 'Ativo', perfil: 'Diretoria', permissoes: ['diretoria-faturamento'], empresas: [], clienteId: null },
  { id: 'usr-financeiro', status: 'Ativo', perfil: 'Financeiro', permissoes: ['fin-dashboard'], empresas: ['FX-GESTAO'], clienteId: null },
  { id: 'usr-operador', status: 'Ativo', perfil: 'Operador', permissoes: ['missions'], empresas: [], clienteId: null },
  { id: 'usr-avancado', status: 'Ativo', perfil: 'Avançado', permissoes: ['*'], empresas: [], clienteId: null },
  { id: 'usr-portal', status: 'Ativo', perfil: 'Cliente', permissoes: ['portal-only'], empresas: [], clienteId: 'cli-a' },
  { id: 'usr-inativo', status: 'Inativo', perfil: 'Diretoria', permissoes: ['gestor-fiscal', 'diretoria-faturamento'], empresas: [], clienteId: null },
];

export const LIVRO_FICTICIO: readonly LinhaFicticia[] = [
  { empresaId: 'FX-GESTAO', clienteId: 'cli-a', os: 2, financeiroCentavos: 100 },
  { empresaId: 'FX-SEG', clienteId: 'cli-b', os: 1, financeiroCentavos: 50 },
];

export function copiaUsuarios(): UsuarioConfiavel[] {
  return USUARIOS_FICTICIOS.map((usuario) => ({
    ...usuario,
    permissoes: [...usuario.permissoes],
    empresas: [...usuario.empresas],
  }));
}
