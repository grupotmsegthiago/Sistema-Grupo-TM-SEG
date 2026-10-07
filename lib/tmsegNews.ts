import { canAccessDiretoriaMenu, isPerfilDiretoria, type DiretoriaAccessUser } from './diretoriaAccess';
import { canAccessScreen, type ScreenAccessUser } from './screenAccess';
import { supabase } from './supabase';

export const ACAO_NEWS = 'TMSEG_NEWS';
export const ACAO_NEWS_VIEW = 'TMSEG_NEWS_VIEW';

export type TipoNoticia = 'informe' | 'cliente' | 'fornecedor' | 'atualizacao';

export type FotoAtualizacao = { url: string; legenda: string };

export type TreinamentoAtualizacao = {
  passos: string[];
  tela?: string;
};

export type Noticia = {
  id: string;
  titulo: string;
  texto: string;
  tipo: TipoNoticia;
  autor: string;
  quando: string;
  anexoNome?: string;
  anexoUrl?: string;
  /** Vazio: todo mundo de dentro. Com telas: só quem o perfil deixa abrir. */
  telas: string[];
  fotos: FotoAtualizacao[];
  treinamento?: TreinamentoAtualizacao;
};

/** Áreas que a diretoria marca ao publicar uma atualização. */
export const AREAS_ATUALIZACAO = [
  { id: 'dashboard', nome: 'Página inicial' },
  { id: 'missions', nome: 'Painel de OS' },
  { id: 'controle-diario', nome: 'Controle diário' },
  { id: 'diretoria-cockpit', nome: 'Cockpit' },
  { id: 'fin-dashboard', nome: 'Financeiro' },
  { id: 'rh-employees', nome: 'RH' },
  { id: 'rh-timeclock', nome: 'Ponto' },
  { id: 'clients', nome: 'Clientes' },
  { id: 'providers', nome: 'Fornecedores' },
  { id: 'treinamento', nome: 'Treinamento' },
] as const;

function guia(id: string, titulo: string, texto: string, telas: string[], tela: string, passos: string[], legenda: string): Noticia {
  return {
    id,
    titulo,
    texto,
    tipo: 'atualizacao',
    autor: 'Sistema',
    quando: '',
    telas,
    fotos: [{ url: `/atualizacoes/${id}.svg`, legenda }],
    treinamento: { tela, passos },
  };
}

/** O que já mudou no sistema. Cada item só aparece para quem acessa uma das telas. */
export const ATUALIZACOES_SISTEMA: Noticia[] = [
  guia(
    'sys-meu-portal',
    'Meu Portal',
    'A área pessoal reúne ponto, escala, holerites, documentos, documentação profissional, solicitações, comunicados e dados. Férias continuam fora.',
    ['dashboard'],
    'meu-portal',
    [
      'Na home, clique no card Meu Portal.',
      'Confira ponto de hoje, banco de horas, próxima escala e pendências.',
      'Abra o módulo que precisa: ponto, holerite, documentos ou solicitações.',
    ],
    'Card Meu Portal na página inicial',
  ),
  guia(
    'sys-treinamento',
    'Treinamento mostra quem assistiu',
    'Cada aula da trilha do operador indica se a pessoa já assistiu ou ainda não assistiu. O atalho abre o treinamento.',
    ['treinamento'],
    'treinamento',
    [
      'Na home, olhe o bloco Treinamento.',
      'O balão verde é Assistiu. O cinza é Não assistiu.',
      'Clique na aula para abrir e assistir até o fim.',
    ],
    'Balões de aula assistida e não assistida',
  ),
  guia(
    'sys-dhl-viaturas',
    'Viaturas para comunicar à DHL',
    'No Painel de OS, a viatura finalizada aparece por região. Quem copia fica visível para a equipe. Sem cópia em 30 minutos, ela vai para Não encaminhadas.',
    ['missions'],
    'missions',
    [
      'Abra o Painel de OS e veja o painel de viaturas por região.',
      'Clique em Comunicar a DHL e cole no grupo. O seu nome aparece para a equipe.',
      'Se outra pessoa já copiou, não envie de novo.',
    ],
    'Painel de viaturas finalizadas por região',
  ),
  guia(
    'sys-ocorrencias',
    'Ocorrências em uma linha',
    'A lista em aberto ficou em uma linha por ocorrência. A rota aparece como Cidade - UF x Cidade - UF. Código de mapa vira a cidade.',
    ['diretoria-cockpit', 'fin-dashboard'],
    'diretoria-cockpit',
    [
      'Abra Ocorrências em aberto. O número fica visível com a lista fechada.',
      'Leia a rota no formato Cidade - UF x Cidade - UF.',
      'No financeiro, clique em Resolvido, escreva o que foi feito e confirme.',
    ],
    'Ocorrência em uma linha com a rota em cidade e UF',
  ),
  guia(
    'sys-carta-tabela',
    'Carta da tabela que não combina',
    'Quando a tabela não combina com a rota, a carta chega só para quem abriu a OS. O texto do erro não fica aberto para o restante da equipe.',
    ['missions', 'diretoria-cockpit'],
    'missions',
    [
      'No cockpit, a linha mostra Carta para quem abriu a OS.',
      'Quem abriu entra na própria caixa e lê só a sua carta.',
      'Abra a OS no auditador e ajuste a tabela da rota.',
    ],
    'Carta interna só para quem abriu a OS',
  ),
  guia(
    'sys-pedagio',
    'Erro de pedágio vai para quem alterou',
    'Quem encontra um erro no pedágio escreve o que está errado. A carta chega para a última pessoa que alterou aquele valor, e ela mesma corrige.',
    ['fin-dashboard', 'missions'],
    'missions',
    [
      'Na auditoria da OS, veja quem alterou o pedágio por último.',
      'Clique em Reportar erro para essa pessoa e escreva o que está errado.',
      'Quem recebeu a carta abre a OS, corrige o valor e salva.',
    ],
    'Reportar erro de pedágio para quem alterou',
  ),
];

