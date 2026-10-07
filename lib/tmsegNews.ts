import { canAccessDiretoriaMenu, isPerfilDiretoria, type DiretoriaAccessUser } from './diretoriaAccess';
import { supabase } from './supabase';

export const ACAO_NEWS = 'TMSEG_NEWS';
export const ACAO_NEWS_VIEW = 'TMSEG_NEWS_VIEW';

export type TipoNoticia = 'informe' | 'cliente' | 'fornecedor';

export type Noticia = {
  id: string;
  titulo: string;
  texto: string;
  tipo: TipoNoticia;
  autor: string;
  quando: string;
  anexoNome?: string;
  anexoUrl?: string;
};

export type UsuarioNews = DiretoriaAccessUser & {
  clientId?: string | null;
  providerId?: string | null;
};

function limpa(valor: string): string {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Diretoria (perfil) e o cockpit dos Thiagos publicam e veem quem leu. */
export function podePublicarNews(user: UsuarioNews | null | undefined): boolean {
  return isPerfilDiretoria(user) || canAccessDiretoriaMenu(user);
}

/** Cliente e fornecedor de fora não entram no mural interno. */
export function podeVerNews(user: UsuarioNews | null | undefined): boolean {
  if (!user) return false;
  if (user.clientId || user.providerId) return false;
  const role = limpa(String(user.role || ''));
  if (!role) return true;
  if (role === 'cliente' || role === 'client' || role === 'fornecedor' || role === 'provider') return false;
  return true;
}

export function textoParabensCadastro(
  tipo: 'cliente' | 'fornecedor',
  autor: string,
  nomeCadastro: string,
): { titulo: string; texto: string } {
  const quem = String(autor || '').trim() || 'Equipe';
  const nome = String(nomeCadastro || '').trim() || (tipo === 'cliente' ? 'um cliente' : 'um fornecedor');
  const palavra = tipo === 'cliente' ? 'cliente' : 'fornecedor';
  return {
    titulo: `${tipo === 'cliente' ? 'Cliente novo' : 'Fornecedor novo'}: ${nome}`,
    texto: `${quem}, parabéns. Você cadastrou o ${palavra} ${nome}. Obrigado pelo apoio. Cada cadastro novo fortalece a TM SEG e abre caminho para a equipe inteira. Seguimos juntos.`,
  };
}

function quandoDe(iso: string): string {
  if (!iso) return '';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  return data.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function noticiaDoLog(row: {
  id?: string;
  entity_id?: string;
  user_name?: string;
  details?: string;
  created_at?: string;
}): Noticia | null {
  let detalhe: { titulo?: string; texto?: string; tipo?: string; autor?: string; anexoNome?: string; anexoUrl?: string } = {};
  try {
    const parsed = JSON.parse(String(row.details || '{}'));
    if (parsed && typeof parsed === 'object') detalhe = parsed;
  } catch {
    return null;
  }
  const texto = String(detalhe.texto || '').trim();
  const titulo = String(detalhe.titulo || '').trim();
  if (!texto || !titulo) return null;
  const tipo = detalhe.tipo === 'cliente' || detalhe.tipo === 'fornecedor' ? detalhe.tipo : 'informe';
  return {
    id: String(row.entity_id || row.id || ''),
    titulo,
    texto,
    tipo,
    autor: String(detalhe.autor || row.user_name || 'Diretoria').trim(),
    quando: quandoDe(String(row.created_at || '')),
    anexoNome: String(detalhe.anexoNome || '').trim() || undefined,
    anexoUrl: String(detalhe.anexoUrl || '').trim() || undefined,
  };
}

export function nomesQueViram(nomes: string[]): string[] {
  const vistos = new Set<string>();
  const lista: string[] = [];
  for (const bruto of nomes) {
    const nome = String(bruto || '').trim();
    const chave = limpa(nome);
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    lista.push(nome);
  }
  return lista;
}

export async function publicarNews(input: {
  titulo: string;
  texto: string;
  tipo: TipoNoticia;
  autor: string;
  anexoNome?: string;
  anexoUrl?: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const titulo = String(input.titulo || '').trim();
  const texto = String(input.texto || '').replace(/\s+/g, ' ').trim();
  const autor = String(input.autor || '').trim() || 'Diretoria';
  const anexoNome = String(input.anexoNome || '').trim();
  const anexoUrl = String(input.anexoUrl || '').trim();
  if (titulo.length < 3 || texto.length < 5) return { ok: false, error: 'Escreva o título e a informação.' };
  const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`;
  const insert = await supabase.from('system_logs').insert([{
    user_name: autor,
    action_type: ACAO_NEWS,
    entity: 'News',
    entity_id: id,
    details: JSON.stringify({
      titulo,
      texto,
      tipo: input.tipo,
      autor,
      anexoNome: anexoNome || undefined,
      anexoUrl: anexoUrl || undefined,
    }),
  }]);
  if (insert.error) return { ok: false, error: insert.error.message };
  return { ok: true, id };
}

export async function publicarNovidadeCadastro(input: {
  tipo: 'cliente' | 'fornecedor';
  nomeCadastro: string;
  autor: string;
}): Promise<void> {
  const recado = textoParabensCadastro(input.tipo, input.autor, input.nomeCadastro);
  const resultado = await publicarNews({ ...recado, tipo: input.tipo, autor: input.autor });
  if (!resultado.ok) console.warn('[tmseg-news]', resultado.error);
}
