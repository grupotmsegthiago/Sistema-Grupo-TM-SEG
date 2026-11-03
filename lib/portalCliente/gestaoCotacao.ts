/** Decisões da gestão da cotação. Não grava banco e não envia e-mail. */

export const STATUS_INATIVA = 'Inativa';
export const STATUS_EXCLUIDA = 'Excluida';

export type AtorCotacao = {
  nome: string;
  email: string;
  perfil: string;
  /** Quando vem do portal, a cotação tem de ser desse cliente. */
  portalCliente?: string | null;
};

export type CotacaoGestao = {
  id?: string;
  client_name?: string | null;
  created_by?: string | null;
  solicitanteEmail?: string | null;
  status?: string | null;
  is_active?: boolean | null;
  converted_to_order_id?: string | null;
  origin?: string | null;
  destination?: string | null;
  total_km?: number | null;
  total_value?: number | null;
  created_at?: string | null;
  contract_details?: string | null;
};

function normalizar(valor: string | null | undefined): string {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function reais(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function textoTarifaKm(valor: number | null | undefined): string {
  if (valor == null || !Number.isFinite(valor) || valor <= 0) return '—';
  return `${reais(valor)}/km`;
}

export function textoHoraExtra(valor: number | null | undefined): string {
  if (valor == null || !Number.isFinite(valor) || valor <= 0) return '—';
  return `${reais(valor)}/h`;
}

export function perfilPodeGerirCotacao(perfil: string | null | undefined): boolean {
  const nome = normalizar(perfil);
  return nome === 'diretoria' || nome === 'administrador' || nome === 'admin';
}

export function clienteDaMesmaCasa(portal: string | null | undefined, cotacao: string | null | undefined): boolean {
  const a = normalizar(portal);
  const b = normalizar(cotacao);
  if (!a || !b) return false;
  if (a.includes('ceva') && b.includes('ceva')) return true;
  if ((a.includes('ibl') || a.includes('intermodal')) && (b.includes('ibl') || b.includes('intermodal'))) return true;
  return a === b || a.includes(b) || b.includes(a);
}

export function autorDaCotacao(ator: AtorCotacao, cotacao: CotacaoGestao): boolean {
  if (ator.portalCliente && !clienteDaMesmaCasa(ator.portalCliente, cotacao.client_name)) return false;
  const nome = normalizar(ator.nome);
  const autor = normalizar(cotacao.created_by);
  if (nome && autor && nome === autor) return true;
  const email = normalizar(ator.email);
  const emailAutor = normalizar(cotacao.solicitanteEmail);
  return Boolean(email && emailAutor && email === emailAutor);
}

/** Quem usa o sistema interno, sem ser pessoa do portal do cliente. */
export function usuarioInternoCotacao(ator: AtorCotacao): boolean {
  return !String(ator.portalCliente || '').trim();
}

export function ehDiretoria(perfil: string | null | undefined): boolean {
  return normalizar(perfil) === 'diretoria';
}

/** Desativar fica com a equipe interna. Excluir fica só com a diretoria. */
export function podeDesativarCotacao(ator: AtorCotacao): boolean {
  return usuarioInternoCotacao(ator);
}

export function podeExcluirCotacao(ator: AtorCotacao): boolean {
  return ehDiretoria(ator.perfil);
}

export function mostrarDesativarCotacao(ator: AtorCotacao, cotacao: CotacaoGestao): boolean {
  if (!podeDesativarCotacao(ator)) return false;
  if (cotacaoConvertidaEmOs(cotacao) || cotacaoExcluida(cotacao)) return false;
  if (cotacao.is_active === false || normalizar(cotacao.status) === 'inativa') return false;
  return true;
}

export function mostrarExcluirCotacao(ator: AtorCotacao, cotacao: CotacaoGestao): boolean {
  if (!podeExcluirCotacao(ator)) return false;
  if (cotacaoConvertidaEmOs(cotacao) || cotacaoExcluida(cotacao)) return false;
  return true;
}

/** Administrador e diretoria gerem. No portal, só as cotações daquele cliente. O autor gerencia a própria. */
export function podeGerirCotacao(ator: AtorCotacao, cotacao: CotacaoGestao): boolean {
  if (perfilPodeGerirCotacao(ator.perfil)) {
    if (ator.portalCliente) return clienteDaMesmaCasa(ator.portalCliente, cotacao.client_name);
    return true;
  }
  return autorDaCotacao(ator, cotacao);
}

export function cotacaoConvertidaEmOs(cotacao: CotacaoGestao): boolean {
  return Boolean(String(cotacao.converted_to_order_id || '').trim());
}

export function cotacaoExcluida(cotacao: { status?: string | null }): boolean {
  return normalizar(cotacao.status) === normalizar(STATUS_EXCLUIDA);
}

export function decisaoInativar(ator: AtorCotacao, cotacao: CotacaoGestao | null): { ok: true; dados: { is_active: false; status: string } } | { ok: false; status: number; error: string } {
  if (!cotacao?.id) return { ok: false, status: 404, error: 'Cotação não encontrada.' };
  if (!podeDesativarCotacao(ator)) return { ok: false, status: 403, error: 'Você não pode desativar esta cotação.' };
  if (cotacaoConvertidaEmOs(cotacao)) return { ok: false, status: 409, error: 'Essa cotação já virou OS e não pode ser inativada.' };
  return { ok: true, dados: { is_active: false, status: STATUS_INATIVA } };
}

export function decisaoExcluir(ator: AtorCotacao, cotacao: CotacaoGestao | null): { ok: true; dados: { is_active: false; status: string } } | { ok: false; status: number; error: string } {
  if (!cotacao?.id) return { ok: false, status: 404, error: 'Cotação não encontrada.' };
  if (!podeExcluirCotacao(ator)) return { ok: false, status: 403, error: 'Só a diretoria pode excluir esta cotação.' };
  if (cotacaoConvertidaEmOs(cotacao)) return { ok: false, status: 409, error: 'Essa cotação já virou OS e não pode ser excluída.' };
  return { ok: true, dados: { is_active: false, status: STATUS_EXCLUIDA } };
}

export function emailsDaCopia(bruto: string | null | undefined): { ok: true; lista: string[] } | { ok: false; error: string } {
  const partes = String(bruto || '').split(/[;,]/).map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (partes.length > 8) return { ok: false, error: 'Informe no máximo 8 e-mails em cópia.' };
  if (partes.some((item) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item))) return { ok: false, error: 'Há um e-mail de cópia inválido.' };
  return { ok: true, lista: partes };
}

/** Cópia fixa de toda proposta enviada. */
export const COPIA_FIXA_COTACAO = 'thiago@grupotmseg.com.br';

/**
 * O primeiro e-mail escolhido é o destino.
 * A cópia leva os demais escolhidos, thiago@grupotmseg.com.br
 * e quem fez a cotação. Se quem fez foi usuário interno, entra o e-mail dele.
 */
export function montarDestinatariosEnvio(entrada: {
  selecionados?: string | null;
  autor?: string | null;
}): { ok: true; para: string; copias: string[] } | { ok: false; error: string } {
  const selecionados = String(entrada.selecionados || '').split(/[;,]/).map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (selecionados.length === 0) return { ok: false, error: 'Informe um e-mail válido.' };
  if (selecionados.length > 8) return { ok: false, error: 'Informe no máximo 8 e-mails.' };
  if (selecionados.some((item) => !emailDestinoValido(item))) return { ok: false, error: 'Há um e-mail selecionado inválido.' };
  const autor = String(entrada.autor || '').trim().toLowerCase();
  const para = selecionados[0];
  const vistos = new Set<string>([para]);
  const copias: string[] = [];
  for (const email of [...selecionados.slice(1), COPIA_FIXA_COTACAO, autor]) {
    if (!emailDestinoValido(email) || vistos.has(email)) continue;
    vistos.add(email);
    copias.push(email);
  }
  return { ok: true, para, copias };
}

export function emailDestinoValido(bruto: string | null | undefined): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(bruto || '').trim().toLowerCase());
}

