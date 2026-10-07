import { authFetch } from './authFetch';
import { formatDateTimeBR } from './dateUtils';
import { descreverDeCoordenada, descreverReferencia, foraDoPortalPorRaio, type ReferenciaDhl } from './dhlReferenciaGeografica';
import { extractCityFromAddress, extractUF, UF_TO_REGION } from './financialUtils';
import { publishMissionLive, MISSION_LIVE_WINDOW_EVENT } from './missionLiveBroadcast';
import { supabase } from './supabase';

/** Janela em que a viatura ainda é considerada no lugar da finalização. */
export const HORA_MS = 30 * 60 * 1000;

export const TABELA_DHL_VIATURA = 'dhl_viatura_disponivel';

export const MOTIVO_BLOQUEIO =
  'Ninguém clicou em Comunicar a DHL dentro de 30 minutos. A viatura saiu do painel porque já não está mais nessa posição.';

export const REGIOES_ORDEM = ['NORTE', 'NORDESTE', 'CENTRO-OESTE', 'SUDESTE', 'SUL'] as const;

export type RegiaoDhl = (typeof REGIOES_ORDEM)[number];

export type StatusAlertaDhl = 'pendente' | 'copiado' | 'confirmado' | 'expirado';

export type TomBotaoDhl = 'escuro' | 'claro' | 'vermelho';

export type RascunhoAlertaDhl = {
  missionId: string;
  providerName: string;
  cliente: string;
  posicao: string;
  cidade: string;
  uf: string;
  regiao: string;
  finalizadaEm: string;
};

export type AlertaDhl = {
  mission_id: string;
  provider_name: string;
  cliente: string;
  posicao: string;
  cidade: string;
  uf: string;
  regiao: string;
  finalizada_em: string;
  status: StatusAlertaDhl;
  copiado_em: string | null;
  copiado_por: string | null;
  confirmado_em: string | null;
  confirmado_por: string | null;
  expirado_em: string | null;
  motivo_bloqueio: string | null;
  observacao_diretoria: string | null;
};

type MissaoParaAlerta = {
  missionId: string;
  status?: string | null;
  isSameOs?: boolean | null;
  provider?: string | null;
  client?: string | null;
  currentLocation?: string | null;
  destination?: string | null;
  endTime?: string | null;
  lastUpdate?: string | null;
};

const ROTULO: Record<string, string> = {
  NORTE: 'Norte',
  NORDESTE: 'Nordeste',
  'CENTRO-OESTE': 'Centro-Oeste',
  SUDESTE: 'Sudeste',
  SUL: 'Sul',
  TOPO: 'No topo',
};

export function rotuloRegiao(regiao: string): string {
  return ROTULO[regiao] || regiao || 'Região';
}

/** Trecho do texto que descreve o lugar. Prefere o pedaço com UF, de trás para frente. */
export function parteLocal(texto: string): string {
  const raw = String(texto || '').trim();
  if (!raw) return '';
  const parts = raw.split('|').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return '';
  for (let i = parts.length - 1; i >= 0; i--) {
    if (extractUF(parts[i])) return parts[i];
  }
  return parts[parts.length - 1];
}

export function idadeMs(finalizadaEm: string, now: Date): number {
  const t = new Date(finalizadaEm).getTime();
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return now.getTime() - t;
}

export function dentroDaJanela(finalizadaEm: string, now: Date = new Date()): boolean {
  const idade = idadeMs(finalizadaEm, now);
  return idade >= -60_000 && idade < HORA_MS;
}

export function textoHaQuantoTempo(finalizadaEm: string, now: Date): string {
  const idade = idadeMs(finalizadaEm, now);
  if (!Number.isFinite(idade) || idade < 0) return 'agora';
  const min = Math.floor(idade / 60_000);
  if (min < 1) return 'há menos de 1 min';
  if (min < 60) return min === 1 ? 'há 1 min' : `há ${min} min`;
  const horas = Math.floor(min / 60);
  const resto = min % 60;
  const h = horas === 1 ? '1 h' : `${horas} h`;
  return resto ? `há ${h} ${resto} min` : `há ${h}`;
}

