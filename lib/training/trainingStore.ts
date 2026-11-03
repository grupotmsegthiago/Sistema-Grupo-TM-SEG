import { supabase } from '../supabase';
import { normalizarModulos } from './operadorAcademy';

export type TrainingSession = {
  id?: string | number;
  trainingRequired?: boolean | null;
  trainingPassedAt?: string | null;
  trainingModules?: string[];
  trainingScore?: number | null;
};

export function atualizarUsuarioLocal(patch: Partial<TrainingSession>) {
  try {
    const raw = localStorage.getItem('userData');
    const user = raw ? JSON.parse(raw) : {};
    localStorage.setItem('userData', JSON.stringify({ ...user, ...patch }));
  } catch {
    /* sessão segue no banco */
  }
}

export async function gravarModuloAssistido(userId: string | number, moduleId: string, atuais: string[]) {
  const next = atuais.includes(moduleId) ? atuais : [...atuais, moduleId];
  const { error } = await supabase.from('system_users').update({ training_modules: next }).eq('id', userId);
  if (error) throw new Error(error.message);
  atualizarUsuarioLocal({ trainingModules: next });
  return next;
}

export async function gravarProva(userId: string | number, acertos: number, passou: boolean) {
  const patch: { training_score: number; training_passed_at?: string } = { training_score: acertos };
  if (passou) patch.training_passed_at = new Date().toISOString();
  const { error } = await supabase.from('system_users').update(patch).eq('id', userId);
  if (error) throw new Error(error.message);
  const local: Partial<TrainingSession> = { trainingScore: acertos };
  if (passou && patch.training_passed_at) local.trainingPassedAt = patch.training_passed_at;
  atualizarUsuarioLocal(local);
}

export function modulosDaSessao(user: { trainingModules?: unknown } | null | undefined): string[] {
  return normalizarModulos(user?.trainingModules);
}
