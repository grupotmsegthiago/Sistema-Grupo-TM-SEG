import type { GestorDefinition, GestorKey } from './types';
import { GESTOR_COMERCIAL_DEF } from './comercial/definition';

/**
 * Registro central dos gestores.
 * Futuros gestores (Operacional, Financeiro, etc.) entram aqui sem alterar o shell.
 */
const REGISTRY: Record<string, GestorDefinition> = {
  [GESTOR_COMERCIAL_DEF.key]: GESTOR_COMERCIAL_DEF,
};

export function registerGestor(def: GestorDefinition): void {
  REGISTRY[def.key] = def;
}

export function getGestor(key: GestorKey): GestorDefinition | undefined {
  return REGISTRY[key];
}

export function listGestores(): GestorDefinition[] {
  return Object.values(REGISTRY);
}

export function isGestorScreen(screenId: string): boolean {
  return listGestores().some(
    (g) => screenId === g.homeScreen || screenId.startsWith(g.screenPrefix),
  );
}

export function getGestorByScreen(screenId: string): GestorDefinition | undefined {
  return listGestores().find(
    (g) => screenId === g.homeScreen || screenId.startsWith(g.screenPrefix),
  );
}