export function minutosRestantes(finalizadaEm: string, now: Date): number {
  const left = HORA_MS - idadeMs(finalizadaEm, now);
  if (left <= 0) return 0;
  return Math.ceil(left / 60_000);
}

/**
 * Verde escuro: ninguém copiou.
 * Verde claro: alguém já copiou (vale para todos).
 * Vermelho: passou 30 minutos sem o clique — bloqueado, fora do painel vivo.
 */
export function tomDoBotao(status: StatusAlertaDhl, finalizadaEm: string, now: Date): TomBotaoDhl {
  if (status === 'expirado') return 'vermelho';
  if (status === 'copiado' || status === 'confirmado') return 'claro';
  if (idadeMs(finalizadaEm, now) >= HORA_MS) return 'vermelho';
  return 'escuro';
}

export function visivelNoPainelVivo(alerta: Pick<AlertaDhl, 'status' | 'finalizada_em'>, now: Date): boolean {
  if (alerta.status === 'copiado') return true;
  if (alerta.status === 'pendente') return idadeMs(alerta.finalizada_em, now) < HORA_MS;
  return false;
}

/** Motivo já escrito sai da lista. O texto fica na observação da OS. */
export function motivoJaGravado(observacao: string | null | undefined): boolean {
  return String(observacao || '').trim().length > 0;
}

/** Frase que entra na observação da OS. O painel deixa de mostrar o aviso. */
export function textoMotivoNaOs(motivo: string): string {
  return `Não encaminhada à DHL. ${String(motivo || '').trim()}`;
}

export function entraNaListaBloqueados(
  alerta: Pick<AlertaDhl, 'status' | 'finalizada_em'> & { observacao_diretoria?: string | null },
  now: Date,
): boolean {
  if (motivoJaGravado(alerta.observacao_diretoria)) return false;
  if (alerta.status === 'expirado') return true;
  return alerta.status === 'pendente' && idadeMs(alerta.finalizada_em, now) >= HORA_MS;
}

type UsuarioPainel = {
  role?: string | null;
  profileName?: string | null;
  permissions?: string[] | null;
  providerId?: string | null;
  clientId?: string | null;
  userType?: string | null;
};