export type UsuarioNews = DiretoriaAccessUser & ScreenAccessUser & {
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

/** Sem telas, o aviso é geral. Com telas, só entra quem o perfil deixa abrir pelo menos uma. */
export function usuarioVeItem(user: UsuarioNews | null | undefined, telas: string[] | null | undefined): boolean {
  if (!podeVerNews(user)) return false;
  const lista = (telas || []).map((tela) => String(tela || '').trim()).filter(Boolean);
  if (!lista.length) return true;
  return lista.some((tela) => canAccessScreen(user, tela));
}

export function atualizacoesVisiveis(user: UsuarioNews | null | undefined): Noticia[] {
  return ATUALIZACOES_SISTEMA.filter((item) => usuarioVeItem(user, item.telas));
}

export function separarLeitura(publico: string[], leram: string[]): { leu: string[]; naoLeu: string[] } {
  const chaves = new Set(nomesQueViram(leram).map((nome) => limpa(nome)));
  const pessoas = nomesQueViram(publico);
  return {
    leu: pessoas.filter((nome) => chaves.has(limpa(nome))),
    naoLeu: pessoas.filter((nome) => !chaves.has(limpa(nome))),
  };
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

export function normalizarFotos(valor: unknown, anexoUrl?: string, anexoNome?: string): FotoAtualizacao[] {
  const fotos: FotoAtualizacao[] = [];
  if (Array.isArray(valor)) {
    for (const item of valor) {
      if (!item || typeof item !== 'object') continue;
      const row = item as { url?: string; legenda?: string };
      const url = String(row.url || '').trim();
      if (!url) continue;
      fotos.push({ url, legenda: String(row.legenda || 'Foto').trim() || 'Foto' });
    }
  }
  const anexo = String(anexoUrl || '').trim();
  if (!fotos.length && anexo && /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(anexo)) {
    fotos.push({ url: anexo, legenda: String(anexoNome || 'Foto').trim() || 'Foto' });
  }
  return fotos;
}

export function normalizarTreinamento(valor: unknown): TreinamentoAtualizacao | undefined {
  if (!valor || typeof valor !== 'object') return undefined;
  const row = valor as { passos?: unknown; tela?: string };
  const passos = Array.isArray(row.passos)
    ? row.passos.map((passo) => String(passo || '').trim()).filter((passo) => passo.length > 2)
    : [];
  const tela = String(row.tela || '').trim();
  if (!passos.length && !tela) return undefined;
  return { passos, tela: tela || undefined };
}

export function noticiaDoLog(row: {
  id?: string;
  entity_id?: string;
  user_name?: string;
  details?: string;
  created_at?: string;
}): Noticia | null {
  let detalhe: { titulo?: string; texto?: string; tipo?: string; autor?: string; anexoNome?: string; anexoUrl?: string; telas?: unknown; fotos?: unknown; treinamento?: unknown } = {};
  try {
    const parsed = JSON.parse(String(row.details || '{}'));
    if (parsed && typeof parsed === 'object') detalhe = parsed;
  } catch {
    return null;
  }
  const texto = String(detalhe.texto || '').trim();
  const titulo = String(detalhe.titulo || '').trim();
  if (!texto || !titulo) return null;
  const tipo = detalhe.tipo === 'cliente' || detalhe.tipo === 'fornecedor' || detalhe.tipo === 'atualizacao'
    ? detalhe.tipo
    : 'informe';
  const telas = Array.isArray(detalhe.telas) ? detalhe.telas.map((tela) => String(tela || '').trim()).filter(Boolean) : [];
  return {
    id: String(row.entity_id || row.id || ''),
    titulo,
    texto,
    tipo,
    autor: String(detalhe.autor || row.user_name || 'Diretoria').trim(),
    quando: quandoDe(String(row.created_at || '')),
    anexoNome: String(detalhe.anexoNome || '').trim() || undefined,
    anexoUrl: String(detalhe.anexoUrl || '').trim() || undefined,
    telas,
    fotos: normalizarFotos(detalhe.fotos, detalhe.anexoUrl, detalhe.anexoNome),
    treinamento: normalizarTreinamento(detalhe.treinamento),
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
  telas?: string[];
  fotos?: FotoAtualizacao[];
  treinamento?: TreinamentoAtualizacao;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const titulo = String(input.titulo || '').trim();
  const texto = String(input.texto || '').replace(/\s+/g, ' ').trim();
  const autor = String(input.autor || '').trim() || 'Diretoria';
  const anexoNome = String(input.anexoNome || '').trim();
  const anexoUrl = String(input.anexoUrl || '').trim();
  const telas = (input.telas || []).map((tela) => String(tela || '').trim()).filter(Boolean);
  const fotos = normalizarFotos(input.fotos);
  const treinamento = normalizarTreinamento(input.treinamento);
  if (titulo.length < 3 || texto.length < 5) return { ok: false, error: 'Escreva o título e o descritivo do que foi alterado.' };
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
      telas,
      fotos,
      treinamento,
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
