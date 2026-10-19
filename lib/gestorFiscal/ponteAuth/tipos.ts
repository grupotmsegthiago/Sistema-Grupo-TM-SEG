/** Tipos da ponte isolada. Não representam usuários reais. */

export type PerfilPonte =
  | 'Diretoria'
  | 'Financeiro'
  | 'Operador'
  | 'Avançado'
  | 'Cliente';

export interface UsuarioConfiavel {
  id: string;
  status: 'Ativo' | 'Inativo';
  perfil: PerfilPonte;
  permissoes: readonly string[];
  /** Vazio significa o grupo inteiro, só para quem já tem permissão. */
  empresas: readonly string[];
  /** Preenchido apenas no portal. O pedido do navegador não altera este valor. */
  clienteId: string | null;
}

export type AcaoPonte = 'ler_os' | 'ler_financeiro' | 'ler_faturamento' | 'ler_portal';

export interface PedidoConsulta {
  acao: AcaoPonte;
  /** Ignorado como prova. Só é aceito se já estiver na ficha do servidor. */
  empresaInformada: string | null;
  clienteInformado: string | null;
  perfilInformado: string | null;
  permissoesInformadas: readonly string[];
  limite: number;
}

export interface LinhaFicticia {
  empresaId: string;
  clienteId: string;
  os: number;
  financeiroCentavos: number;
}

export interface ResultadoConsulta {
  ok: boolean;
  codigo: string;
  motivo: string;
  linhas: readonly LinhaFicticia[];
}

export interface LogPonte {
  codigo: string;
  acao: AcaoPonte | null;
  usuarioId: string | null;
}