function papel(user: UsuarioPainel | null | undefined): string {
  return String(user?.role || user?.profileName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

const PERFIS_COMUNICADO_DHL = new Set(['operador', 'avancado', 'administrador']);

/** Comunicado da DHL só para operador, avançado e administrador. */
export function podeVerPainelDhl(user: UsuarioPainel | null | undefined): boolean {
  if (!user) return false;
  if (user.providerId || user.userType === 'provider') return false;
  if (user.clientId || user.userType === 'client') return false;
  return PERFIS_COMUNICADO_DHL.has(papel(user));
}

export function podeAuditarNaoEncaminhados(user: { role?: string | null; profileName?: string | null; permissions?: string[] | null } | null | undefined): boolean {
  const role = String(user?.role || user?.profileName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (role === 'diretoria' || role === 'administrador') return true;
  return !!user?.permissions?.includes('*');
}

export function agruparPorRegiao<T extends { regiao: string; finalizada_em: string }>(rows: T[]): { regiao: string; itens: T[] }[] {
  const buckets = new Map<string, T[]>();
  for (const row of rows) {
    const key = (REGIOES_ORDEM as readonly string[]).includes(row.regiao) ? row.regiao : 'OUTRAS';
    const list = buckets.get(key) || [];
    list.push(row);
    buckets.set(key, list);
  }
  const ordem = [...REGIOES_ORDEM, 'OUTRAS'];
  return ordem
    .filter((regiao) => buckets.has(regiao))
    .map((regiao) => ({
      regiao,
      itens: (buckets.get(regiao) || []).slice().sort((a, b) => (
        new Date(b.finalizada_em).getTime() - new Date(a.finalizada_em).getTime()
      )),
    }));
}

/**
 * Qualquer cliente. A OS finalizada entra por 30 minutos, em qualquer lugar,
 * menos num raio de 100 km de São Paulo ou do Rio. Extrema, Pouso Alegre e
 * Varginha entram mesmo perto de São Paulo. O desdobramento da mesma OS fica de fora.
 */
export function resolverAlertaDhl(input: MissaoParaAlerta, now: Date = new Date()): RascunhoAlertaDhl | null {
  const status = String(input.status || '');
  if (status !== 'Concluída') return null;
  if (input.isSameOs) return null;

  const localAtual = parteLocal(String(input.currentLocation || ''));
  const localDestino = parteLocal(String(input.destination || ''));
  const ufAtual = extractUF(localAtual);
  const ufDestino = extractUF(localDestino);
  const uf = ufAtual || ufDestino;
  const posicaoPrevia = (ufAtual ? localAtual : localDestino).replace(/\s+/g, ' ').trim();
  if (!uf || foraDoPortalPorRaio(posicaoPrevia, uf)) return null;
  const regiao = UF_TO_REGION[uf] || '';
  if (!regiao) return null;

  const posicao = (ufAtual ? localAtual : localDestino).replace(/\s+/g, ' ').trim();
  if (!posicao) return null;

  const finalizadaEm = String(input.endTime || input.lastUpdate || '').trim();
  if (!finalizadaEm || !dentroDaJanela(finalizadaEm, now)) return null;

  const cidade = String(extractCityFromAddress(posicao) || '').trim();
  return {
    missionId: String(input.missionId || '').trim(),
    providerName: String(input.provider || '').trim(),
    cliente: String(input.client || '').trim(),
    posicao,
    cidade,
    uf,
    regiao,
    finalizadaEm,
  };
}

/** Texto do WhatsApp. Não leva fornecedor, OS, placa nem cliente. */
export function montarMensagemDisponibilidadeDhl(alerta: {
  regiao: string;
  posicao: string;
  finalizadaEm: string;
  uf?: string;
}, referencia?: ReferenciaDhl | null): string {
  const regiao = rotuloRegiao(alerta.regiao);
  const local = String(alerta.posicao || '').replace(/\s+/g, ' ').trim();
  const quando = formatDateTimeBR(alerta.finalizadaEm);
  const ref = referencia === undefined && alerta.uf
    ? descreverReferencia(local, alerta.uf)
    : referencia;
  const linhas = [
    '🟢 *EQUIPE TM SEGUE INFORMA*',
    '',
    `Temos uma viatura disponível na região *${regiao}*.`,
    '',
    '📍 *Última posição (fim de viagem):*',
    local,
    '',
  ];
  if (ref) {
    linhas.push(ref.capital, ref.aeroporto, '');
  }
  linhas.push(
    '✅ A equipe acabou de finalizar.',
    `🕒 *Finalização:* ${quando}`,
    '',
    '🚛 *Equipe disponível para novas missões.*',
  );
  return linhas.join('\n');
}

/** Cidade conhecida sai na hora. Cidade nova tenta o mapa antes de copiar. */
export async function montarMensagemDisponibilidadeDhlAoVivo(alerta: {
  regiao: string;
  posicao: string;
  finalizadaEm: string;
  uf?: string;
}): Promise<string> {
  const uf = String(alerta.uf || '').toUpperCase();
  if (!uf || descreverReferencia(alerta.posicao, uf)) {
    return montarMensagemDisponibilidadeDhl({ ...alerta, uf });
  }
  try {
    const resp = await authFetch(`/api/geocode-address?address=${encodeURIComponent(`${alerta.posicao}, Brasil`)}`);
    if (!resp.ok) return montarMensagemDisponibilidadeDhl({ ...alerta, uf });
    const data = await resp.json();
    const lat = Number(data?.location?.lat);
    const lng = Number(data?.location?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return montarMensagemDisponibilidadeDhl({ ...alerta, uf });
    return montarMensagemDisponibilidadeDhl({ ...alerta, uf }, descreverDeCoordenada({ lat, lng }, uf));
  } catch {
    return montarMensagemDisponibilidadeDhl({ ...alerta, uf });
  }
}

export const DHL_COPIA_ALERTA_EVENT = 'tmseg:dhl-copia-alerta';

export type AvisoCopiaDhl = {
  missionId: string;
  copiadoPor: string;
  posicao?: string;
  regiao?: string;
  origem: 'ao-vivo' | 'clique';
};

export type ResultadoCopiaDhl = {
  resultado: 'ok' | 'ja' | 'bloqueado' | 'erro';
  copiadoPor: string | null;
  posicao: string | null;
  regiao: string | null;
};

function normalizarOperador(nome?: string | null): string {
  return String(nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function mesmoOperador(a?: string | null, b?: string | null): boolean {
  const na = normalizarOperador(a);
  const nb = normalizarOperador(b);
  return !!na && na === nb;
}

/** Outra pessoa já levou o texto. O próprio operador ainda pode copiar de novo. */
export function copiaBloqueadaPara(copiadoPor?: string | null, eu?: string | null): boolean {
  const quem = String(copiadoPor || '').trim();
  if (!quem) return false;
  return !mesmoOperador(quem, eu);
}

export function textoAlertaJaCopiado(por: string, missionId: string, posicao?: string | null): string {
  const quem = String(por || '').trim() || 'Outro operador';
  const onde = String(posicao || '').trim();
  const lugar = onde ? ` (${onde})` : '';
  return `${quem} já copiou a mensagem da OS ${missionId}${lugar}. Não envie de novo no grupo da DHL.`;
}

/** Frase fixa do aviso que sobe para a operação quando a viatura entra na regra. */
export const TEXTO_ALERTA_VIATURA_DISPONIVEL = 'Tem viatura disponível, favor mandar pra DHL.';

export function detalheAlertaViaturaDisponivel(posicao?: string | null, regiao?: string | null): string {
  const onde = String(posicao || '').trim();
  const reg = String(regiao || '').trim();
  if (onde && reg) return `${onde} · ${rotuloRegiao(reg)}`;
  if (onde) return onde;
  return reg ? rotuloRegiao(reg) : '';
}

/** Só a primeira vez, enquanto ainda dá tempo de comunicar. Copiada ou vencida não avisa de novo. */
export function deveAvisarOperadores(status: string, finalizadaEm: string, now: Date = new Date()): boolean {
  return status === 'pendente' && dentroDaJanela(finalizadaEm, now);
}

export function abrirAlertaCopiaDhl(aviso: AvisoCopiaDhl) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(DHL_COPIA_ALERTA_EVENT, { detail: aviso }));
}

export function erroTabelaAusente(error: { code?: string; message?: string } | null | undefined): boolean {
  const msg = `${error?.code || ''} ${error?.message || ''}`;
  return /42P01|PGRST205|does not exist|schema cache|Could not find the table/i.test(msg);
}

function avisarOutrasTelas(payload: Record<string, unknown>) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(MISSION_LIVE_WINDOW_EVENT, {
      detail: { event: 'dhl_viatura', payload },
    }));
  }
  void publishMissionLive('dhl_viatura', payload);
}

export async function garantirAlertaDhl(rascunho: RascunhoAlertaDhl | null): Promise<void> {
  if (!rascunho?.missionId) return;
  try {
    const { data: existing, error: readError } = await supabase
      .from(TABELA_DHL_VIATURA)
      .select('mission_id')
      .eq('mission_id', rascunho.missionId)
      .limit(1);
    if (readError) {
      if (!erroTabelaAusente(readError)) console.warn('[DHL viatura] leitura:', readError.message);
      return;
    }
    if (existing && existing.length > 0) return;
    const agora = new Date().toISOString();
    const { error } = await supabase.from(TABELA_DHL_VIATURA).insert({
      mission_id: rascunho.missionId,
      provider_name: rascunho.providerName || null,
      cliente: rascunho.cliente || null,
      posicao: rascunho.posicao,
      cidade: rascunho.cidade || null,
      uf: rascunho.uf,
      regiao: rascunho.regiao,
      finalizada_em: rascunho.finalizadaEm,
      status: 'pendente',
      created_at: agora,
      updated_at: agora,
    });
    if (error) {
      if (String(error.code) === '23505') return;
      if (!erroTabelaAusente(error)) console.warn('[DHL viatura] insert:', error.message);
      return;
    }
    avisarOutrasTelas({
      missionId: rascunho.missionId,
      status: 'pendente',
      posicao: rascunho.posicao,
      regiao: rascunho.regiao,
      uf: rascunho.uf,
    });
  } catch (err) {
    console.warn('[DHL viatura] garantir:', err);
  }
}

async function expirarVencidos(): Promise<void> {
  const cutoff = new Date(Date.now() - HORA_MS).toISOString();
  const agora = new Date().toISOString();
  const { error } = await supabase
    .from(TABELA_DHL_VIATURA)
    .update({
      status: 'expirado',
      expirado_em: agora,
      motivo_bloqueio: MOTIVO_BLOQUEIO,
      updated_at: agora,
    })
    .eq('status', 'pendente')
    .lt('finalizada_em', cutoff);
  if (error && !erroTabelaAusente(error)) console.warn('[DHL viatura] expirar:', error.message);
}

type LinhaMissaoFinalizada = {
  id?: string | null;
  status?: string | null;
  is_same_os?: boolean | null;
  provider?: string | null;
  client?: string | null;
  current_location?: string | null;
  destination?: string | null;
  end_time?: string | null;
  last_update?: string | null;
};

/** Só os campos públicos. Não devolve fornecedor nem cliente. */
export function rascunhosDeMissoesFinalizadas(rows: LinhaMissaoFinalizada[], now: Date = new Date()): RascunhoAlertaDhl[] {
  const saida: RascunhoAlertaDhl[] = [];
  for (const row of rows) {
    const rascunho = resolverAlertaDhl({
      missionId: String(row.id || ''),
      status: String(row.status || ''),
      isSameOs: !!row.is_same_os,
      provider: String(row.provider || ''),
      client: String(row.client || ''),
      currentLocation: String(row.current_location || ''),
      destination: String(row.destination || ''),
      endTime: row.end_time ? String(row.end_time) : null,
      lastUpdate: row.last_update ? String(row.last_update) : null,
    }, now);
    if (rascunho) saida.push(rascunho);
  }
  return saida;
}

/** Missões concluídas nos últimos 30 minutos. O portal usa isso direto, sem esperar o botão de finalizar. */
export async function buscarMissoesFinalizadasNaJanela(now: Date = new Date(), opts?: { interno?: boolean }): Promise<RascunhoAlertaDhl[]> {
  const corte = new Date(now.getTime() - HORA_MS).toISOString();
  const colunas = opts?.interno
    ? 'id, provider, client, status, current_location, destination, end_time, last_update, is_same_os'
    : 'id, status, current_location, destination, end_time, last_update, is_same_os';
  const { data, error } = await supabase
    .from('missions')
    .select(colunas)
    .eq('status', 'Concluída')
    .gte('end_time', corte)
    .order('end_time', { ascending: false })
    .limit(80);
  if (error || !data) {
    if (error) console.warn('[DHL viatura] missões recentes:', error.message);
    return [];
  }
  return rascunhosDeMissoesFinalizadas(data as LinhaMissaoFinalizada[], now);
}

async function reconciliarRecentes(now: Date): Promise<void> {
  const recentes = await buscarMissoesFinalizadasNaJanela(now, { interno: true });
  for (const rascunho of recentes) await garantirAlertaDhl(rascunho);
}

export async function carregarAlertasDhl(opts?: { reconciliar?: boolean }): Promise<{ alertas: AlertaDhl[]; tabelaOk: boolean }> {
  try {
    const probe = await supabase.from(TABELA_DHL_VIATURA).select('mission_id').limit(1);
    if (probe.error) {
      if (!erroTabelaAusente(probe.error)) console.warn('[DHL viatura] probe:', probe.error.message);
      return { alertas: [], tabelaOk: !erroTabelaAusente(probe.error) };
    }
    const now = new Date();
    if (opts?.reconciliar) await reconciliarRecentes(now);
    await expirarVencidos();
    const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from(TABELA_DHL_VIATURA)
      .select('*')
      .gte('finalizada_em', since)
      .order('finalizada_em', { ascending: false })
      .limit(300);
    if (error) {
      if (!erroTabelaAusente(error)) console.warn('[DHL viatura] lista:', error.message);
      return { alertas: [], tabelaOk: !erroTabelaAusente(error) };
    }
    return { alertas: (data || []) as AlertaDhl[], tabelaOk: true };
  } catch (err) {
    console.warn('[DHL viatura] carregar:', err);
    return { alertas: [], tabelaOk: true };
  }
}

export async function marcarCopiadoDhl(missionId: string, por: string): Promise<ResultadoCopiaDhl> {
  const cutoff = new Date(Date.now() - HORA_MS).toISOString();
  const agora = new Date().toISOString();
  const vazio = { copiadoPor: null, posicao: null, regiao: null };
  try {
    const { data, error } = await supabase
      .from(TABELA_DHL_VIATURA)
      .update({
        status: 'copiado',
        copiado_em: agora,
        copiado_por: por || 'Operador',
        updated_at: agora,
      })
      .eq('mission_id', missionId)
      .eq('status', 'pendente')
      .gte('finalizada_em', cutoff)
      .select('mission_id, posicao, regiao, copiado_por');
    if (error) return { resultado: 'erro', ...vazio };
    if (data && data.length > 0) {
      const salvo = data[0] as { posicao?: string | null; regiao?: string | null; copiado_por?: string | null };
      const copiadoPor = String(salvo.copiado_por || por || 'Operador');
      avisarOutrasTelas({
        missionId,
        status: 'copiado',
        copiadoPor,
        posicao: String(salvo.posicao || ''),
        regiao: String(salvo.regiao || ''),
      });
      return {
        resultado: 'ok',
        copiadoPor,
        posicao: salvo.posicao ? String(salvo.posicao) : null,
        regiao: salvo.regiao ? String(salvo.regiao) : null,
      };
    }
    const { data: row } = await supabase
      .from(TABELA_DHL_VIATURA)
      .select('status, copiado_por, posicao, regiao')
      .eq('mission_id', missionId)
      .limit(1);
    const atual = row?.[0] as { status?: string; copiado_por?: string | null; posicao?: string | null; regiao?: string | null } | undefined;
    const status = String(atual?.status || '');
    const detalhe = {
      copiadoPor: atual?.copiado_por ? String(atual.copiado_por) : null,
      posicao: atual?.posicao ? String(atual.posicao) : null,
      regiao: atual?.regiao ? String(atual.regiao) : null,
    };
    if (status === 'copiado' || status === 'confirmado') return { resultado: 'ja', ...detalhe };
    return { resultado: 'bloqueado', ...detalhe };
  } catch {
    return { resultado: 'erro', copiadoPor: null, posicao: null, regiao: null };
  }
}

export async function confirmarEnvioDhl(missionId: string, por: string): Promise<boolean> {
  const agora = new Date().toISOString();
  try {
    const { data, error } = await supabase
      .from(TABELA_DHL_VIATURA)
      .update({
        status: 'confirmado',
        confirmado_em: agora,
        confirmado_por: por || 'Operador',
        updated_at: agora,
      })
      .eq('mission_id', missionId)
      .in('status', ['copiado', 'pendente'])
      .select('mission_id');
    if (error || !data?.length) return false;
    avisarOutrasTelas({ missionId, status: 'confirmado' });
    return true;
  } catch {
    return false;
  }
}

export async function salvarObservacaoDhl(missionId: string, texto: string): Promise<boolean> {
  const motivo = String(texto || '').trim();
  if (!missionId || !motivo) return false;
  try {
    const noteRes = await authFetch('/api/controle-diario-notas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mission_id: missionId,
        note: textoMotivoNaOs(motivo),
        kind: 'observacao',
      }),
    });
    if (!noteRes.ok) return false;
    const { error } = await supabase
      .from(TABELA_DHL_VIATURA)
      .update({
        observacao_diretoria: motivo,
        updated_at: new Date().toISOString(),
      })
      .eq('mission_id', missionId);
    if (error) return false;
    avisarOutrasTelas({ missionId, status: 'observacao', observacao: motivo });
    return true;
  } catch {
    return false;
  }
}
