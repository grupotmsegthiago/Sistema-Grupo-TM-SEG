import { supabase } from '../supabase';

const CHAVE = 'tmseg-plano-acao:';
const CHAVE_CTX = 'tmseg-plano-acao-ctx:';
const CHAVE_VERSOES = 'tmseg-plano-acao-versoes:';

export interface VersaoRelatorioLocal {
  quando: string;
  html: string;
}

export interface ContextoPlanoSalvo {
  problema: string;
  relato: string;
}

export function extrairProblemaDoHtml(html: string): string {
  const bloco = String(html || '').match(/data-campo="ocorrencia-apurada"[\s\S]*?<p>([\s\S]*?)<\/p>/i);
  if (!bloco) return '';
  const texto = bloco[1]
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
  if (/não é, por si só, fato comprovado/i.test(texto)) return '';
  return texto;
}

export function lerContextoLocal(missionId: string): ContextoPlanoSalvo | null {
  try {
    const bruto = localStorage.getItem(CHAVE_CTX + String(missionId || '').trim());
    if (!bruto) return null;
    const lido = JSON.parse(bruto) as Partial<ContextoPlanoSalvo>;
    return {
      problema: String(lido.problema || ''),
      relato: String(lido.relato || ''),
    };
  } catch {
    return null;
  }
}

export function salvarContextoLocal(missionId: string, contexto: ContextoPlanoSalvo): void {
  try {
    localStorage.setItem(CHAVE_CTX + String(missionId || '').trim(), JSON.stringify({
      problema: contexto.problema,
      relato: contexto.relato,
    }));
  } catch { /* o HTML salvo segue como a versão do documento */ }
}

export function planoSalvoCompativel(html: string | null | undefined): boolean {
  const texto = String(html || '');
  if (texto.includes('data-tipo="operacional"')) return true;
  return texto.includes('data-secao="procedimento"') && texto.includes('>AC-01<');
}

function limparHtml(html: string): string {
  return html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
}

export function lerVersoesLocais(missionId: string): VersaoRelatorioLocal[] {
  try {
    const bruto = localStorage.getItem(CHAVE_VERSOES + String(missionId || '').trim());
    if (!bruto) return [];
    const lista = JSON.parse(bruto) as VersaoRelatorioLocal[];
    return Array.isArray(lista) ? lista.filter((item) => item && item.html) : [];
  } catch {
    return [];
  }
}

function arquivarVersaoLocal(missionId: string, htmlAnterior: string) {
  const anterior = String(htmlAnterior || '').trim();
  if (!anterior) return;
  const lista = lerVersoesLocais(missionId);
  if (lista[0]?.html === anterior) return;
  lista.unshift({ quando: new Date().toISOString(), html: anterior });
  try {
    localStorage.setItem(CHAVE_VERSOES + missionId, JSON.stringify(lista.slice(0, 12)));
  } catch { /* a versão nova segue no banco */ }
}

export async function lerCapaRelatorio(missionId: string): Promise<{ existe: boolean; quando: string | null; versao: number }> {
  const id = String(missionId || '').trim();
  if (!id) return { existe: false, quando: null, versao: 0 };
  const { data, error } = await supabase.from('os_action_plans').select('html, updated_at').eq('mission_id', id).maybeSingle();
  const remoto = !error && data && typeof (data as { html?: unknown }).html === 'string'
    ? String((data as { html: string }).html).trim()
    : '';
  const quando = !error && data ? String((data as { updated_at?: string }).updated_at || '') || null : null;
  if (remoto) {
    return { existe: true, quando, versao: lerVersoesLocais(id).length + 1 };
  }
  try {
    const local = localStorage.getItem(CHAVE + id);
    if (local) return { existe: true, quando: null, versao: lerVersoesLocais(id).length + 1 };
  } catch { /* segue sem capa */ }
  return { existe: false, quando: null, versao: 0 };
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
  try {
    const localAnterior = localStorage.getItem(CHAVE + id);
    if (localAnterior && localAnterior !== limpo) arquivarVersaoLocal(id, localAnterior);
  } catch { /* segue a gravação */ }
  const { data: atual } = await supabase.from('os_action_plans').select('html').eq('mission_id', id).maybeSingle();
  const remotoAnterior = atual && typeof (atual as { html?: unknown }).html === 'string'
    ? String((atual as { html: string }).html)
    : '';
  if (remotoAnterior && remotoAnterior !== limpo) arquivarVersaoLocal(id, remotoAnterior);
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