export function cartaEmailCotacao(entrada: {
  origem?: string | null;
  destino?: string | null;
  km?: number | null;
  valor?: number | null;
  mensagem?: string | null;
}): string {
  const km = Number(entrada.km);
  const valor = Number(entrada.valor);
  const resumo = [
    'Proposta comercial — Grupo TM SEG',
    '',
    `Origem: ${String(entrada.origem || '').trim() || '—'}`,
    `Destino: ${String(entrada.destino || '').trim() || '—'}`,
    `Distância: ${Number.isFinite(km) && km > 0 ? `${km.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km` : '—'}`,
    `Valor total: ${Number.isFinite(valor) ? reais(valor) : '—'}`,
    '',
    'O pedágio é cobrado à parte.',
    'A cotação segue em anexo.',
  ].join('\n');
  const mensagem = String(entrada.mensagem || '').trim().slice(0, 2000);
  return mensagem ? `${mensagem}\n\n${resumo}` : resumo;
}

/** Quem vê a cotação pode enviar. Inativar e excluir continuam restritos. */
export function podeEnviarCotacao(ator: AtorCotacao, cotacao: CotacaoGestao): boolean {
  if (cotacaoExcluida(cotacao)) return false;
  if (ator.portalCliente) return clienteDaMesmaCasa(ator.portalCliente, cotacao.client_name);
  return true;
}

/** Aceita o PDF já em Base64. Não baixa arquivo. */
export function pdfAnexoAceito(bruto: string | null | undefined): { ok: true; base64: string } | { ok: false; error: string } {
  const texto = String(bruto || '').trim();
  // O jsPDF manda data:application/pdf;filename=generated.pdf;base64,...
  const base64 = (texto.includes(',') && /^data:/i.test(texto) ? texto.slice(texto.indexOf(',') + 1) : texto).replace(/\s/g, '');
  if (base64.length < 80 || !/^[A-Za-z0-9+/=]+$/.test(base64)) return { ok: false, error: 'O PDF da cotação não veio no anexo.' };
  if (!base64.startsWith('JVBERi')) return { ok: false, error: 'O anexo não é um PDF.' };
  const bytes = Math.floor((base64.length * 3) / 4);
  if (bytes > 7_000_000) return { ok: false, error: 'O PDF passou do tamanho aceito para o e-mail.' };
  return { ok: true, base64 };
}

export function registroAuditoriaCotacao(entrada: {
  acao: 'cotacao_inativar' | 'cotacao_excluir';
  ator: AtorCotacao;
  cotacao: CotacaoGestao;
}): Record<string, unknown> {
  return {
    user_name: entrada.ator.nome || entrada.ator.email || 'Portal',
    action_type: entrada.acao,
    entity: 'quotes',
    entity_id: String(entrada.cotacao.id || ''),
    details: JSON.stringify({
      acao: entrada.acao,
      cotacao_id: entrada.cotacao.id || '',
      cliente: entrada.cotacao.client_name || '',
      autor: entrada.ator.nome,
      email: entrada.ator.email,
    }),
  };
}
