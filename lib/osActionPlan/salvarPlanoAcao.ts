import { supabase } from '../supabase';

const CHAVE = 'tmseg-plano-acao:';

function limparHtml(html: string): string {
  return html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
}

export async function lerPlanoSalvo(missionId: string): Promise<string | null> {
  const id = String(missionId || '').trim();
  if (!id) return null;
  const { data, error } = await supabase.from('os_action_plans').select('html').eq('mission_id', id).maybeSingle();
  const remoto = !error && data && typeof (data as { html?: unknown }).html === 'string'
    ? String((data as { html: string }).html).trim()
    : '';
  if (remoto) return remoto;
  try {
    return localStorage.getItem(CHAVE + id);
  } catch {
    return null;
  }
}

export async function salvarPlanoAcaoOs(
  missionId: string,
  html: string,
  autor: string | null,
): Promise<{ ok: boolean; aviso: string }> {
  const id = String(missionId || '').trim();
  const limpo = limparHtml(html);
  if (!id || !limpo.trim()) return { ok: false, aviso: 'Nada para salvar.' };
  try { localStorage.setItem(CHAVE + id, limpo); } catch { /* o banco segue como destino */ }
  const { error } = await supabase.from('os_action_plans').upsert({
    mission_id: id,
    html: limpo,
    updated_by: autor,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'mission_id' });
  if (error) return { ok: true, aviso: 'Salvo neste navegador. O banco ainda não guardou esta versão.' };
  return { ok: true, aviso: 'Plano salvo.' };
}
