/**
 * Handler HTTP do portal CEVA — leve para Vercel (não passa pelo Express/api/index).
 * O catch-all Express estoura tempo e o login ficava em "Aguarde...".
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { carimboRecalculoAutomatico } from '../missionSnapshot.js';
import { createSupabaseAdminClient } from '../supabaseAdmin.js';
import { PORTAL_CEVA, PORTAL_IBL, portalGenerico, tabelaAusenteNoBanco, type PortalServidor } from './portalServidor.js';
import {
  emailDeAcesso,
  gerarSenhaTemporaria,
  hashSenha,
  nomeDeAcesso,
  perfilDeAcesso,
  podeCadastrarPessoa,
  senhaConfere,
  validarSenha,
  type PerfilCeva,
} from './acesso.js';
import {
  caminhoPortalDasPermissoes,
  decidirPrimeiroAcesso,
  deveTrocarSenhaPortal,
  mensagemAcessoPortal,
  permissoesDoPortal,
  podeRemoverPessoa,
  usuarioSoPortal,
} from './regrasAcesso.js';
import { alinharStatusCadastroPortal, colunaSenhaAlteradaAusente, vincularCadastroCliente } from './cadastroSistema.js';
import { ehEquipeInterna, origemDoTokenPortal, senhaEquipeConfere, tokenDaEquipeInterna } from './equipeInterna.js';
import {
  CEVA_PORTAL_LOGIN_ENABLED,
  type CevaPortalSession,
} from './rules.js';
import { sendCevaPortalAccessEmail, systemAppUrl } from './emailAcesso.js';
import type { CevaBoletimMission } from './report.js';
import type { CampoFiltro } from './camposCliente.js';
// Imports pesados (billing/report/ao-vivo) entram via import() dinâmico nas ops
// que precisam — evita cold-start do login puxar financialUtils/supabasePaging
// e quebrar o bundle Vercel com ERR_MODULE_NOT_FOUND.

const contextoPortal = new AsyncLocalStorage<PortalServidor>();

function cfg(): PortalServidor {
  return contextoPortal.getStore() ?? PORTAL_CEVA;
}

function comDono<T extends Record<string, unknown>>(row: T): T {
  if (cfg().clientId == null) return row;
  return { ...row, client_id: cfg().clientId };
}

function conflitoCatalogo(): string {
  return cfg().clientId != null ? 'client_id,campo,valor' : 'campo,valor';
}

function tokenDoPortal(userId: string | number, now = Date.now()): string {
  return `${cfg().tokenPrefix}-${userId}-${now}`;
}

const STOP_WORDS = ['LTDA', 'LTDA.', 'S.A.', 'S.A', 'SA', 'S/A', 'S/A.', 'DO', 'DE', 'DA', 'E', 'DAS', 'DOS'];

function quoteForOr(v: string): string {
  return /[(),.:]/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v;
}

/** Filtro local — evita importar financialUtils (1.8k linhas) no handler serverless. */
function clientFuzzyFilter(clientName: string): string {
  const trimmed = (clientName || '').trim();
  if (!trimmed) return `client.eq.${quoteForOr(clientName)}`;
  const words = trimmed.split(/\s+/).filter((w) => !STOP_WORDS.includes(w.toUpperCase()));
  const short = words.length >= 2
    ? `${words[0]} ${words[1].substring(0, Math.min(6, words[1].length))}`
    : words[0] || trimmed;
  return `client.eq.${quoteForOr(clientName)},client.ilike.${quoteForOr('%' + short + '%')}`;
}

const INVALID_LOGIN = 'E-mail ou senha inválidos.';
const attempts = new Map<string, { count: number; resetAt: number }>();

function clientIp(req: any): string {
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || req.ip || 'unknown';
}

function tooManyAttempts(key: string): boolean {
  const row = attempts.get(key);
  if (!row || row.resetAt < Date.now()) {
    if (row) attempts.delete(key);
    return false;
  }
  return row.count >= 10;
}

function registerFailure(key: string): void {
  const now = Date.now();
  const row = attempts.get(key);
  if (!row || row.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return;
  }
  row.count += 1;
}

function clearFailures(key: string): void {
  attempts.delete(key);
}

type PortalUser = CevaPortalSession & { perfil: PerfilCeva; trocarSenha: boolean; trocarEmail?: boolean; equipeInterna?: boolean };

function usuarioPublico(row: { id: number | string; nome: string; email: string; perfil: PerfilCeva; trocarSenha?: boolean; trocarEmail?: boolean }) {
  return {
    id: String(row.id),
    name: String(row.nome || '').trim(),
    email: String(row.email || '').trim().toLowerCase(),
    perfil: row.perfil,
    trocarSenha: row.trocarSenha === true,
    trocarEmail: row.trocarEmail === true,
  };
}

function sessaoDe(row: { id: number | string; nome: string; email: string; perfil: string; trocar_senha?: boolean | null; trocar_email?: boolean | null; senha_alterada_em?: string | null }): PortalUser | null {
  const perfil = perfilDeAcesso(row.perfil);
  if (!perfil) return null;
  const trocarEmail = row.trocar_email === true;
  const trocarSenha = trocarEmail || deveTrocarSenhaPortal({
    trocarSenha: row.trocar_senha === true,
    senhaAlteradaEm: row.senha_alterada_em,
  });
  const user = usuarioPublico({ ...row, perfil, trocarSenha, trocarEmail });
  return { ...user, perfil, trocarSenha, trocarEmail };
}

async function lerUsuarioPortal(
  sb: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  filtro: { id?: string; email?: string },
  comSenha: boolean,
) {
  const base = comSenha
    ? 'id, nome, email, senha_hash, perfil, status, trocar_senha'
    : 'id, nome, email, perfil, status, trocar_senha';
  const consulta = (colunas: string) => {
    let query = sb.from(cfg().tabelas.usuarios).select(colunas);
    if (filtro.id) query = query.eq('id', filtro.id);
    if (filtro.email) query = query.eq('email', filtro.email);
    if (cfg().clientId != null) query = query.eq('client_id', cfg().clientId);
    return query.maybeSingle();
  };
  const completo = await consulta(`${base}, senha_alterada_em, trocar_email`);
  if (!completo.error) return completo;
  if (/trocar_email/i.test(String(completo.error.message || ''))) {
    const semEmail = await consulta(`${base}, senha_alterada_em`);
    if (!colunaSenhaAlteradaAusente(semEmail.error)) return semEmail;
  }
  if (!colunaSenhaAlteradaAusente(completo.error)) return completo;
  return consulta(base);
}

function sessaoAberta(): PortalUser {
  return {
    id: 'aberto',
    name: cfg().rotulo,
    email: 'sem-login',
    perfil: 'administrador',
    trocarSenha: false,
  };
}

function sessaoDaEquipe(row: { id: number | string; name?: string | null; email?: string | null }): PortalUser {
  return {
    id: String(row.id),
    name: String(row.name || '').trim() || 'Equipe interna',
    email: String(row.email || '').trim().toLowerCase(),
    perfil: 'administrador',
    trocarSenha: false,
    equipeInterna: true,
  };
}

async function sessaoEquipeInterna(
  sb: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  id: string,
): Promise<PortalUser | null> {
  const { data, error } = await sb
    .from('system_users')
    .select('id, name, email, status, client_id, provider_id, user_type, permissions')
    .eq('id', id)
    .maybeSingle();
  if (error || !ehEquipeInterna(data)) return null;
  return sessaoDaEquipe(data);
}

async function portalSession(req: any): Promise<PortalUser | null> {
  const header = String(req.headers?.authorization || req.headers?.[cfg().headerSessao] || '');
  const token = origemDoTokenPortal(cfg().tokenPrefix, header);
  if (!token) return cfg().exigeLogin ? null : sessaoAberta();
  const sb = createSupabaseAdminClient();
  if (!sb) return null;
  if (token.origem === 'equipe') {
    const equipe = await sessaoEquipeInterna(sb, token.id);
    if (equipe) return equipe;
    return cfg().exigeLogin ? null : sessaoAberta();
  }

  const { data: user, error } = await lerUsuarioPortal(sb, { id: token.id }, false);
  if (error) return null;
  if (!user || user.status !== 'ativo') return cfg().exigeLogin ? null : sessaoAberta();
  return sessaoDe(user);
}

function bloquearPessoasSemLogin(res: any, session: PortalUser): boolean {
  if (session.id !== 'aberto') return false;
  res.status(403).json({ error: 'O cadastro de pessoas fica para quando o login for ligado.' });
  return true;
}

function exigirUso(res: any, session: PortalUser | null): session is PortalUser {
  if (!session) {
    res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
    return false;
  }
  if (session.trocarSenha) {
    res.status(403).json({ error: 'Troque a senha para continuar. A troca é obrigatória no primeiro acesso e a cada 30 dias.', trocarSenha: true });
    return false;
  }
  return true;
}

async function existeAdministrador(sb: NonNullable<ReturnType<typeof createSupabaseAdminClient>>): Promise<boolean> {
  let query = sb
    .from(cfg().tabelas.usuarios)
    .select('id', { count: 'exact', head: true })
    .eq('perfil', 'administrador');
  if (cfg().clientId != null) query = query.eq('client_id', cfg().clientId);
  const { count, error } = await query;
  if (error) throw error;
  return (count || 0) > 0;
}

