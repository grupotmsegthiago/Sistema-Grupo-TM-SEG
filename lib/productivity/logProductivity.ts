import { supabase } from '../supabase';

export type ProductivityAction =
  | 'IDLE_CHALLENGE_SHOWN'
  | 'IDLE_CHALLENGE_PASSED'
  | 'IDLE_CHALLENGE_FAILED'
  | 'IDLE_CHALLENGE_TIMEOUT'
  | 'PRODUCTIVITY_STATS';

function readUser(): { name: string; id: string } {
  try {
    const u = JSON.parse(localStorage.getItem('userData') || '{}');
    return {
      name: String(u?.name || 'Sistema'),
      id: String(u?.id ?? 'unknown'),
    };
  } catch {
    return { name: 'Sistema', id: 'unknown' };
  }
}

export async function logProductivityEvent(
  action: ProductivityAction,
  details: Record<string, unknown>,
): Promise<void> {
  const user = readUser();
  try {
    const { error } = await supabase.from('system_logs').insert([
      {
        user_name: user.name,
        action_type: action,
        entity: 'Productivity',
        entity_id: user.id,
        details: JSON.stringify({ ...details, at: new Date().toISOString() }),
        created_at: new Date().toISOString(),
      },
    ]);
    if (error) {
      console.warn('[Productivity] log falhou:', error.message);
    }
  } catch (e) {
    console.warn('[Productivity] log erro:', e);
  }
}
