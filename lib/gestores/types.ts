/**
 * Framework de Gestores — Grupo TM SEG
 * Preparado para: Comercial, Operacional, Financeiro, Contábil, RH, Administrativo, Inteligência.
 * Cada gestor registra screens, permissões e chave de settings — sem refatorar o núcleo.
 */

export type GestorKey =
  | 'comercial'
  | 'operacional'
  | 'financeiro'
  | 'contabil'
  | 'rh'
  | 'administrativo'
  | 'inteligencia';

export interface GestorScreenDef {
  id: string;
  name: string;
  /** Se true, só visão plena (Diretoria/Admin). Comercial escopado não vê. */
  diretoriaOnly?: boolean;
}

export interface GestorDefinition {
  key: GestorKey;
  name: string;
  description: string;
  /** Prefixo dos screen ids (ex.: gc-) */
  screenPrefix: string;
  screens: GestorScreenDef[];
  /** Screen principal do módulo */
  homeScreen: string;
}

export interface GestorUserContext {
  id?: string;
  name?: string | null;
  role?: string | null;
  permissions?: string[];
  email?: string | null;
}