async function outroAdministradorVivo(sb: NonNullable<ReturnType<typeof createSupabaseAdminClient>>, id: number): Promise<boolean> {
  let query = sb
    .from(cfg().tabelas.usuarios)
    .select('id', { count: 'exact', head: true })
    .eq('perfil', 'administrador')
    .neq('status', 'inativo')
    .neq('id', id);
  if (cfg().clientId != null) query = query.eq('client_id', cfg().clientId);
  const { count, error } = await query;
  if (error) throw error;
  return (count || 0) > 0;
}

function rowToJson(row: any) {
  return {
    id: row.id,
    numero: row.numero,
    dataInicio: row.data_inicio,
    dataFim: row.data_fim,
    solicitante: row.solicitante,
    quemAutorizou: row.quem_autorizou,
    servico: row.servico,
    atendimentoPgr: row.atendimento_pgr,
    contrato: row.contrato,
    operacao: row.operacao,
    tsp: row.tsp,
    placa: row.placa,
    motorista: row.motorista,
    franquiaHora: row.franquia_hora,
    franquiaKm: row.franquia_km,
    filledByName: row.filled_by_name,
    filledByEmail: row.filled_by_email,
    createdAt: row.created_at,
  };
}

function vehicleKey(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return value.trim();
  return '';
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

async function loadAll(sb: NonNullable<ReturnType<typeof createSupabaseAdminClient>>, table: string): Promise<any[]> {
  const pageSize = 1000;
  const rows: any[] = [];
  for (let from = 0; from < 20000; from += pageSize) {
    const { data, error } = await sb.from(table).select('*').range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
  throw new Error(`Consulta de ${table} incompleta.`);
}

async function loadPriceTables(sb: NonNullable<ReturnType<typeof createSupabaseAdminClient>>, clientName: string): Promise<any[]> {
  const pageSize = 1000;
  const rows: any[] = [];
  for (let from = 0; from < 20000; from += pageSize) {
    const { data, error } = await sb.from('client_price_tables').select('*').or(clientFuzzyFilter(clientName)).range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
  throw new Error(`Tabelas de preço da ${cfg().rotulo} incompletas.`);
}

async function loadPlates(sb: NonNullable<ReturnType<typeof createSupabaseAdminClient>>, vehicleIds: unknown[]): Promise<Map<string, string>> {
  const ids = [...new Set(vehicleIds.map(vehicleKey).filter(Boolean))];
  const plates = new Map<string, string>();
  for (const part of chunks(ids, 200)) {
    const { data, error } = await sb.from('client_vehicles').select('id, plate').in('id', part);
    if (error) throw error;
    for (const row of data || []) {
      const plate = String(row.plate || '').trim();
      if (plate && !/^\d+$/.test(plate)) plates.set(String(row.id), plate);
    }
  }
  return plates;
}

async function loadCancelTimes(sb: NonNullable<ReturnType<typeof createSupabaseAdminClient>>, missionIds: string[]): Promise<Map<string, string>> {
  const times = new Map<string, string>();
  for (const part of chunks(missionIds, 80)) {
    const pageSize = 1000;
    for (let from = 0; from < 20000; from += pageSize) {
      const { data, error } = await sb
        .from('mission_history')
        .select('mission_id, changed_at, new_value')
        .in('mission_id', part)
        .eq('field_name', 'status')
        .order('changed_at', { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      for (const row of data || []) {
        if (String(row.new_value || '').toLowerCase().includes('cancel') && row.changed_at) {
          times.set(String(row.mission_id), String(row.changed_at));
        }
      }
      if (!data || data.length < pageSize) break;
      if (from + pageSize >= 20000) throw new Error('Histórico de cancelamento incompleto.');
    }
  }
  return times;
}

async function loadLatestLogs(sb: NonNullable<ReturnType<typeof createSupabaseAdminClient>>, entity: string, missionIds: string[]): Promise<Map<string, any>> {
  const logs = new Map<string, any>();
  for (const part of chunks(missionIds, 80)) {
    const pageSize = 1000;
    for (let from = 0; from < 20000; from += pageSize) {
      const { data, error } = await sb
        .from('system_logs')
        .select('entity_id, details, created_at')
        .eq('entity', entity)
        .in('entity_id', part)
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      for (const row of data || []) {
        const id = String(row.entity_id || '');
        if (!id || logs.has(id)) continue;
        try { logs.set(id, JSON.parse(row.details)); } catch { /* detalhe ilegível não vira número */ }
      }
      if (!data || data.length < pageSize) break;
      if (from + pageSize >= 20000) throw new Error(`Log ${entity} incompleto.`);
    }
  }
  return logs;
}

const COLUNA_CAMPO = {
  solicitante: 'solicitante',
  quemAutorizou: 'quem_autorizou',
  servico: 'servico',
  atendimentoPgr: 'atendimento_pgr',
  contrato: 'contrato',
  operacao: 'operacao',
  tsp: 'tsp',
} as const;

const CATALOGO_CAMPO: Record<CampoFiltro, string> = {
  solicitante: 'solicitante',
  quemAutorizou: 'quem_autorizou',
  servico: 'servico',
  contrato: 'contrato',
  operacao: 'operacao',
  tsp: 'tsp',
};

function aplicarCamposCliente(
  item: { os: string; solicitante: string | null; quemAutorizou: string | null; servico: string | null; atendimentoPgr: string | null; contrato: string | null; operacao: string | null; tsp: string | null },
  salvo: any,
  servicoDoSistema: (valor: string | null | undefined) => string | null,
) {
  item.solicitante = salvo?.solicitante ?? null;
  item.quemAutorizou = salvo?.quem_autorizou ?? null;
  item.servico = salvo?.servico || servicoDoSistema(item.servico);
  item.atendimentoPgr = salvo?.atendimento_pgr ?? null;
  item.contrato = salvo?.contrato ?? null;
  item.operacao = salvo?.operacao ?? null;
  item.tsp = salvo?.tsp ?? null;
}

function acessoNegado(error: unknown): boolean {
  const row = error as { code?: string; message?: string };
  return row?.code === '42501' || String(row?.message || '').toLowerCase().includes('permission denied');
}

/** Nome oficial em clients. A IBL entra como Intermodal; a CEVA continua pelo nome exato. */
async function carregarClienteDoPortal(sb: NonNullable<ReturnType<typeof createSupabaseAdminClient>>) {
  if (cfg().clientId != null) {
    const { data, error } = await sb.from('clients').select('*').eq('id', cfg().clientId).maybeSingle();
    if (error) throw error;
    return data;
  }
  const busca = String(cfg().clienteBusca || '').trim();
  if (!busca) {
    const { data, error } = await sb.from('clients').select('*').eq('name', cfg().clienteNome).maybeSingle();
    if (error) throw error;
    return data;
  }
  const { data, error } = await sb.from('clients').select('*').ilike('name', `%${busca}%`).limit(20);
  if (error) throw error;
  const linhas = data || [];
  const oficial = linhas.find((row: { name?: string }) => String(row.name || '').trim().toUpperCase() === cfg().clienteNome.toUpperCase());
  if (oficial) return oficial;
  return linhas.length === 1 ? linhas[0] : null;
}

async function loadCamposCliente(sb: NonNullable<ReturnType<typeof createSupabaseAdminClient>>, missionIds: string[]) {
  const map = new Map<string, any>();
  for (const part of chunks(missionIds, 200)) {
    const { data, error } = await sb.from(cfg().tabelas.osCampos).select('*').in('mission_id', part);
    if (error) throw error;
    for (const row of data || []) map.set(String(row.mission_id), row);
  }
  return map;
}

async function loadCatalogo(sb: NonNullable<ReturnType<typeof createSupabaseAdminClient>>) {
  const catalogo: Record<CampoFiltro, string[]> & { atendimentoPgr: string[] } = {
    solicitante: [],
    quemAutorizou: [],
    servico: [],
    contrato: [],
    operacao: [],
    tsp: [],
    atendimentoPgr: [],
  };
  let queryCatalogo = sb.from(cfg().tabelas.catalogo).select('campo, valor').order('valor');
  if (cfg().clientId != null) queryCatalogo = queryCatalogo.eq('client_id', cfg().clientId);
  const { data, error } = await queryCatalogo;
  if (error) throw error;
  const reverso: Record<string, keyof typeof catalogo> = {
    solicitante: 'solicitante',
    quem_autorizou: 'quemAutorizou',
    servico: 'servico',
    contrato: 'contrato',
    operacao: 'operacao',
    tsp: 'tsp',
    atendimento_pgr: 'atendimentoPgr',
  };
  for (const row of data || []) {
    const campo = reverso[String(row.campo)];
    if (campo) catalogo[campo].push(String(row.valor));
  }
  return catalogo;
}

async function gravarColuna(sb: NonNullable<ReturnType<typeof createSupabaseAdminClient>>, missionId: string, campo: keyof typeof COLUNA_CAMPO, valor: string | null) {
  const coluna = COLUNA_CAMPO[campo];
  const { data: atual, error: leitura } = await sb.from(cfg().tabelas.osCampos).select('*').eq('mission_id', missionId).maybeSingle();
  if (leitura) throw leitura;
  const payload = comDono({ ...(atual || { mission_id: missionId }), [coluna]: valor, updated_at: new Date().toISOString() });
  delete payload.id;
  const { error } = await sb.from(cfg().tabelas.osCampos).upsert(payload, { onConflict: 'mission_id' });
  if (error) throw error;
  return atual;
}

function hydrateSnapshot<T extends CevaBoletimMission>(mission: T, logSnapshot: any): T {
  if (!logSnapshot || mission.snapshot_approved_by) return mission;
  if (carimboRecalculoAutomatico(logSnapshot.approved_by)) return mission;
  return {
    ...mission,
    snapshot_data: logSnapshot,
    snapshot_approved_by: logSnapshot.approved_by || 'Sistema',
  };
}


function parseBody(body: unknown): any {
  if (typeof body === 'string') {
    if (!body.trim()) return {};
    return JSON.parse(body);
  }
  return body || {};
}

function anotarQuery(req: any, extra: Record<string, string>): void {
  const atual = req?.query;
  if (!atual || typeof atual !== 'object') return;
  Object.assign(atual, extra);
}

function resolveOp(req: any): string {
  const fromQuery = String(req.query?.op || '').trim();
  if (fromQuery) return fromQuery;
  const url = String(req.url || '');
  const path = url.split('?')[0];
  const match = path.match(/\/api\/(?:ceva|ibl|cliente)-portal\/([^/]+)(?:\/([^/]+))?/);
  if (!match) return '';
  const head = match[1];
  const tail = match[2];
  if (head === 'pessoas' && tail) {
    anotarQuery(req, { id: tail });
    return 'pessoas-item';
  }
  if ((head === 'pgr' || head === 'fotos') && tail) {
    anotarQuery(req, { os: tail });
    return head;
  }
  return head;
}

/** Entrada do portal genérico. A página usa o slug; a API reaproveita o handler da IBL. */
export async function handleClientePortalHttp(req: any, res: any): Promise<void> {
  res.setHeader?.('Cache-Control', 'no-store');
  const method = String(req.method || 'GET').toUpperCase();
  const op = resolveOp(req);
  if (op === 'marca-site' && method === 'POST') {
    const { responderMarcaSite } = await import('../portalCliente/marcaSiteHttp.js');
    await responderMarcaSite(req, res);
    return;
  }
  if (op === 'provisionar' && method === 'POST') {
    const { responderProvisionar } = await import('../portalCliente/provisionarHttp.js');
    await responderProvisionar(req, res);
    return;
  }
  const slug = String(req.headers?.['x-portal-slug'] || req.query?.slug || '').trim().toLowerCase();
  if (!slug) {
    res.status(404).json({ error: 'Portal não encontrado.' });
    return;
  }
  const sb = createSupabaseAdminClient();
  if (!sb) {
    res.status(503).json({ error: 'Portal indisponível.' });
    return;
  }
  const consulta = await sb
    .from('clients')
    .select('id, name, trading_name, status, portal_ativo, portal_slug, portal_logo_url, portal_cor, portal_cor_acao')
    .eq('portal_slug', slug)
    .maybeSingle();
  if (consulta.error) {
    console.error('[portal-cliente] marca', consulta.error.message);
    res.status(503).json({ error: 'O cadastro do portal ainda não está no banco.' });
    return;
  }
  const cliente = consulta.data;
  if (!cliente || cliente.portal_ativo !== true || String(cliente.status || '') !== 'Ativo') {
    res.status(404).json({ error: 'Portal não encontrado.' });
    return;
  }
  if (op === 'marca' && method === 'GET') {
    res.status(200).json({
      slug,
      rotulo: String(cliente.trading_name || cliente.name || slug),
      logo: cliente.portal_logo_url || '',
      cor: cliente.portal_cor || '',
      corAcao: cliente.portal_cor_acao || '',
      caminho: `/${slug}`,
    });
    return;
  }
  const portal = portalGenerico(cliente);
  if (!portal) {
    res.status(404).json({ error: 'Portal não encontrado.' });
    return;
  }
  return contextoPortal.run(portal, () => executarPortalHttp(req, res));
}

/** Entrada única do portal CEVA (Vercel leve + Express local). */
export async function handleCevaPortalHttp(req: any, res: any): Promise<void> {
  return contextoPortal.run(PORTAL_CEVA, () => executarPortalHttp(req, res));
}

/** Mesmo controle de escolta, com as OS da Intermodal Brasil Logística. */
export async function handleIblPortalHttp(req: any, res: any): Promise<void> {
  return contextoPortal.run(PORTAL_IBL, () => executarPortalHttp(req, res));
}

async function executarPortalHttp(req: any, res: any): Promise<void> {
  res.setHeader?.('Cache-Control', 'no-store');
  const method = String(req.method || 'GET').toUpperCase();
  const op = resolveOp(req);
  const body = method === 'GET' || method === 'HEAD' ? {} : parseBody(req.body);

  try {
    if (op === 'acesso' && method === 'GET') {
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: 'Portal indisponível.' });
        return;
      }
      try {
        res.status(200).json({ temAdministrador: await existeAdministrador(sb) });
      } catch (error) {
        console.error(`[${cfg().logPrefix}] acesso`, error instanceof Error ? error.message : error);
        res.status(500).json({ error: 'Não foi possível abrir o acesso.' });
      }
      return;
    }

    if (op === 'login' && method === 'POST') {
      const email = emailDeAcesso(body?.email) || '';
      const senha = String(body?.senha || body?.password || '');
      const key = `${clientIp(req)}|${email}`;
      if (tooManyAttempts(key)) {
        res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.' });
        return;
      }
      if (!email || !senha) {
        res.status(400).json({ error: 'Informe e-mail e senha.' });
        return;
      }
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: 'Portal indisponível.' });
        return;
      }
      const colunasEquipe = 'id, name, email, password, password_hash, status, client_id, provider_id, user_type, permissions';
      let consultaEquipe = await sb
        .from('system_users')
        .select(colunasEquipe)
        .ilike('email', email)
        .maybeSingle();
      if (consultaEquipe.error && /password_hash/i.test(consultaEquipe.error.message || '')) {
        consultaEquipe = await sb
          .from('system_users')
          .select('id, name, email, password, status, client_id, provider_id, user_type, permissions')
          .ilike('email', email)
          .maybeSingle();
      }
      const sistema = consultaEquipe.data;
      const erroSistema = consultaEquipe.error;
      if (erroSistema) {
        console.error(`[${cfg().logPrefix}] login equipe`, erroSistema.message || erroSistema);
      } else if (sistema && ehEquipeInterna(sistema) && senhaEquipeConfere(senha, sistema.password, sistema.password_hash)) {
        clearFailures(key);
        const session = sessaoDaEquipe(sistema);
        res.status(200).json({ token: tokenDaEquipeInterna(cfg().tokenPrefix, sistema.id), user: session });
        return;
      }
      const { data: user, error: erroUsuario } = await lerUsuarioPortal(sb, { email }, true);
      if (erroUsuario) {
        console.error(`[${cfg().logPrefix}] login`, erroUsuario.message || erroUsuario);
        res.status(500).json({ error: 'Não foi possível entrar.' });
        return;
      }
      if (!user || !senhaConfere(senha, user.senha_hash)) {
        registerFailure(key);
        res.status(401).json({ error: INVALID_LOGIN });
        return;
      }
      if (user.status === 'inativo') {
        res.status(403).json({ error: 'Este acesso está bloqueado. Fale com o administrador.' });
        return;
      }
      if (user.status !== 'ativo') {
        res.status(403).json({ error: 'O administrador ainda não liberou este acesso.' });
        return;
      }
      if (!erroSistema && sistema) {
        const clienteDoLogin = await carregarClienteDoPortal(sb);
        const mesmoCliente = Boolean(clienteDoLogin?.id) && String(sistema.client_id || '') === String(clienteDoLogin.id);
        const tipo = String(sistema.user_type || '');
        const internoOuFornecedor = tipo === 'internal' || tipo === 'provider';
        if (sistema.status !== 'Ativo' || internoOuFornecedor || !mesmoCliente) {
          res.status(403).json({ error: 'Este acesso não está liberado no Cadastro de Usuários deste cliente.' });
          return;
        }
        if (usuarioSoPortal(sistema.permissions) && caminhoPortalDasPermissoes(sistema.permissions) !== cfg().caminho) {
          res.status(403).json({ error: 'Este acesso não está liberado no Cadastro de Usuários deste cliente.' });
          return;
        }
      }
      const session = sessaoDe(user);
      if (!session) {
        res.status(401).json({ error: INVALID_LOGIN });
        return;
      }
      clearFailures(key);
      res.status(200).json({ token: tokenDoPortal(user.id), user: session });
      return;
    }

    if (op === 'primeiro-acesso' && method === 'POST') {
      const key = `${clientIp(req)}|primeiro|${emailDeAcesso(body?.email) || ''}`;
      if (tooManyAttempts(key)) {
        res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.' });
        return;
      }
      const decisao = decidirPrimeiroAcesso();
      res.status(403).json({ error: decisao.error });
      return;
    }

    if (op === 'me' && method === 'GET') {
      const session = await portalSession(req);
      if (!session) {
        res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
        return;
      }
      res.status(200).json({ user: session });
      return;
    }

    if (op === 'trocar-senha' && method === 'POST') {
      const session = await portalSession(req);
      if (!session) {
        res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
        return;
      }
      if (session.equipeInterna) {
        res.status(403).json({ error: 'A senha da equipe interna é alterada no sistema.' });
        return;
      }
      const senhaAtual = String(body?.senhaAtual || '');
      const senhaNova = String(body?.senhaNova || '');
      const confirmacao = String(body?.confirmacao || '');
      const senhaInvalida = validarSenha(senhaNova);
      if (!senhaAtual || senhaInvalida) {
        res.status(400).json({ error: senhaInvalida || 'Informe a senha atual.' });
        return;
      }
      if (senhaNova !== confirmacao) {
        res.status(400).json({ error: 'A confirmação da senha não confere.' });
        return;
      }
      if (senhaNova === senhaAtual) {
        res.status(400).json({ error: 'A nova senha precisa ser diferente da senha enviada por e-mail.' });
        return;
      }
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: 'Portal indisponível.' });
        return;
      }
      let leituraUsuario = await sb.from(cfg().tabelas.usuarios).select('id, email, senha_hash, trocar_email').eq('id', session.id).maybeSingle();
      if (leituraUsuario.error && /trocar_email/i.test(String(leituraUsuario.error.message || ''))) {
        leituraUsuario = await sb.from(cfg().tabelas.usuarios).select('id, email, senha_hash').eq('id', session.id).maybeSingle();
      }
      const user = leituraUsuario.data;
      if (!user || !senhaConfere(senhaAtual, user.senha_hash)) {
        res.status(401).json({ error: 'A senha atual não confere.' });
        return;
      }
      const precisaEmail = user.trocar_email === true;
      const emailNovo = precisaEmail ? emailDeAcesso(body?.emailNovo) : null;
      if (precisaEmail && (!emailNovo || emailNovo === String(user.email || '').trim().toLowerCase())) {
        res.status(400).json({ error: 'Informe o e-mail definitivo, diferente do e-mail provisório.' });
        return;
      }
      if (emailNovo) {
        const ocupadoPortal = await sb.from(cfg().tabelas.usuarios).select('id').eq('email', emailNovo).neq('id', session.id).limit(1);
        const ocupadoSistema = await sb.from('system_users').select('id').ilike('email', emailNovo).limit(1);
        if (ocupadoPortal.error || ocupadoSistema.error) {
          res.status(500).json({ error: 'Não foi possível conferir o e-mail.' });
          return;
        }
        if ((ocupadoPortal.data || []).length > 0 || (ocupadoSistema.data || []).length > 0) {
          res.status(409).json({ error: 'Este e-mail já está em uso.' });
          return;
        }
      }
      const agora = new Date().toISOString();
      const troca: Record<string, unknown> = {
        senha_hash: hashSenha(senhaNova),
        trocar_senha: false,
        trocar_email: false,
        senha_alterada_em: agora,
        atualizado_em: agora,
      };
      if (emailNovo) troca.email = emailNovo;
      let { error } = await sb.from(cfg().tabelas.usuarios).update(troca).eq('id', session.id);
      if (error && /trocar_email|senha_alterada_em|schema cache|does not exist|Could not find/i.test(String(error.message || ''))) {
        const semColuna = { ...troca };
        delete semColuna.trocar_email;
        delete semColuna.senha_alterada_em;
        ({ error } = await sb.from(cfg().tabelas.usuarios).update(semColuna).eq('id', session.id));
      }
      if (error) {
        res.status(500).json({ error: 'Não foi possível trocar a senha.' });
        return;
      }
      if (emailNovo) {
        const cliente = await carregarClienteDoPortal(sb);
        let sistema = sb.from('system_users').update({ email: emailNovo, name: session.name }).ilike('email', String(user.email || ''));
        if (cliente?.id != null) sistema = sistema.eq('client_id', cliente.id);
        const gravouSistema = await sistema.eq('user_type', 'client');
        if (gravouSistema.error) {
          res.status(500).json({ error: 'A senha mudou, mas o e-mail não entrou no Cadastro de Usuário.' });
          return;
        }
      }
      res.status(200).json({ user: { ...session, email: emailNovo || session.email, trocarSenha: false, trocarEmail: false } });
      return;
    }

    if (op === 'pessoas' && method === 'GET') {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      if (bloquearPessoasSemLogin(res, session)) return;
      if (!podeCadastrarPessoa(session.perfil)) {
        res.status(403).json({ error: 'O analista não cadastra pessoas.' });
        return;
      }
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: 'Portal indisponível.' });
        return;
      }
      let listaPessoas = sb
        .from(cfg().tabelas.usuarios)
        .select('id, nome, email, perfil, status, trocar_senha');
      if (cfg().clientId != null) listaPessoas = listaPessoas.eq('client_id', cfg().clientId);
      const { data, error } = await listaPessoas.order('nome');
      if (error) {
        res.status(500).json({ error: 'Não foi possível carregar as pessoas.' });
        return;
      }
      res.status(200).json({
        pessoas: (data || []).map((row) => ({
          id: row.id,
          nome: row.nome,
          email: row.email,
          perfil: row.perfil,
          status: row.status,
          trocarSenha: row.trocar_senha === true,
        })),
      });
      return;
    }

    if (op === 'pessoas' && method === 'POST') {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      if (bloquearPessoasSemLogin(res, session)) return;
      if (!podeCadastrarPessoa(session.perfil)) {
        res.status(403).json({ error: 'O analista não cadastra pessoas.' });
        return;
      }
      const nome = nomeDeAcesso(body?.nome);
      const email = emailDeAcesso(body?.email);
      const perfil = perfilDeAcesso(body?.perfil);
      if (!nome) {
        res.status(400).json({ error: 'Informe o nome da pessoa.' });
        return;
      }
      if (!email) {
        res.status(400).json({ error: 'Informe um e-mail válido.' });
        return;
      }
      if (!perfil) {
        res.status(400).json({ error: 'Escolha administrador ou analista.' });
        return;
      }
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: 'Portal indisponível.' });
        return;
      }
      const senhaTemporaria = gerarSenhaTemporaria();
      const criador = Number(session.id);
      const novo = comDono({
        nome,
        email,
        perfil,
        status: 'ativo',
        trocar_senha: true,
        senha_hash: hashSenha(senhaTemporaria),
        senha_alterada_em: null,
        criado_por: session.equipeInterna || !Number.isInteger(criador) ? null : criador,
      });
      let { data, error } = await sb.from(cfg().tabelas.usuarios).insert(novo).select('id, nome, email, perfil, status, trocar_senha').single();
      if (colunaSenhaAlteradaAusente(error)) {
        const { senha_alterada_em: _ignorado, ...semData } = novo;
        ({ data, error } = await sb.from(cfg().tabelas.usuarios).insert(semData).select('id, nome, email, perfil, status, trocar_senha').single());
      }
      if (error?.code === '23505') {
        res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
        return;
      }
      if (error || !data) {
        res.status(500).json({ error: 'Não foi possível liberar o acesso.' });
        return;
      }
      const cliente = await carregarClienteDoPortal(sb);
      if (!cliente?.id) {
        await sb.from(cfg().tabelas.usuarios).delete().eq('id', data.id);
        res.status(503).json({ error: `Cliente ${cfg().clienteBusca || cfg().rotulo} não encontrado.` });
        return;
      }
      const vinculo = await vincularCadastroCliente(sb, {
        nome,
        email,
        senhaTemporaria,
        clientId: cliente.id,
        caminho: cfg().caminho,
        perfil,
        ativo: true,
      });
      if (!vinculo.ok) {
        await sb.from(cfg().tabelas.usuarios).delete().eq('id', data.id);
        res.status(409).json({ error: vinculo.error });
        return;
      }
      const enviou = await sendCevaPortalAccessEmail({ nome, email, senhaTemporaria, rotulo: cfg().rotulo, caminho: cfg().caminho });
      const link = systemAppUrl(cfg().caminho);
      res.status(201).json({
        pessoa: { id: data.id, nome: data.nome, email: data.email, perfil: data.perfil, status: data.status, trocarSenha: true },
        senhaTemporaria,
        emailEnviado: enviou,
        mensagem: mensagemAcessoPortal({ nome, email, senha: senhaTemporaria, rotulo: cfg().rotulo, link, manteveSenha: false }),
      });
      return;
    }

    if (op === 'pessoas-item' && method === 'PATCH') {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      if (bloquearPessoasSemLogin(res, session)) return;
      if (!podeCadastrarPessoa(session.perfil)) {
        res.status(403).json({ error: 'O analista não cadastra pessoas.' });
        return;
      }
      const id = Number(req.query?.id || req.params?.id);
      const status = body?.status === 'inativo' ? 'inativo' : body?.status === 'ativo' ? 'ativo' : '';
      const querEditar = !status && (body?.nome != null || body?.email != null || body?.perfil != null);
      if (!Number.isInteger(id) || (!status && !querEditar)) {
        res.status(400).json({ error: 'Informe a pessoa e a situação.' });
        return;
      }
      if (querEditar) {
        const nome = nomeDeAcesso(body?.nome);
        const email = emailDeAcesso(body?.email);
        const perfil = perfilDeAcesso(body?.perfil);
        if (!nome) {
          res.status(400).json({ error: 'Informe o nome da pessoa.' });
          return;
        }
        if (!email) {
          res.status(400).json({ error: 'Informe um e-mail válido.' });
          return;
        }
        if (!perfil) {
          res.status(400).json({ error: 'Escolha administrador ou analista.' });
          return;
        }
        const sb = createSupabaseAdminClient();
        if (!sb) {
          res.status(503).json({ error: 'Portal indisponível.' });
          return;
        }
        let leituraPessoa = sb
          .from(cfg().tabelas.usuarios)
          .select('id, nome, email, perfil, status')
          .eq('id', id);
        if (cfg().clientId != null) leituraPessoa = leituraPessoa.eq('client_id', cfg().clientId);
        const { data: atual, error: leitura } = await leituraPessoa.maybeSingle();
        if (leitura) {
          res.status(500).json({ error: 'Não foi possível alterar a pessoa.' });
          return;
        }
        if (!atual) {
          res.status(404).json({ error: 'Pessoa não encontrada.' });
          return;
        }
        const saiDeAdmin = atual.perfil === 'administrador' && atual.status !== 'inativo' && perfil !== 'administrador';
        if (saiDeAdmin && !(await outroAdministradorVivo(sb, id))) {
          res.status(409).json({ error: 'O portal precisa manter pelo menos um administrador.' });
          return;
        }
        let outroEmail = sb.from(cfg().tabelas.usuarios).select('id').ilike('email', email).neq('id', id);
        if (cfg().clientId != null) outroEmail = outroEmail.eq('client_id', cfg().clientId);
        const duplicado = await outroEmail.maybeSingle();
        if (duplicado.error) {
          res.status(500).json({ error: 'Não foi possível alterar a pessoa.' });
          return;
        }
        if (duplicado.data) {
          res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
          return;
        }
        const emailAntigo = String(atual.email || '');
        const ficha = await sb
          .from('system_users')
          .select('id, permissions, user_type')
          .ilike('email', emailAntigo)
          .maybeSingle();
        const fichaPortal = ficha.data && String(ficha.data.user_type || '') === 'client' && usuarioSoPortal(ficha.data.permissions)
          ? ficha.data
          : null;
        if (fichaPortal && email !== emailAntigo) {
          const ocupado = await sb.from('system_users').select('id').ilike('email', email).neq('id', fichaPortal.id).maybeSingle();
          if (ocupado.data) {
            res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
            return;
          }
        }
        let atualizaPessoa = sb
          .from(cfg().tabelas.usuarios)
          .update({ nome, email, perfil, atualizado_em: new Date().toISOString() })
          .eq('id', id);
        if (cfg().clientId != null) atualizaPessoa = atualizaPessoa.eq('client_id', cfg().clientId);
        const { data, error } = await atualizaPessoa.select('id, nome, email, perfil, status').single();
        if (error || !data) {
          res.status(500).json({ error: 'Não foi possível alterar a pessoa.' });
          return;
        }
        if (fichaPortal) {
          const { error: erroFicha } = await sb.from('system_users').update({
            name: nome,
            email,
            permissions: permissoesDoPortal(cfg().caminho, perfil),
          }).eq('id', fichaPortal.id);
          if (erroFicha) {
            res.status(500).json({ error: 'A pessoa mudou no portal, mas o cadastro do sistema não acompanhou.' });
            return;
          }
        }
        res.status(200).json({ pessoa: data });
        return;
      }
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: 'Portal indisponível.' });
        return;
      }
      let leituraPessoa = sb
        .from(cfg().tabelas.usuarios)
        .select('id, perfil, status, senha_hash')
        .eq('id', id);
      if (cfg().clientId != null) leituraPessoa = leituraPessoa.eq('client_id', cfg().clientId);
      const { data: atual, error: leitura } = await leituraPessoa.maybeSingle();
      if (leitura) {
        res.status(500).json({ error: 'Não foi possível alterar a pessoa.' });
        return;
      }
      if (!atual) {
        res.status(404).json({ error: 'Pessoa não encontrada.' });
        return;
      }
      const vaiSairDeAdmin = atual.perfil === 'administrador' && atual.status !== 'inativo' && status === 'inativo';
      if (vaiSairDeAdmin && !(await outroAdministradorVivo(sb, id))) {
        res.status(409).json({ error: 'O portal precisa manter pelo menos um administrador.' });
        return;
      }
      const proximo = status === 'inativo' ? 'inativo' : atual.senha_hash ? 'ativo' : 'pendente';
      let atualizaPessoa = sb
        .from(cfg().tabelas.usuarios)
        .update({ status: proximo, atualizado_em: new Date().toISOString() })
        .eq('id', id);
      if (cfg().clientId != null) atualizaPessoa = atualizaPessoa.eq('client_id', cfg().clientId);
      const { data, error } = await atualizaPessoa
        .select('id, nome, email, perfil, status')
        .single();
      if (error || !data) {
        res.status(500).json({ error: 'Não foi possível alterar a pessoa.' });
        return;
      }
      if (data.email) await alinharStatusCadastroPortal(sb, String(data.email), proximo === 'ativo');
      res.status(200).json({ pessoa: data });
      return;
    }

    if (op === 'pessoas-item' && method === 'DELETE') {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      if (bloquearPessoasSemLogin(res, session)) return;
      if (!podeCadastrarPessoa(session.perfil)) {
        res.status(403).json({ error: 'O analista não cadastra pessoas.' });
        return;
      }
      const id = Number(req.query?.id || req.params?.id);
      if (!Number.isInteger(id)) {
        res.status(400).json({ error: 'Informe a pessoa.' });
        return;
      }
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: 'Portal indisponível.' });
        return;
      }
      let leituraPessoa = sb
        .from(cfg().tabelas.usuarios)
        .select('id, email, perfil')
        .eq('id', id);
      if (cfg().clientId != null) leituraPessoa = leituraPessoa.eq('client_id', cfg().clientId);
      const { data: atual, error: leitura } = await leituraPessoa.maybeSingle();
      if (leitura) {
        res.status(500).json({ error: 'Não foi possível remover a pessoa.' });
        return;
      }
      if (!atual) {
        res.status(404).json({ error: 'Pessoa não encontrada.' });
        return;
      }
      if (!podeRemoverPessoa(atual.perfil)) {
        res.status(403).json({ error: 'Administrador não remove administrador.' });
        return;
      }
      let apaga = sb.from(cfg().tabelas.usuarios).delete().eq('id', id);
      if (cfg().clientId != null) apaga = apaga.eq('client_id', cfg().clientId);
      const { error } = await apaga;
      if (error) {
        res.status(500).json({ error: 'Não foi possível remover a pessoa.' });
        return;
      }
      if (atual.email) await alinharStatusCadastroPortal(sb, String(atual.email), false);
      res.status(200).json({ ok: true });
      return;
    }

    if (op === 'ao-vivo' && method === 'GET') {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: 'Painel indisponível.' });
        return;
      }
      try {
        const { montarMissaoAoVivo, ordenarMissoesAoVivo, segueNoAoVivo, STATUS_AO_VIVO } = await import('./aoVivo.js');
        const cliente = await carregarClienteDoPortal(sb);
        if (!cliente?.name) {
          res.status(503).json({ error: `Cliente ${cfg().clienteBusca || cfg().rotulo} não encontrado.` });
          return;
        }
        const { data, error } = await sb
          .from('missions')
          .select('id, status, start_time, end_time, mission_type, driver_name, origin, destination, client_vehicle, start_km, end_km, billing_approved')
          .eq('client', cliente.name)
          .in('status', [...STATUS_AO_VIVO])
          .order('start_time', { ascending: false })
          .limit(500);
        if (error) throw error;
        if ((data || []).length >= 500) {
          res.status(503).json({ error: 'A consulta das missões em andamento não fechou.' });
          return;
        }
        const linhas = data || [];
        const plates = await loadPlates(sb, linhas.map((row) => row.client_vehicle));
        let campos = new Map<string, any>();
        try {
          campos = await loadCamposCliente(sb, linhas.map((row) => String(row.id || '')));
        } catch (error) {
          if (!tabelaAusenteNoBanco(error as { code?: string; message?: string }) && (cfg().exigeLogin || !acessoNegado(error))) throw error;
        }
        const missoes = ordenarMissoesAoVivo(linhas.flatMap((row) => {
          if (!segueNoAoVivo(row)) return [];
          const missao = montarMissaoAoVivo({
            id: String(row.id || ''),
            status: row.status,
            missionType: row.mission_type,
            plate: plates.get(vehicleKey(row.client_vehicle)) || null,
            driver: row.driver_name,
            origin: row.origin,
            destination: row.destination,
            start: row.start_time,
            end: row.end_time,
            startKm: row.start_km,
            endKm: row.end_km,
            campos: campos.get(String(row.id || '')) || null,
          });
          return missao ? [missao] : [];
        }));
        res.status(200).json({ atualizadoEm: new Date().toISOString(), missoes });
      } catch (error) {
        console.error(`[${cfg().logPrefix}] ao-vivo`, error instanceof Error ? error.message : error);
        res.status(500).json({ error: 'Não foi possível atualizar as missões.' });
      }
      return;
    }

    if (op === 'relatorio' && method === 'GET') {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: 'Relatório indisponível.' });
        return;
      }
      try {
        const { BillingDatasetIncompleteError, fetchBillingMissionUniverse } = await import('../billing/fetchBillingMissionUniverse.js');
        const { linhaDoBoletimCeva, numeroOsDoBoletim } = await import('./report.js');
        const { servicoDoSistema } = await import('./camposCliente.js');
        const clientRow = await carregarClienteDoPortal(sb);
        if (!clientRow?.name) {
          res.status(503).json({ error: `Cliente ${cfg().clienteBusca || cfg().rotulo} não encontrado.` });
          return;
        }
        const canonicalNames = [String(clientRow.name).trim()];
        const tradingName = String(clientRow.trading_name || '').trim();
        if (tradingName && tradingName !== canonicalNames[0]) canonicalNames.push(tradingName);

        const universe = await fetchBillingMissionUniverse<CevaBoletimMission & { client_vehicle?: unknown; exclude_from_billing?: boolean }>(sb, {
          filterColumn: 'client',
          canonicalNames,
          rangeStart: '2026-01-01T03:00:00.000Z',
          rangeEnd: '2100-01-01T02:59:59.999Z',
        });

        const missions = universe.rows
          .filter((row) => row.exclude_from_billing !== true && numeroOsDoBoletim(row.id))
          .sort((a, b) => new Date(b.start_time || 0).getTime() - new Date(a.start_time || 0).getTime() || String(b.id).localeCompare(String(a.id)));
        const missionIds = missions.map((row) => row.id);
        const [plates, cancelTimes, adjustments, snapshots, priceTables, providerTables] = await Promise.all([
          loadPlates(sb, missions.map((row) => row.client_vehicle)),
          loadCancelTimes(sb, missions.filter((row) => String(row.status || '').toLowerCase().includes('cancel')).map((row) => row.id)),
          loadLatestLogs(sb, 'BillingAdjustment', missionIds),
          loadLatestLogs(sb, 'BillingSnapshot', missionIds),
          loadPriceTables(sb, String(clientRow.name)),
          loadAll(sb, 'provider_cost_tables'),
        ]);

        const items = missions.map((row) => {
          const hydrated = hydrateSnapshot(row, snapshots.get(row.id));
          return linhaDoBoletimCeva({
            ...hydrated,
            plate: plates.get(vehicleKey(row.client_vehicle)) || null,
            _cancelStatusAt: cancelTimes.get(row.id) || null,
          }, {
            priceTables,
            providerTables,
            clientData: clientRow,
            adjustment: adjustments.get(row.id) || undefined,
          });
        }).filter((row): row is NonNullable<typeof row> => row != null);

        let campos: Awaited<ReturnType<typeof loadCamposCliente>>;
        let catalogo: Awaited<ReturnType<typeof loadCatalogo>>;
        try {
          [campos, catalogo] = await Promise.all([
            loadCamposCliente(sb, missionIds),
            loadCatalogo(sb),
          ]);
        } catch (error) {
          if (!tabelaAusenteNoBanco(error as { code?: string; message?: string }) && (cfg().exigeLogin || !acessoNegado(error))) throw error;
          console.error(`[${cfg().logPrefix}] campos do cliente sem leitura; o boletim segue só com as OS`);
          campos = new Map();
          catalogo = {
            solicitante: [],
            quemAutorizou: [],
            servico: [],
            contrato: [],
            operacao: [],
            tsp: [],
            atendimentoPgr: [],
          };
        }
        const porOs = new Map(missions.map((row) => [numeroOsDoBoletim(row.id), row]));
        for (const item of items) {
          const salvo = campos.get(`GTM-${item.os}`);
          aplicarCamposCliente(item, salvo, servicoDoSistema);
          const mission = porOs.get(item.os) as { driver_phone?: string | null; reference_number?: string | null; origin?: string | null; destination?: string | null } | undefined;
          const linha = item as typeof item & { telefone?: string | null; identificacao?: string | null; origem?: string | null; destino?: string | null };
          linha.telefone = String(mission?.driver_phone || '').trim() || null;
          linha.identificacao = String(mission?.reference_number || '').trim() || null;
          linha.origem = String(mission?.origin || '').trim() || null;
          linha.destino = String(mission?.destination || '').trim() || null;
          if (!item.placa && salvo?.placa) item.placa = String(salvo.placa);
          if (!item.local && mission?.origin && mission?.destination) {
            item.local = `${mission.origin} x ${mission.destination}`;
          }
        }

        try {
          const { medicaoDaLinha } = await import('../portalCliente/medicao.js');
          const medicoes = new Map<string, { status?: unknown; itens?: unknown; justificativa?: unknown; modificado_em?: unknown }>();
          for (const part of chunks(missionIds, 200)) {
            const { data, error } = await sb.from('portal_medicao_cliente').select('mission_id, status, itens, justificativa, modificado_em').in('mission_id', part);
            if (error) {
              const codigo = String((error as { code?: string }).code || '');
              if (codigo === '42P01' || codigo === 'PGRST205' || codigo === 'PGRST204') break;
              throw error;
            }
            for (const row of data || []) medicoes.set(String(row.mission_id), row);
          }
          for (const item of items) {
            const medicao = medicaoDaLinha(medicoes.get(`GTM-${item.os}`));
            if (medicao) (item as typeof item & { medicao?: typeof medicao }).medicao = medicao;
          }
        } catch (error) {
          console.error(`[${cfg().logPrefix}] medicao`, error instanceof Error ? error.message : error);
        }

        res.status(200).json({
          periodo: '2026-01-01',
          total: items.length,
          completo: true,
          catalogo,
          items,
        });
      } catch (error) {
        // Não usar instanceof com classe importada só dentro do try —
        // no catch o binding não existe e vira ReferenceError na Vercel.
        const incompleto = error instanceof Error && error.name === 'BillingDatasetIncompleteError';
        if (incompleto) {
          console.error(`[${cfg().logPrefix}] relatorio incompleto`, (error as { reason?: string }).reason);
          res.status(503).json({ error: 'O conjunto de OS do boletim não fechou. Nada foi exibido para não inventar número.' });
          return;
        }
        const message = error instanceof Error ? error.message : (error as { message?: string })?.message || 'falha';
        console.error(`[${cfg().logPrefix}] relatorio`, message);
        res.status(500).json({ error: `Não foi possível carregar as OS da ${cfg().rotulo}.` });
      }
      return;
    }

    if (op === 'campos' && method === 'POST') {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      const { avisoInclusaoAdmin, decidirGravacao, ehCampoFiltro, podeIncluirFiltroNovo, textoPgr } = await import('./camposCliente.js');
      const os = String(body?.os || '').trim();
      const campo = String(body?.campo || '');
      const valor = String(body?.valor ?? '');
      const confirmarNovo = body?.confirmarNovo === true;
      if (!/^\d+$/.test(os)) {
        res.status(400).json({ error: 'OS inválida.' });
        return;
      }
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: 'Portal indisponível.' });
        return;
      }
      const missionId = `GTM-${os}`;
      const { data: mission, error: missionError } = await sb
        .from('missions')
        .select('id')
        .eq('id', missionId)
        .eq('client', (await carregarClienteDoPortal(sb))?.name || cfg().clienteNome)
        .maybeSingle();
      if (missionError) {
        res.status(500).json({ error: 'Não foi possível conferir a OS.' });
        return;
      }
      if (!mission) {
        res.status(404).json({ error: `OS não encontrada no boletim da ${cfg().rotulo}.` });
        return;
      }
      try {
        if (campo === 'atendimentoPgr') {
          const texto = textoPgr(valor);
          const atual = await gravarColuna(sb, missionId, 'atendimentoPgr', texto || null);
          const anterior = atual?.atendimento_pgr ?? null;
          if ((anterior || '') !== texto) {
            const { error: histError } = await sb.from(cfg().tabelas.pgrHistorico).insert(comDono({
              mission_id: missionId,
              valor: texto,
              valor_anterior: anterior,
              alterado_por: session?.name || `Portal ${cfg().rotulo}`,
            }));
            if (histError) throw histError;
          }
          res.status(200).json({ valor: texto || null });
          return;
        }
        if (!ehCampoFiltro(campo)) {
          res.status(400).json({ error: 'Campo inválido.' });
          return;
        }
        let leituraCatalogo = sb.from(cfg().tabelas.catalogo).select('valor').eq('campo', CATALOGO_CAMPO[campo]);
        if (cfg().clientId != null) leituraCatalogo = leituraCatalogo.eq('client_id', cfg().clientId);
        const { data: linhas, error: catError } = await leituraCatalogo;
        if (catError) throw catError;
        const catalogo = (linhas || []).map((row) => String(row.valor));
        const decisao = decidirGravacao(campo, valor, catalogo);
        if (decisao.acao === 'confirmar' && !podeIncluirFiltroNovo(session?.perfil, campo)) {
          res.status(403).json({ error: avisoInclusaoAdmin(campo) });
          return;
        }
        if (decisao.acao === 'confirmar' && !confirmarNovo) {
          res.status(409).json({ confirmar: true, nome: decisao.nome });
          return;
        }
        const gravar = decisao.acao === 'limpar' ? null : decisao.acao === 'aplicar' ? decisao.valor : decisao.nome;
        if (decisao.acao === 'confirmar') {
          const { error: novoError } = await sb.from(cfg().tabelas.catalogo).upsert(
            comDono({ campo: CATALOGO_CAMPO[campo], valor: decisao.nome }),
            { onConflict: conflitoCatalogo(), ignoreDuplicates: true },
          );
          if (novoError) throw novoError;
        }
        await gravarColuna(sb, missionId, campo, gravar);
        res.status(200).json({ valor: gravar, filtro: decisao.acao === 'confirmar' ? decisao.nome : null });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'falha';
        console.error(`[${cfg().logPrefix}] campos`, message);
        res.status(500).json({ error: 'Não foi possível salvar o campo.' });
      }
      return;
    }

    if (op === 'frota' && method === 'GET') {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: 'Portal indisponível.' });
        return;
      }
      try {
        const cliente = await carregarClienteDoPortal(sb);
        if (!cliente?.id || !cliente?.name) {
          res.status(503).json({ error: `Cliente ${cfg().rotulo} não encontrado.` });
          return;
        }
        const nomes = [String(cliente.name).trim()];
        const fantasia = String(cliente.trading_name || '').trim();
        if (fantasia && fantasia !== nomes[0]) nomes.push(fantasia);
        const { listarFrotaPortal } = await import('../portalCliente/frota.js');
        const frota = await listarFrotaPortal(sb, nomes, Number(cliente.id));
        res.status(200).json(frota);
      } catch (error) {
        console.error(`[${cfg().logPrefix}] frota`, error instanceof Error ? error.message : error);
        res.status(500).json({ error: 'Não foi possível carregar motoristas e veículos.' });
      }
      return;
    }

    if (op === 'catalogo' && method === 'GET') {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: 'Portal indisponível.' });
        return;
      }
      try {
        const catalogo = await loadCatalogo(sb);
        res.status(200).json({ catalogo });
      } catch (error) {
        console.error(`[${cfg().logPrefix}] catalogo`, error instanceof Error ? error.message : error);
        res.status(500).json({ error: 'Não foi possível carregar as listas.' });
      }
      return;
    }

    if (op === 'catalogo' && method === 'POST') {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      const { COLUNA_LISTA_SOLICITACAO, decidirNomeCatalogo, ehCampoLista } = await import('./camposCliente.js');
      const campo = String(body?.campo || '');
      if (!ehCampoLista(campo)) {
        res.status(400).json({ error: 'Informe a lista: operação, quem autorizou, contrato, TSP ou atendimento PGR.' });
        return;
      }
      const confirmarNovo = body?.confirmarNovo === true;
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: 'Portal indisponível.' });
        return;
      }
      try {
        const coluna = COLUNA_LISTA_SOLICITACAO[campo];
        let leituraCatalogo = sb.from(cfg().tabelas.catalogo).select('valor').eq('campo', coluna);
        if (cfg().clientId != null) leituraCatalogo = leituraCatalogo.eq('client_id', cfg().clientId);
        const { data: linhas, error: catError } = await leituraCatalogo;
        if (catError) throw catError;
        const catalogo = (linhas || []).map((row) => String(row.valor));
        const decisao = decidirNomeCatalogo(String(body?.valor ?? ''), catalogo);
        if (decisao.acao === 'limpar') {
          res.status(400).json({ error: 'Informe o nome.' });
          return;
        }
        if (decisao.acao === 'confirmar' && !confirmarNovo) {
          res.status(409).json({ confirmar: true, nome: decisao.nome });
          return;
        }
        const nome = decisao.acao === 'aplicar' ? decisao.valor : decisao.nome;
        if (decisao.acao === 'confirmar') {
          const { error: novoError } = await sb.from(cfg().tabelas.catalogo).upsert(
            comDono({ campo: coluna, valor: nome }),
            { onConflict: conflitoCatalogo(), ignoreDuplicates: true },
          );
          if (novoError) throw novoError;
        }
        res.status(200).json({ valor: nome });
      } catch (error) {
        const mensagem = error instanceof Error ? error.message : String(error);
        console.error(`[${cfg().logPrefix}] catalogo`, mensagem);
        const trava = /check constraint|catalogo_campo_check|23514/i.test(mensagem);
        res.status(trava ? 503 : 500).json({
          error: trava
            ? 'Essa lista ainda não está liberada no banco. Operação, quem autorizou, contrato e TSP continuam.'
            : 'Não foi possível incluir o nome.',
        });
      }
      return;
    }

    if (op === 'catalogo' && method === 'DELETE') {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      if (session.perfil !== 'administrador') {
        res.status(403).json({ error: 'Só o administrador remove um nome da lista.' });
        return;
      }
      const { COLUNA_LISTA_SOLICITACAO, decidirNomeCatalogo, ehCampoLista } = await import('./camposCliente.js');
      const campo = String(body?.campo || '');
      if (!ehCampoLista(campo)) {
        res.status(400).json({ error: 'Informe a lista.' });
        return;
      }
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: 'Portal indisponível.' });
        return;
      }
      try {
        const coluna = COLUNA_LISTA_SOLICITACAO[campo];
        let leituraCatalogo = sb.from(cfg().tabelas.catalogo).select('valor').eq('campo', coluna);
        if (cfg().clientId != null) leituraCatalogo = leituraCatalogo.eq('client_id', cfg().clientId);
        const { data: linhas, error: catError } = await leituraCatalogo;
        if (catError) throw catError;
        const catalogo = (linhas || []).map((row) => String(row.valor));
        const decisao = decidirNomeCatalogo(String(body?.valor ?? ''), catalogo);
        const nome = decisao.acao === 'aplicar' ? decisao.valor : decisao.acao === 'confirmar' ? decisao.nome : '';
        if (!nome || !catalogo.some((item) => item === nome)) {
          res.status(404).json({ error: 'Esse nome não está na lista.' });
          return;
        }
        let apagar = sb.from(cfg().tabelas.catalogo).delete().eq('campo', coluna).eq('valor', nome);
        if (cfg().clientId != null) apagar = apagar.eq('client_id', cfg().clientId);
        const { error: delError } = await apagar;
        if (delError) throw delError;
        res.status(200).json({ valor: nome });
      } catch (error) {
        console.error(`[${cfg().logPrefix}] catalogo`, error instanceof Error ? error.message : error);
        res.status(500).json({ error: 'Não foi possível remover o nome.' });
      }
      return;
    }

    if (op === 'status' && method === 'GET') {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: 'Status indisponível.' });
        return;
      }
      try {
        const { numeroOsDoBoletim } = await import('./report.js');
        const clientRow = await carregarClienteDoPortal(sb);
        if (!clientRow?.name) {
          res.status(503).json({ error: `Cliente ${cfg().clienteBusca || cfg().rotulo} não encontrado.` });
          return;
        }
        const names = [String(clientRow.name).trim()];
        const trading = String(clientRow.trading_name || '').trim();
        if (trading && trading !== names[0]) names.push(trading);
        const pageSize = 1000;
        const rows: { id: string; status: string | null }[] = [];
        for (let from = 0; from < 20000; from += pageSize) {
          const { data, error } = await sb.from('missions').select('id, status').in('client', names).range(from, from + pageSize - 1);
          if (error) throw error;
          for (const row of data || []) rows.push({ id: String(row.id || ''), status: row.status });
          if (!data || data.length < pageSize) {
            const items = rows.flatMap((row) => {
              const os = numeroOsDoBoletim(row.id);
              if (!os) return [];
              const status = String(row.status || '').trim() || 'Concluída';
              return [{ os, status }];
            });
            let resposta: Array<{ os: string; status: string; medicao?: unknown }> = items;
            try {
              const { medicaoDaLinha } = await import('../portalCliente/medicao.js');
              const medicoes = new Map<string, ReturnType<typeof medicaoDaLinha>>();
              for (const part of chunks(items.map((item) => `GTM-${item.os}`), 200)) {
                const leitura = await sb.from('portal_medicao_cliente').select('mission_id, status, itens, justificativa, modificado_em').in('mission_id', part);
                if (leitura.error) {
                  const codigo = String((leitura.error as { code?: string }).code || '');
                  if (codigo === '42P01' || codigo === 'PGRST205' || codigo === 'PGRST204') break;
                  throw leitura.error;
                }
                for (const row of leitura.data || []) {
                  const medicao = medicaoDaLinha(row);
                  if (medicao) medicoes.set(String(row.mission_id), medicao);
                }
              }
              resposta = items.map((item) => ({ ...item, medicao: medicoes.get(`GTM-${item.os}`) || null }));
            } catch (error) {
              console.error(`[${cfg().logPrefix}] medicao`, error instanceof Error ? error.message : error);
            }
            res.status(200).json({ atualizadoEm: new Date().toISOString(), items: resposta });
            return;
          }
        }
        res.status(503).json({ error: `A consulta de status da ${cfg().rotulo} não fechou.` });
      } catch (error) {
        console.error(`[${cfg().logPrefix}] status`, error instanceof Error ? error.message : error);
        res.status(500).json({ error: 'Não foi possível atualizar o status.' });
      }
      return;
    }

    if (op === 'pgr' && method === 'GET') {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      const os = String(req.query?.os || req.params?.os || '').trim();
      if (!/^\d+$/.test(os)) {
        res.status(400).json({ error: 'OS inválida.' });
        return;
      }
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: 'Portal indisponível.' });
        return;
      }
      const { data, error } = await sb
        .from(cfg().tabelas.pgrHistorico)
        .select('valor, valor_anterior, alterado_em, alterado_por')
        .eq('mission_id', `GTM-${os}`)
        .order('alterado_em', { ascending: false })
        .limit(30);
      if (error) {
        res.status(500).json({ error: 'Não foi possível carregar o histórico.' });
        return;
      }
      res.status(200).json({
        historico: (data || []).map((row) => ({
          valor: row.valor || '',
          anterior: row.valor_anterior || '',
          em: row.alterado_em,
          por: row.alterado_por,
        })),
      });
      return;
    }

    if (op === 'solicitacoes' && method === 'GET') {
      if (CEVA_PORTAL_LOGIN_ENABLED) {
        const session = await portalSession(req);
        if (!session) {
          res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
          return;
        }
      }
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: 'Portal indisponível.' });
        return;
      }
      let lista = sb
        .from(cfg().tabelas.solicitacoes)
        .select('id, numero, data_inicio, data_fim, solicitante, quem_autorizou, servico, atendimento_pgr, contrato, operacao, tsp, placa, motorista, franquia_hora, franquia_km, filled_by_name, filled_by_email, created_at');
      if (cfg().clientId != null) lista = lista.eq('client_id', cfg().clientId);
      const { data, error } = await lista
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) {
        console.error(`[${cfg().logPrefix}] list`, error.message);
        res.status(500).json({ error: 'Não foi possível carregar as solicitações.' });
        return;
      }
      res.status(200).json({ items: (data || []).map(rowToJson) });
      return;
    }

    if (op === 'solicitacoes' && method === 'POST') {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      const { quantidadeDoPedido, validarPedidoPortal } = await import('../portalCliente/pedido.js');
      const draft = validarPedidoPortal(body, session.name);
      if (!draft.ok) {
        res.status(400).json({ error: draft.error });
        return;
      }
      const copias = quantidadeDoPedido(body);
      if (!copias.ok) {
        res.status(400).json({ error: copias.error });
        return;
      }
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: 'Portal indisponível.' });
        return;
      }
      const cliente = await carregarClienteDoPortal(sb);
      if (!cliente?.name) {
        res.status(503).json({ error: `Cliente ${cfg().rotulo} não encontrado.` });
        return;
      }
      try {
        const nomeCliente = String(cliente.name || '').trim() || cfg().clienteNome;
        const { enviarEmailSolicitacao, registrarSolicitacaoPortal } = await import('../portalCliente/registrarOs.js');
        const { emailsDaSolicitacao } = await import('../portalCliente/pedido.js');
        const criadas: string[] = [];
        let incompleto = false;
        for (let copia = 0; copia < copias.value; copia += 1) {
          try {
            const criado = await registrarSolicitacaoPortal(sb, cfg(), draft.value, {
              id: session.id,
              email: session.email,
            }, cliente.operational_email, Number(cliente.id) || null, { enviarEmail: false, clienteOficial: nomeCliente });
            criadas.push(criado.os);
          } catch (error) {
            incompleto = true;
            console.error(`[${cfg().logPrefix}] solicitação`, error instanceof Error ? error.message : error);
            break;
          }
        }
        if (criadas.length === 0) {
          res.status(500).json({ error: 'Não foi possível registrar a solicitação.' });
          return;
        }
        const emailEnviado = await enviarEmailSolicitacao({
          destinatarios: emailsDaSolicitacao(cliente.operational_email),
          os: criadas.join(', '),
          cliente: nomeCliente,
          pedido: draft.value,
        });
        res.status(201).json({
          os: criadas[0],
          oss: criadas,
          quantidade: criadas.length,
          emailEnviado,
          incompleto,
          status: 'Solicitada',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'falha';
        console.error(`[${cfg().logPrefix}] solicitação`, message);
        res.status(500).json({ error: 'Não foi possível registrar a solicitação.' });
      }
      return;
    }

    if (op === 'cotacao' && method === 'GET') {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: 'Cotação indisponível.' });
        return;
      }
      try {
        const cliente = await carregarClienteDoPortal(sb);
        const { listarTabelasCotacao, listarHistoricoCotacoes } = await import('../portalCliente/cotacaoHttp.js');
        if (String(req.query?.lista || '') === 'historico') {
          const pagina = Number(req.query?.pagina);
          const vigencia = String(req.query?.vigencia || '');
          const historico = await listarHistoricoCotacoes(
            sb,
            cliente,
            Number.isFinite(pagina) ? pagina : 0,
            vigencia === '2026' || vigencia === '2027' ? vigencia : null,
          );
          res.status(historico.status).json(historico.corpo);
          return;
        }
        const resultado = await listarTabelasCotacao(sb, cliente);
        res.status(resultado.status).json(resultado.corpo);
      } catch (error) {
        console.error(`[${cfg().logPrefix}] cotacao`, error instanceof Error ? error.message : error);
        res.status(500).json({ error: 'Não foi possível carregar a cotação.' });
      }
      return;
    }

    if (op === 'cotacao' && method === 'POST') {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: 'Cotação indisponível.' });
        return;
      }
      try {
        const cliente = await carregarClienteDoPortal(sb);
        const { salvarPropostaPortal, propostaParaEmail, registrarCotacaoPortal } = await import('../portalCliente/cotacaoHttp.js');
        if (String(body?.acao || '') === 'registrar') {
          const gravado = await registrarCotacaoPortal(sb, cliente, { name: session.name, email: session.email }, body || {});
          res.status(gravado.status).json(gravado.corpo);
          return;
        }
        if (String(body?.acao || '') === 'email') {
          const preparado = await propostaParaEmail(sb, cliente, { ...(body || {}), autor: session.email });
          if (preparado.status !== 200 || !('ok' in preparado.corpo)) {
            res.status(preparado.status).json(preparado.corpo);
            return;
          }
          try {
            const { pdfAnexoAceito } = await import('../portalCliente/gestaoCotacao.js');
            const { nomeAnexoPdf } = await import('../portalCliente/historicoCotacoes.js');
            const anexo = pdfAnexoAceito(String(body?.pdf || ''));
            if (!anexo.ok) {
              res.status(400).json({ error: anexo.error });
              return;
            }
            const { sendMail, SMTP_FROM } = await import('../email/smtp.js');
            await sendMail({
              from: SMTP_FROM,
              to: preparado.corpo.para,
              cc: preparado.corpo.copias.length ? preparado.corpo.copias : undefined,
              subject: preparado.corpo.assunto,
              text: preparado.corpo.texto,
              html: preparado.corpo.html,
              attachments: [{
                filename: nomeAnexoPdf(body?.nomePdf, {
                  origem: String(body?.origem || ''),
                  destino: String(body?.destino || ''),
                  numero: body?.numero,
                  cliente: cliente?.name || cliente?.trading_name || '',
                }),
                content: Buffer.from(anexo.base64, 'base64'),
                contentType: 'application/pdf',
              }],
            });
            res.status(200).json({ ok: true, enviado: true, para: preparado.corpo.para, copias: preparado.corpo.copias });
          } catch (error) {
            console.error(`[${cfg().logPrefix}] cotacao email`, error instanceof Error ? error.message : error);
            res.status(200).json({ ok: true, enviado: false, aviso: 'O e-mail não saiu agora. A proposta continua disponível para o PDF.' });
          }
          return;
        }
        const gravado = await salvarPropostaPortal(sb, cliente, body || {});
        res.status(gravado.status).json(gravado.corpo);
      } catch (error) {
        console.error(`[${cfg().logPrefix}] cotacao`, error instanceof Error ? error.message : error);
        res.status(500).json({ error: 'Não foi possível concluir a proposta.' });
      }
      return;
    }

    if (op === 'fotos' && method === 'GET') {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: 'Fotos indisponíveis.' });
        return;
      }
      try {
        const cliente = await carregarClienteDoPortal(sb);
        const { lerFotosEvento } = await import('../portalCliente/fotosMedicaoHttp.js');
        const endereco = String(req.originalUrl || req.url || '');
        const osNoCaminho = endereco.match(/\/fotos\/(\d+)/);
        const resultado = await lerFotosEvento({ sb, os: String(req.query?.os || osNoCaminho?.[1] || ''), cliente });
        res.status(resultado.status).json(resultado.corpo);
      } catch (error) {
        console.error(`[${cfg().logPrefix}] fotos`, error instanceof Error ? error.message : error);
        res.status(500).json({ error: 'Não foi possível carregar as fotos.' });
      }
      return;
    }

    if (op === 'medicao' && method === 'POST') {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: 'Medição indisponível.' });
        return;
      }
      try {
        const cliente = await carregarClienteDoPortal(sb);
        const { gravarMedicaoPortal } = await import('../portalCliente/medicaoHttp.js');
        const { sendMail, SMTP_FROM } = await import('../email/smtp.js');
        const { EMAIL_FINANCEIRO_MEDICAO } = await import('../portalCliente/medicao.js');
        const resultado = await gravarMedicaoPortal({
          sb,
          os: String(body?.os || ''),
          cliente,
          autor: session.name || session.email,
          acao: String(body?.acao || ''),
          equipeInterna: session.equipeInterna === true,
          body: body || {},
          enviarEmail: async (texto, anexo) => {
            await sendMail({
              from: SMTP_FROM,
              to: EMAIL_FINANCEIRO_MEDICAO,
              subject: `Conferir medição GTM-${String(body?.os || '').replace(/\D/g, '')} — ${cliente?.trading_name || cliente?.name || cfg().rotulo}`,
              text: texto,
              attachments: anexo ? [anexo] : undefined,
            });
          },
        });
        res.status(resultado.status).json(resultado.corpo);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'falha';
        console.error(`[${cfg().logPrefix}] medicao`, message);
        res.status(500).json({ error: 'Não foi possível gravar a medição.' });
      }
      return;
    }

    res.status(404).json({ error: `Rota do portal ${cfg().rotulo} não encontrada.` });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${cfg().logPrefix}]`, message);
    if (!res.headersSent) {
      res.status(500).json({ error: message || `Falha no portal ${cfg().rotulo}.` });
    }
  }
}
