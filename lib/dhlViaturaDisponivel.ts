import { formatDateTimeBR } from './dateUtils';
import { extractCityFromAddress, extractUF, UF_TO_REGION } from './financialUtils';
import { publishMissionLive, MISSION_LIVE_WINDOW_EVENT } from './missionLiveBroadcast';
import { supabase } from './supabase';

/** Janela em que a viatura ainda é considerada no lugar da finalização. */
export const HORA_MS = 60 * 60 * 1000;

export const TABELA_DHL_VIATURA = 'dhl_viatura_disponivel';

export const MOTIVO_BLOQUEIO =
  'Ninguém clicou em Comunicar a DHL dentro de 1 hora. A viatura saiu do painel porque já não está mais nessa posição.';

export const UFS_EXCLUIDAS = new Set(['SP', 'RJ']);

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
 * Vermelho: passou 1 hora sem o clique — bloqueado, fora do painel vivo.
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

export function entraNaListaBloqueados(alerta: Pick<AlertaDhl, 'status' | 'finalizada_em'>, now: Date): boolean {
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

/** Operação interna. Cliente, comercial e fornecedor não veem o painel. */
export function podeVerPainelDhl(user: UsuarioPainel | null | undefined): boolean {
  if (!user) return false;
  if (user.providerId || user.userType === 'provider') return false;
  if (user.clientId || user.userType === 'client') return false;
  const role = papel(user);
  if (role.includes('comercial')) return false;
  if (
    role.includes('operador')
    || role.includes('diretoria')
    || role.includes('administrador')
    || role.includes('avancado')
    || role.includes('financeiro')
    || role.includes('controller')
  ) return true;
  return !!user.permissions?.includes('*');
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
 * OS concluída, que não seja desdobramento da mesma OS, cuja última posição
 * não é São Paulo nem Rio de Janeiro.
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
  if (!uf || UFS_EXCLUIDAS.has(uf)) return null;
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
}): string {
  const regiao = rotuloRegiao(alerta.regiao);
  const local = String(alerta.posicao || '').replace(/\s+/g, ' ').trim();
  const quando = formatDateTimeBR(alerta.finalizadaEm);
  return [
    '🟢 *EQUIPE TM SEGUE INFORMA*',
    '',
    `Temos uma viatura disponível na região *${regiao}*.`,
    '',
    '📍 *Última posição (fim de viagem):*',
    local,
    '',
    '✅ A equipe acabou de finalizar.',
    `🕒 *Finalização:* ${quando}`,
    '',
    '🚛 *Equipe disponível para novas missões.*',
  ].join('\n');
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
    avisarOutrasTelas({ missionId: rascunho.missionId, status: 'pendente' });
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

async function reconciliarRecentes(now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - (HORA_MS - 60_000)).toISOString();
  const { data, error } = await supabase
    .from('missions')
    .select('id, provider, client, status, current_location, destination, end_time, last_update, is_same_os')
    .eq('status', 'Concluída')
    .gte('last_update', cutoff)
    .limit(80);
  if (error || !data) return;
  for (const row of data as Array<Record<string, unknown>>) {
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
    if (rascunho) await garantirAlertaDhl(rascunho);
  }
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

export async function marcarCopiadoDhl(missionId: string, por: string): Promise<'ok' | 'ja' | 'bloqueado' | 'erro'> {
  const cutoff = new Date(Date.now() - HORA_MS).toISOString();
  const agora = new Date().toISOString();
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
      .select('mission_id');
    if (error) return 'erro';
    if (data && data.length > 0) {
      avisarOutrasTelas({ missionId, status: 'copiado' });
      return 'ok';
    }
    const { data: row } = await supabase
      .from(TABELA_DHL_VIATURA)
      .select('status')
      .eq('mission_id', missionId)
      .limit(1);
    const status = String(row?.[0]?.status || '');
    if (status === 'copiado' || status === 'confirmado') return 'ja';
    return 'bloqueado';
  } catch {
    return 'erro';
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
  try {
    const { error } = await supabase
      .from(TABELA_DHL_VIATURA)
      .update({
        observacao_diretoria: texto.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('mission_id', missionId);
    if (!error) avisarOutrasTelas({ missionId, status: 'observacao' });
    return !error;
  } catch {
    return false;
  }
}
