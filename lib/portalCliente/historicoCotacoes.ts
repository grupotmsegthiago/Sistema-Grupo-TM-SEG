/** Histórico da cotação do portal. A OS continua em missions; esta gravação não recalcula valor aprovado. */

import { formatDateBR, formatDateTimeBR } from '../dateUtils';
import {
  FRANQUIA_HORAS,
  FRANQUIA_KM,
  PRAZO_COTACAO_MS,
  cotacaoConvertida,
  cotacaoVencida,
  type CotacaoPrazo,
  type VersaoTabelaRegional,
} from '../precificacao/tabela2027';
import { cidadeDaRota, type PropostaPortal } from './cotacao';
import { textoHoraExtra, textoTarifaKm } from './gestaoCotacao';
import { decodificarPolyline, type Coordenada } from './rotaCotacao';
import {
  conferirTrechosGravados,
  lerTrechosPersistidos,
  recusarPisoDaProposta,
  type TrechoPersistido,
} from './trechosProposta';

export const TEXTO_HISTORICO_VAZIO = 'Nenhuma cotação recente deste cliente.';
export const TAMANHO_PAGINA_HISTORICO = 10;
export const JANELA_HISTORICO_VIGENCIA = 100;
export const KIND_PORTAL_COTACAO = 'PORTAL_COTACAO';

export type SnapshotCotacaoPortal = {
  kind: typeof KIND_PORTAL_COTACAO;
  duracaoMin: number | null;
  usouMinimo: boolean;
  regiao: string;
  kmFranquia: number;
  horasFranquia: number;
  kmExtra: number;
  horaExtra: number;
  acionamento: number;
  paradas: string[];
  solicitanteEmail: string;
  acordada: boolean;
  operacao: string;
  vigencia: VersaoTabelaRegional;
  numero: number | null;
  /** Km faturado gravado na hora da cotação. Depois de salvo, não muda. */
  kmFaturado?: number | null;
  /** Horas faturadas gravadas na hora da cotação. Depois de salvas, não mudam. */
  horasContadas?: number | null;
  /** Link de visualização. Some se o JSON for regravado sem este campo. */
  linkPublico?: { token: string; expiraEm: string } | null;
  /** Aceite do usuário do cliente, antes de gerar a proposta. */
  aceiteCliente?: { texto: string; em: string } | null;
  /** Traçado calculado. O link público redesenha a rota a partir daqui, não de um desenho solto. */
  percurso?: { polyline: string; pontos: Coordenada[] } | null;
  /** Trechos da mesma proposta. Ausente na cotação de um trecho só. */
  trechos?: TrechoPersistido[];
};

export type LinhaHistoricoCotacao = CotacaoPrazo & {
  id: string;
  client_id: number | null;
  client_name: string;
  origin: string;
  destination: string;
  total_km: number;
  total_hours: number;
  total_value: number;
  created_by: string;
  contract_details?: string | null;
};

export type ValidadeCotacao = {
  tom: 'ativa' | 'convertida' | 'expirada' | 'inativa';
  rotulo: string;
};

export type PedidoRegistroCotacao = {
  origem?: unknown;
  destino?: unknown;
  km?: unknown;
  duracaoMin?: unknown;
  valor?: unknown;
  horas?: unknown;
  regiao?: unknown;
  kmFranquia?: unknown;
  kmExtra?: unknown;
  horaExtra?: unknown;
  acionamento?: unknown;
  paradas?: unknown;
  acordada?: unknown;
  operacao?: unknown;
  usouMinimo?: unknown;
  vigencia?: unknown;
  numero?: unknown;
  aceiteCliente?: { texto?: unknown; em?: unknown } | null;
  kmFaturado?: unknown;
  horasContadas?: unknown;
  percurso?: unknown;
  trechos?: unknown;
};

/** Texto fixo do cliente antes de gerar a proposta. Vale se a cotação for usada numa OS. */
export const TEXTO_ACEITE_OS = 'Concordo com as informações acima para utilização em ordem de serviço.';

