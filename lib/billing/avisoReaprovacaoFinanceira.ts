import { normalizePersonName } from '../financeSupervisorAccess';

/** Quem recebe o aviso quando o perfil financeiro reaprova uma OS já aprovada. */
export function usuarioRecebeAvisoReaprovacao(user: {
  name?: string | null;
  role?: string | null;
}): boolean {
  const role = normalizePersonName(user.role);
  const name = normalizePersonName(user.name);
  if (role === 'diretoria') return true;
  if (name.includes('thiago moreira')) return true;
  return false;
}