/** Equipe interna e quem cotação de dentro do sistema não marcam o aceite. */
export function exigeAceiteDoCliente(interno: boolean, equipeInterna: boolean): boolean {
  return !interno && !equipeInterna;
}

function numero(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function texto(valor: unknown, limite = 240): string {
  return String(valor || '').trim().slice(0, limite);
}

export function resumirEndereco(endereco: string | null | undefined, limite = 42): string {
  const trecho = String(endereco || '').split(',')[0]?.trim() || '';
  if (!trecho) return '—';
  if (trecho.length <= limite) return trecho;
  return `${trecho.slice(0, Math.max(1, limite - 1)).trimEnd()}…`;
}

export function formatarDataHoraCotacao(iso: string | null | undefined): string {
  return formatDateTimeBR(iso);
}

export function dataLongaCotacao(iso: string | null | undefined): string {
  if (!iso) return '';
  const texto = formatDateBR(iso);
  return texto === '—' ? '' : texto;
}

function limparParteArquivo(valor: string): string {
  const limpo = String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  return (limpo || 'Cliente').slice(0, 60);
}

/** Data do arquivo em DD-MM-AAAA, no horário de Brasília, sem barra. */
export function dataArquivoCotacao(valor?: string | Date | null): string {
  if (typeof valor === 'string' && /^\d{2}-\d{2}-\d{4}$/.test(valor)) return valor;
  const candidata = valor instanceof Date ? valor : (valor ? new Date(valor) : new Date());
  const data = Number.isNaN(candidata.getTime()) ? new Date() : candidata;
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(data);
  const pegar = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((item) => item.type === tipo)?.value || '';
  return `${pegar('day')}-${pegar('month')}-${pegar('year')}`;
}

/** Cotacao_NUMERO_CLIENTE_DATA.pdf */
export function nomePdfCotacao(entrada: {
  cliente: string;
  origem?: string;
  destino?: string;
  numero?: number | string | null;
  data?: string | Date | null;
}): string {
  const numero = numeroInformado(entrada.numero);
  const cliente = limparParteArquivo(entrada.cliente);
  const data = dataArquivoCotacao(entrada.data);
  const nome = `Cotacao_${numero ? String(numero) : 'sem_numero'}_${cliente}_${data}.pdf`;
  return nome.length <= 180 ? nome : `${nome.slice(0, 176).replace(/_+$/g, '')}.pdf`;
}

/** O anexo usa o nome enviado pela tela quando ele segue o padrão. Senão monta de novo. */
export function nomeAnexoPdf(
  pedido: unknown,
  reserva: { cliente?: string | null; origem?: string | null; destino?: string | null; numero?: unknown; data?: string | Date | null },
): string {
  const nome = String(pedido || '').trim();
  if (/^Cotacao_[A-Za-z0-9_]+_\d{2}-\d{2}-\d{4}\.pdf$/.test(nome) && nome.length <= 180) return nome;
  return nomePdfCotacao({
    cliente: String(reserva.cliente || 'Cliente'),
    numero: numeroInformado(reserva.numero),
    data: reserva.data,
  });
}

/** A linha do histórico é a rota que está no card quando o km e o endereço batem. */
export function linhaConfereComTela(
  linha: { origin?: string | null; destination?: string | null; total_km?: number | null },
  tela: { origem?: string | null; destino?: string | null; km?: number | null },
): boolean {
  const kmTela = Number(tela.km);
  const kmLinha = Number(linha.total_km);
  if (!Number.isFinite(kmTela) || kmTela <= 0 || !Number.isFinite(kmLinha)) return false;
  if (Math.abs(kmLinha - kmTela) >= 1) return false;
  const origemTela = String(tela.origem || '').trim();
  const origemLinha = String(linha.origin || '').trim();
  if (!origemTela || !origemLinha) return false;
  if (origemLinha === origemTela) return true;
  if (resumirEndereco(origemLinha) === resumirEndereco(origemTela)
    && resumirEndereco(linha.destination) === resumirEndereco(tela.destino)) return true;
  const saidaLinha = cidadeDaRota(origemLinha);
  const saidaTela = cidadeDaRota(origemTela);
  const chegadaLinha = cidadeDaRota(String(linha.destination || ''));
  const chegadaTela = cidadeDaRota(String(tela.destino || ''));
  return saidaLinha.length >= 3 && saidaLinha === saidaTela && chegadaLinha.length >= 3 && chegadaLinha === chegadaTela;
}

/** O que o card mostra. O histórico grava e lê estes campos, sem recalcular a tabela genérica. */
export type TelaCotacao = {
  origem: string;
  destino: string;
  regiao: string;
  tarifaKm: number;
  horaExtra: number;
  total: number;
  km: number;
  duracaoMin: number | null;
  horas: number;
  usouMinimo: boolean;
  vigencia: VersaoTabelaRegional;
};

function franquiaIncluidaSeparada(valor: number, padrao: number, usouMinimo: boolean, percorrido: number): boolean {
  return valor === padrao && !usouMinimo && percorrido > padrao;
}

/** Km e horas faturados que foram gravados. A rota do Google e a tela aberta não substituem. */
export function kmTempoFaturadoSalvo(linha: { total_km?: number | null; total_hours?: number | null; contract_details?: string | null }): { km: number; horas: number | null } {
  const salvo = lerSnapshot(linha.contract_details);
  const kmRota = numero(linha.total_km);
  const horasLinha = numero(linha.total_hours);
  const kmSalvo = salvo?.kmFaturado != null && salvo.kmFaturado > 0
    ? salvo.kmFaturado
    : (salvo && salvo.kmFranquia > 0 && !franquiaIncluidaSeparada(salvo.kmFranquia, FRANQUIA_KM, salvo.usouMinimo, kmRota)
      ? salvo.kmFranquia
      : kmRota);
  const horasSalvas = salvo?.horasContadas != null && salvo.horasContadas > 0
    ? salvo.horasContadas
    : (salvo && salvo.horasFranquia > 0 && !franquiaIncluidaSeparada(salvo.horasFranquia, FRANQUIA_HORAS, salvo.usouMinimo, horasLinha)
      ? salvo.horasFranquia
      : horasLinha);
  return { km: kmSalvo, horas: horasSalvas > 0 ? horasSalvas : null };
}

export function textoKmFaturadoSalvo(km: number, horas: number | null): string {
  const kmTexto = `${numero(km).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
  if (horas == null || !Number.isFinite(horas) || horas <= 0) return kmTexto;
  const horasTexto = Number.isInteger(horas)
    ? `${horas} h`
    : `${horas.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;
  return `${kmTexto} | ${horasTexto}`;
}

export function valoresExibidosDaLinha(
  linha: Pick<LinhaHistoricoCotacao, 'origin' | 'destination' | 'total_km' | 'total_hours' | 'total_value' | 'contract_details'> & { client_name?: string | null },
): { regiao: string; tarifaKm: number; horaExtra: number; total: number; km: number; horas: number | null } {
  const salvo = lerSnapshot(linha.contract_details);
  const tempo = kmTempoFaturadoSalvo(linha);
  return {
    regiao: salvo?.regiao || '—',
    tarifaKm: salvo?.kmExtra ?? 0,
    horaExtra: salvo?.horaExtra ?? 0,
    total: Number(linha.total_value) || salvo?.acionamento || 0,
    km: tempo.km,
    horas: tempo.horas,
  };
}

/** Devolve a gravação só quando o snapshot ainda está na tabela genérica. Texto livre não entra. */
export function patchDaTelaNoSnapshot(
  bruto: string | null | undefined,
  tela: TelaCotacao,
): { contract_details: string; total_value: number; total_hours: number } | null {
  if (!bruto) return null;
  let dados: Record<string, unknown>;
  try {
    dados = JSON.parse(bruto) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!dados || dados.kind !== KIND_PORTAL_COTACAO || dados.acordada) return null;
  const igual = String(dados.regiao || '') === tela.regiao
    && Math.abs(Number(dados.kmExtra) - tela.tarifaKm) < 0.001
    && Math.abs(Number(dados.horaExtra) - tela.horaExtra) < 0.001
    && Math.abs(Number(dados.acionamento) - tela.total) < 0.01;
  if (igual) return null;
  return {
    contract_details: JSON.stringify({
      ...dados,
      regiao: tela.regiao,
      kmExtra: tela.tarifaKm,
      horaExtra: tela.horaExtra,
      acionamento: tela.total,
      duracaoMin: tela.duracaoMin,
      vigencia: tela.vigencia,
      usouMinimo: tela.usouMinimo,
    }),
    total_value: tela.total,
    total_hours: tela.horas,
  };
}

export function numeroInformado(valor: unknown): number | null {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export function numeroNoSnapshot(bruto: string | null | undefined): number | null {
  if (!bruto) return null;
  try {
    const dados = JSON.parse(bruto) as { numero?: unknown };
    return numeroInformado(dados?.numero);
  } catch {
    return null;
  }
}

export function numerosNaPagina(linhas: Array<{ id?: unknown; contract_details?: unknown }>): number[] {
  const lista: number[] = [];
  for (const linha of linhas) {
    const gravado = numeroNoSnapshot(linha.contract_details == null ? null : String(linha.contract_details));
    if (gravado) lista.push(gravado);
    const id = String(linha.id || '');
    if (/^\d+$/.test(id)) lista.push(Number(id));
  }
  return lista;
}

export function proximoNumeroCotacao(usados: Array<number | null | undefined>): number {
  let maior = 0;
  for (const item of usados) {
    const n = Number(item);
    if (Number.isInteger(n) && n > maior) maior = n;
  }
  return maior + 1;
}

/** Lê as páginas até o fim. Se a leitura falhar ou não fechar, não inventa o número. */
export async function reservarNumeroCotacao(
  ler: (inicio: number, fim: number) => Promise<{ linhas: Array<{ id?: unknown; contract_details?: unknown }> } | null>,
): Promise<number | null> {
  const usados: number[] = [];
  const tamanho = 200;
  for (let pagina = 0; pagina < 50; pagina += 1) {
    const inicio = pagina * tamanho;
    const lote = await ler(inicio, inicio + tamanho - 1);
    if (!lote) return null;
    usados.push(...numerosNaPagina(lote.linhas));
    if (lote.linhas.length < tamanho) return proximoNumeroCotacao(usados);
  }
  return null;
}

export function diasRestantesCotacao(cotacao: CotacaoPrazo, agora = new Date()): number {
  const criada = cotacao.created_at ? new Date(cotacao.created_at) : null;
  if (!criada || Number.isNaN(criada.getTime())) return 0;
  const restante = criada.getTime() + PRAZO_COTACAO_MS - agora.getTime();
  if (restante <= 0) return cotacaoVencida(cotacao, agora) ? 0 : 1;
  return Math.max(1, Math.ceil(restante / (24 * 60 * 60 * 1000)));
}

export function rotuloValidade(cotacao: CotacaoPrazo, agora = new Date()): ValidadeCotacao {
  if (cotacaoConvertida(cotacao)) return { tom: 'convertida', rotulo: 'Convertida em OS' };
  const status = String(cotacao.status || '').trim().toLowerCase();
  if (status === 'inativa') return { tom: 'inativa', rotulo: 'Inativa' };
  if (cotacaoVencida(cotacao, agora) || status === 'expirada' || cotacao.is_active === false) {
    return { tom: 'expirada', rotulo: 'Expirada' };
  }
  const dias = diasRestantesCotacao(cotacao, agora);
  return { tom: 'ativa', rotulo: dias === 1 ? 'Ativa · 1 dia' : `Ativa · ${dias} dias` };
}

export function textoDistanciaTempo(km: number, duracaoMin: number | null): string {
  const kmTexto = `${numero(km).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
  if (duracaoMin == null || !Number.isFinite(duracaoMin) || duracaoMin <= 0) return kmTexto;
  const minutos = Math.round(duracaoMin);
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  const tempo = horas <= 0 ? `${resto} min` : `${horas}h ${String(resto).padStart(2, '0')}min`;
  return `${kmTexto} | ${tempo}`;
}

export function textoRegiaoFranquia(regiao: string, usouMinimo: boolean): string {
  const nome = String(regiao || '').trim() || '—';
  return usouMinimo ? `${nome} · franquia mínima` : nome;
}

export function vigenciaInformada(valor: unknown): VersaoTabelaRegional | null {
  const marca = String(valor || '').trim();
  if (marca === '2026' || marca === '2027') return marca;
  return null;
}

/** Cotação sem marca foi feita antes da Tabela 2027 e permanece na vigência 2026. */
export function vigenciaDaCotacao(cotacao: { contract_details?: string | null } | null | undefined): VersaoTabelaRegional {
  const bruto = cotacao?.contract_details;
  if (!bruto) return '2026';
  try {
    const dados = JSON.parse(bruto) as { vigencia?: unknown; pricing_version?: unknown };
    return vigenciaInformada(dados?.vigencia) || vigenciaInformada(dados?.pricing_version) || '2026';
  } catch {
    return '2026';
  }
}

export function formatarValorCotacao(valor: number): string {
  return numero(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Texto para colar no WhatsApp. Não grava e não envia. */
export function mensagemCompletaCotacao(linha: LinhaHistoricoCotacao, agora = new Date()): string {
  const salvo = lerSnapshot(linha.contract_details);
  const numeroLinha = salvo?.numero || (/^\d+$/.test(String(linha.id || '')) ? Number(linha.id) : null);
  const validade = rotuloValidade(linha, agora);
  const km = Number(linha.total_km);
  const faturado = kmTempoFaturadoSalvo(linha);
  const franquiaMinima = salvo ? Boolean(salvo.usouMinimo) : km > 0 && km <= 100;
  const partes = [
    `Cotação${numeroLinha ? ` ${numeroLinha}` : ''} — ${String(linha.client_name || '').trim() || 'Cliente'}`,
    `Tabela ${salvo?.vigencia || vigenciaDaCotacao(linha)}`,
    `Data: ${formatarDataHoraCotacao(linha.created_at)}`,
    `Solicitante: ${String(linha.created_by || '').trim() || '—'}`,
    salvo?.solicitanteEmail ? `E-mail: ${salvo.solicitanteEmail}` : '',
    `Origem: ${String(linha.origin || '').trim() || '—'}`,
    `Destino: ${String(linha.destination || '').trim() || '—'}`,
    ...(salvo?.trechos && salvo.trechos.length > 1
      ? salvo.trechos.map((trecho, indice) => `Trecho ${indice + 1}: ${trecho.origem} → ${trecho.destino} · ${formatarValorCotacao(trecho.valor)} · excedente ${trecho.kmExcedente.toLocaleString('pt-BR')} km / ${trecho.horasExcedentes.toLocaleString('pt-BR')} h`)
      : []),
    salvo?.paradas?.length ? `Paradas: ${salvo.paradas.join(' | ')}` : '',
    `Distância / tempo: ${textoKmFaturadoSalvo(faturado.km, faturado.horas)}`,
    `Horas faturadas: ${faturado.horas != null ? faturado.horas.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—'}`,
    `Região: ${textoRegiaoFranquia(salvo?.regiao || '—', franquiaMinima)}`,
    salvo && (salvo.kmFranquia > 0 || salvo.horasFranquia > 0) ? `Franquia: ${salvo.kmFranquia.toLocaleString('pt-BR')} km / ${salvo.horasFranquia.toLocaleString('pt-BR')} h` : '',
    `Valor KM: ${textoTarifaKm(salvo?.kmExtra)}`,
    `Hora extra: ${textoHoraExtra(salvo?.horaExtra)}`,
    salvo && salvo.acionamento > 0 ? `Acionamento: ${formatarValorCotacao(salvo.acionamento)}` : '',
    `Valor total: ${formatarValorCotacao(linha.total_value)}`,
    `Status: ${validade.rotulo}`,
    'Pedágio cobrado à parte.',
  ];
  return partes.filter(Boolean).join('\n');
}

/** Aceita a polyline do Google e um conjunto curto de coordenadas. Descarta o resto. */
export function percursoUtil(bruto: unknown): { polyline: string; pontos: Coordenada[] } | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const registro = bruto as { polyline?: unknown; pontos?: unknown };
  const linha = String(registro.polyline || '').trim();
  const polyline = /^[\x21-\x7E]{8,12000}$/.test(linha) ? linha : '';
  const lista = Array.isArray(registro.pontos) ? registro.pontos : [];
  const pontos: Coordenada[] = [];
  for (const item of lista) {
    if (pontos.length >= 80) break;
    if (!item || typeof item !== 'object') continue;
    const lat = Number((item as { lat?: unknown }).lat);
    const lng = Number((item as { lng?: unknown }).lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
    pontos.push({ lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 });
  }
  const completos = pontos.length >= 2 ? pontos : (polyline ? decodificarPolyline(polyline) : []);
  if (!polyline && completos.length < 2) return null;
  return { polyline, pontos: completos.slice(0, 80) };
}

export function montarSnapshot(entrada: {
  duracaoMin?: number | null;
  usouMinimo?: boolean;
  regiao?: string;
  kmFranquia?: number;
  horasFranquia?: number;
  kmExtra?: number;
  horaExtra?: number;
  acionamento?: number;
  paradas?: string[];
  solicitanteEmail?: string;
  acordada?: boolean;
  operacao?: string;
  vigencia?: VersaoTabelaRegional | null;
  numero?: number | null;
  kmFaturado?: number | null;
  horasContadas?: number | null;
  percurso?: unknown;
}): SnapshotCotacaoPortal {
  const pronto: SnapshotCotacaoPortal = {
    kind: KIND_PORTAL_COTACAO,
    duracaoMin: entrada.duracaoMin != null && Number.isFinite(entrada.duracaoMin) && entrada.duracaoMin > 0 ? Math.round(entrada.duracaoMin) : null,
    usouMinimo: Boolean(entrada.usouMinimo),
    regiao: texto(entrada.regiao, 80),
    kmFranquia: numero(entrada.kmFranquia),
    horasFranquia: numero(entrada.horasFranquia),
    kmExtra: numero(entrada.kmExtra),
    horaExtra: numero(entrada.horaExtra),
    acionamento: numero(entrada.acionamento),
    paradas: (entrada.paradas || []).map((item) => texto(item, 180)).filter(Boolean).slice(0, 12),
    solicitanteEmail: texto(entrada.solicitanteEmail, 160),
    acordada: Boolean(entrada.acordada),
    operacao: texto(entrada.operacao, 180),
    vigencia: entrada.vigencia === '2027' ? '2027' : '2026',
    numero: numeroInformado(entrada.numero),
    ...(numero(entrada.kmFaturado) > 0 ? { kmFaturado: numero(entrada.kmFaturado) } : {}),
    ...(numero(entrada.horasContadas) > 0 ? { horasContadas: numero(entrada.horasContadas) } : {}),
  };
  const percurso = percursoUtil(entrada.percurso);
  if (percurso) pronto.percurso = percurso;
  return pronto;
}

export function lerSnapshot(bruto: string | null | undefined): SnapshotCotacaoPortal | null {
  if (!bruto) return null;
  try {
    const dados = JSON.parse(bruto) as Partial<SnapshotCotacaoPortal>;
    if (!dados || dados.kind !== KIND_PORTAL_COTACAO) return null;
    const link = dados.linkPublico;
    const linkPublico = link && typeof link.token === 'string' && typeof link.expiraEm === 'string'
      ? { token: link.token, expiraEm: link.expiraEm }
      : null;
    const aceiteBruto = dados.aceiteCliente;
    const aceiteCliente = aceiteBruto && aceiteBruto.texto === TEXTO_ACEITE_OS && typeof aceiteBruto.em === 'string'
      ? { texto: TEXTO_ACEITE_OS, em: aceiteBruto.em }
      : null;
    const trechos = lerTrechosPersistidos(dados.trechos);
    return {
      ...montarSnapshot({
      duracaoMin: dados.duracaoMin,
      usouMinimo: dados.usouMinimo,
      regiao: dados.regiao,
      kmFranquia: dados.kmFranquia,
      horasFranquia: dados.horasFranquia,
      kmExtra: dados.kmExtra,
      horaExtra: dados.horaExtra,
      acionamento: dados.acionamento,
      paradas: Array.isArray(dados.paradas) ? dados.paradas : [],
      solicitanteEmail: dados.solicitanteEmail,
      acordada: dados.acordada,
      operacao: dados.operacao,
      vigencia: vigenciaInformada(dados.vigencia),
      numero: numeroInformado(dados.numero),
      kmFaturado: dados.kmFaturado,
      horasContadas: dados.horasContadas,
      percurso: dados.percurso,
    }),
      ...(trechos && trechos.length > 1 ? { trechos } : {}),
      ...(linkPublico ? { linkPublico } : {}),
      ...(aceiteCliente ? { aceiteCliente } : {}),
    };
  } catch {
    return null;
  }
}

export function propostaDoHistorico(linha: Pick<LinhaHistoricoCotacao, 'origin' | 'destination' | 'total_km' | 'total_hours' | 'total_value' | 'contract_details'>): PropostaPortal {
  const salvo = lerSnapshot(linha.contract_details);
  const tempo = kmTempoFaturadoSalvo(linha);
  if (salvo) {
    return {
      acordada: salvo.acordada,
      regiao: salvo.regiao,
      origem: linha.origin,
      destino: linha.destination,
      paradas: salvo.paradas,
      acionamento: salvo.acionamento || numero(linha.total_value),
      kmFranquia: salvo.kmFranquia,
      horasFranquia: salvo.horasFranquia,
      kmFaturado: tempo.km > 0 ? tempo.km : null,
      horasContadas: tempo.horas,
      kmExtra: salvo.kmExtra,
      horaExtra: salvo.horaExtra,
      operacao: salvo.operacao || `${linha.origin} X ${linha.destination}`,
      vigencia: salvo.vigencia,
      kmRota: numero(linha.total_km),
      duracaoMin: salvo.duracaoMin,
      numero: salvo.numero,
      ...(salvo.trechos && salvo.trechos.length > 1 ? { trechos: salvo.trechos } : {}),
    };
  }
  return {
    acordada: false,
    regiao: '',
    origem: linha.origin,
    destino: linha.destination,
    paradas: [],
    acionamento: numero(linha.total_value),
    kmFranquia: numero(linha.total_km),
    horasFranquia: numero(linha.total_hours),
    kmExtra: 0,
    horaExtra: 0,
    operacao: `${linha.origin} X ${linha.destination}`,
    vigencia: '2026',
    kmRota: numero(linha.total_km),
    duracaoMin: null,
  };
}

export function pedidoParaRegistro(
  pedido: PedidoRegistroCotacao,
  cliente: { id?: unknown; name?: string | null },
  solicitante: { name?: string | null; email?: string | null },
): { ok: true; linha: Record<string, unknown>; snapshot: SnapshotCotacaoPortal } | { ok: false; error: string } {
  const origem = texto(pedido.origem, 300);
  const destino = texto(pedido.destino, 300);
  const km = numero(pedido.km);
  const valor = numero(pedido.valor ?? pedido.acionamento);
  const idCliente = Number(cliente.id);
  const nomeCliente = texto(cliente.name, 180);
  if (!Number.isFinite(idCliente) || idCliente <= 0 || !nomeCliente) return { ok: false, error: 'Cliente da cotação não encontrado.' };
  if (!origem || !destino || km <= 0) return { ok: false, error: 'Faltam origem, destino ou a distância da rota.' };
  const nome = texto(solicitante.name, 160) || texto(solicitante.email, 160) || 'Portal';
  const snapshot = montarSnapshot({
    duracaoMin: pedido.duracaoMin == null || pedido.duracaoMin === '' ? null : numero(pedido.duracaoMin),
    usouMinimo: Boolean(pedido.usouMinimo),
    regiao: texto(pedido.regiao, 80),
    kmFranquia: numero(pedido.kmFranquia),
    horasFranquia: numero(pedido.horas),
    kmExtra: numero(pedido.kmExtra),
    horaExtra: numero(pedido.horaExtra),
    acionamento: numero(pedido.acionamento ?? pedido.valor),
    paradas: Array.isArray(pedido.paradas) ? pedido.paradas.map((item) => String(item || '')) : [],
    solicitanteEmail: texto(solicitante.email, 160),
    acordada: Boolean(pedido.acordada),
    operacao: texto(pedido.operacao, 180),
    vigencia: vigenciaInformada(pedido.vigencia) || '2026',
    numero: numeroInformado(pedido.numero),
    kmFaturado: pedido.kmFaturado,
    horasContadas: pedido.horasContadas,
    percurso: pedido.percurso,
  });
  const aceite = pedido.aceiteCliente;
  if (aceite && aceite.texto === TEXTO_ACEITE_OS && typeof aceite.em === 'string' && aceite.em.trim()) {
    snapshot.aceiteCliente = { texto: TEXTO_ACEITE_OS, em: aceite.em.trim().slice(0, 40) };
  }
  const linha: Record<string, unknown> = {
    client_id: idCliente,
    client_name: nomeCliente,
    origin: origem,
    destination: destino,
    total_km: km,
    total_hours: numero(pedido.horas),
    total_value: valor,
    status: 'Enviada',
    is_active: true,
    quote_source: 'ROTA',
    created_by: nome,
  };
  if (Array.isArray(pedido.trechos) && pedido.trechos.length > 1) {
    const conferencia = conferirTrechosGravados(pedido.trechos, nomeCliente, snapshot.vigencia);
    if (!conferencia.ok) return conferencia;
    snapshot.trechos = conferencia.trechos;
    snapshot.acionamento = conferencia.total;
    snapshot.kmExtra = conferencia.trechos[0].kmExtra;
    snapshot.horaExtra = conferencia.trechos[0].horaExtra;
    snapshot.usouMinimo = conferencia.trechos.every((trecho) => trecho.usouMinimo);
    linha.origin = conferencia.trechos[0].origem;
    linha.destination = conferencia.trechos[conferencia.trechos.length - 1].destino;
    linha.total_km = conferencia.km;
    linha.total_hours = conferencia.horas;
    linha.total_value = conferencia.total;
  } else {
    const avisoPiso = recusarPisoDaProposta({
      cliente: nomeCliente,
      origem,
      vigencia: snapshot.vigencia,
      acordada: snapshot.acordada,
      acionamento: snapshot.acionamento,
      kmExtra: snapshot.kmExtra,
      horaExtra: snapshot.horaExtra,
    });
    if (avisoPiso) return { ok: false, error: avisoPiso };
  }
  linha.contract_details = JSON.stringify(snapshot);
  return { ok: true, snapshot, linha };
}

export function normalizarLinhaHistorico(row: Record<string, unknown>): LinhaHistoricoCotacao {
  return {
    id: String(row.id || ''),
    client_id: row.client_id == null ? null : Number(row.client_id),
    client_name: String(row.client_name || ''),
    origin: String(row.origin || ''),
    destination: String(row.destination || ''),
    total_km: numero(row.total_km),
    total_hours: numero(row.total_hours),
    total_value: numero(row.total_value),
    created_at: row.created_at == null ? null : String(row.created_at),
    created_by: String(row.created_by || ''),
    status: (row.status as LinhaHistoricoCotacao['status']) || 'Enviada',
    is_active: row.is_active == null ? null : Boolean(row.is_active),
    converted_to_order_id: row.converted_to_order_id == null ? null : String(row.converted_to_order_id),
    contract_details: row.contract_details == null ? null : String(row.contract_details),
  };
}
