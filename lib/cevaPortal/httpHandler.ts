/**
 * Handler HTTP do portal CEVA — leve para Vercel (não passa pelo Express/api/index).
 * O catch-all Express estoura tempo e o login ficava em "Aguarde...".
 */
import { createSupabaseAdminClient } from '../supabaseAdmin.js';
import {
  decidirPrimeiroAcesso,
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
  buildCevaSolicitacao,
  CEVA_PORTAL_LOGIN_ENABLED,
  issueCevaPortalToken,
  readPortalToken,
  type CevaPortalSession,
} from './rules.js';
import { sendCevaPortalAccessEmail } from './emailAcesso.js';
import type { CevaBoletimMission } from './report.js';
import type { CampoFiltro } from './camposCliente.js';
// Imports pesados (billing/report/ao-vivo) entram via import() dinâmico nas ops
// que precisam — evita cold-start do login puxar financialUtils/supabasePaging
// e quebrar o bundle Vercel com ERR_MODULE_NOT_FOUND.

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

type PortalUser = CevaPortalSession & { perfil: PerfilCeva; trocarSenha: boolean };

function usuarioPublico(row: { id: number | string; nome: string; email: string; perfil: PerfilCeva; trocarSenha?: boolean }) {
  return {
    id: String(row.id),
    name: String(row.nome || '').trim(),
    email: String(row.email || '').trim().toLowerCase(),
    perfil: row.perfil,
    trocarSenha: row.trocarSenha === true,
  };
}

function sessaoDe(row: { id: number | string; nome: string; email: string; perfil: string; trocar_senha?: boolean | null }): PortalUser | null {
  const perfil = perfilDeAcesso(row.perfil);
  if (!perfil) return null;
  const user = usuarioPublico({ ...row, perfil, trocarSenha: row.trocar_senha === true });
  return { ...user, perfil, trocarSenha: user.trocarSenha };
}

async function portalSession(req: any): Promise<PortalUser | null> {
  const userId = readPortalToken(String(req.headers?.authorization || req.headers?.['x-ceva-portal'] || ''));
  if (!userId) return null;
  const sb = createSupabaseAdminClient();
  if (!sb) return null;

  const { data: user } = await sb
    .from('ceva_portal_usuarios')
    .select('id, nome, email, perfil, status, trocar_senha')
    .eq('id', userId)
    .maybeSingle();
  if (!user || user.status !== 'ativo') return null;
  return sessaoDe(user);
}

function exigirUso(res: any, session: PortalUser | null): session is PortalUser {
  if (!session) {
    res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
    return false;
  }
  if (session.trocarSenha) {
    res.status(403).json({ error: 'Troque a senha enviada por e-mail para continuar.', trocarSenha: true });
    return false;
  }
  return true;
}

async function existeAdministrador(sb: NonNullable<ReturnType<typeof createSupabaseAdminClient>>): Promise<boolean> {
  const { count, error } = await sb
    .from('ceva_portal_usuarios')
    .select('id', { count: 'exact', head: true })
    .eq('perfil', 'administrador');
  if (error) throw error;
  return (count || 0) > 0;
}

async function outroAdministradorVivo(sb: NonNullable<ReturnType<typeof createSupabaseAdminClient>>, id: number): Promise<boolean> {
  const { count, error } = await sb
    .from('ceva_portal_usuarios')
    .select('id', { count: 'exact', head: true })
    .eq('perfil', 'administrador')
    .neq('status', 'inativo')
    .neq('id', id);
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
  throw new Error('Tabelas de preço da CEVA incompletas.');
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
} as const;

const CATALOGO_CAMPO: Record<CampoFiltro, string> = {
  solicitante: 'solicitante',
  quemAutorizou: 'quem_autorizou',
  servico: 'servico',
  contrato: 'contrato',
  operacao: 'operacao',
};

function aplicarCamposCliente(
  item: { os: string; solicitante: string | null; quemAutorizou: string | null; servico: string | null; atendimentoPgr: string | null; contrato: string | null; operacao: string | null },
  salvo: any,
  servicoDoSistema: (valor: string | null | undefined) => string | null,
) {
  item.solicitante = salvo?.solicitante ?? null;
  item.quemAutorizou = salvo?.quem_autorizou ?? null;
  item.servico = salvo?.servico || servicoDoSistema(item.servico);
  item.atendimentoPgr = salvo?.atendimento_pgr ?? null;
  item.contrato = salvo?.contrato ?? null;
  item.operacao = salvo?.operacao ?? null;
}

async function loadCamposCliente(sb: NonNullable<ReturnType<typeof createSupabaseAdminClient>>, missionIds: string[]) {
  const map = new Map<string, any>();
  for (const part of chunks(missionIds, 200)) {
    const { data, error } = await sb.from('ceva_portal_os_campos').select('*').in('mission_id', part);
    if (error) throw error;
    for (const row of data || []) map.set(String(row.mission_id), row);
  }
  return map;
}

async function loadCatalogo(sb: NonNullable<ReturnType<typeof createSupabaseAdminClient>>) {
  const catalogo: Record<CampoFiltro, string[]> = {
    solicitante: [],
    quemAutorizou: [],
    servico: [],
    contrato: [],
    operacao: [],
  };
  const { data, error } = await sb.from('ceva_portal_catalogo').select('campo, valor').order('valor');
  if (error) throw error;
  const reverso: Record<string, CampoFiltro> = {
    solicitante: 'solicitante',
    quem_autorizou: 'quemAutorizou',
    servico: 'servico',
    contrato: 'contrato',
    operacao: 'operacao',
  };
  for (const row of data || []) {
    const campo = reverso[String(row.campo)];
    if (campo) catalogo[campo].push(String(row.valor));
  }
  return catalogo;
}

async function gravarColuna(sb: NonNullable<ReturnType<typeof createSupabaseAdminClient>>, missionId: string, campo: keyof typeof COLUNA_CAMPO, valor: string | null) {
  const coluna = COLUNA_CAMPO[campo];
  const { data: atual, error: leitura } = await sb.from('ceva_portal_os_campos').select('*').eq('mission_id', missionId).maybeSingle();
  if (leitura) throw leitura;
  const payload = { ...(atual || { mission_id: missionId }), [coluna]: valor, updated_at: new Date().toISOString() };
  delete payload.id;
  const { error } = await sb.from('ceva_portal_os_campos').upsert(payload, { onConflict: 'mission_id' });
  if (error) throw error;
  return atual;
}

function hydrateSnapshot<T extends CevaBoletimMission>(mission: T, logSnapshot: any): T {
  if (!logSnapshot || mission.snapshot_approved_by) return mission;
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

function resolveOp(req: any): string {
  const fromQuery = String(req.query?.op || '').trim();
  if (fromQuery) return fromQuery;
  const url = String(req.url || '');
  const path = url.split('?')[0];
  const match = path.match(/\/api\/ceva-portal\/([^/]+)(?:\/([^/]+))?/);
  if (!match) return '';
  const head = match[1];
  const tail = match[2];
  if (head === 'pessoas' && tail) {
    req.query = { ...(req.query || {}), id: tail };
    return 'pessoas-item';
  }
  if (head === 'pgr' && tail) {
    req.query = { ...(req.query || {}), os: tail };
    return 'pgr';
  }
  return head;
}

/** Entrada única do portal CEVA (Vercel leve + Express local). */
export async function handleCevaPortalHttp(req: any, res: any): Promise<void> {
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
        console.error('[ceva-portal] acesso', error instanceof Error ? error.message : error);
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
      const { data: user } = await sb
        .from('ceva_portal_usuarios')
        .select('id, nome, email, senha_hash, perfil, status, trocar_senha')
        .eq('email', email)
        .maybeSingle();
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
      const session = sessaoDe(user);
      if (!session) {
        res.status(401).json({ error: INVALID_LOGIN });
        return;
      }
      clearFailures(key);
      res.status(200).json({ token: issueCevaPortalToken(user.id), user: session });
      return;
    }

    if (op === 'primeiro-acesso' && method === 'POST') {
      const email = emailDeAcesso(body?.email);
      const senha = String(body?.senha || '');
      const confirmacao = String(body?.confirmacao || '');
      const key = `${clientIp(req)}|primeiro|${email || ''}`;
      if (tooManyAttempts(key)) {
        res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.' });
        return;
      }
      if (!email) {
        res.status(400).json({ error: 'Informe um e-mail válido.' });
        return;
      }
      const senhaInvalida = validarSenha(senha);
      if (senhaInvalida) {
        res.status(400).json({ error: senhaInvalida });
        return;
      }
      if (senha !== confirmacao) {
        res.status(400).json({ error: 'A confirmação da senha não confere.' });
        return;
      }
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: 'Portal indisponível.' });
        return;
      }
      try {
        const decisao = decidirPrimeiroAcesso({ existeAdministrador: await existeAdministrador(sb) });
        if (!decisao.ok) {
          res.status(403).json({ error: decisao.error });
          return;
        }
        const nome = nomeDeAcesso(body?.nome);
        if (!nome) {
          res.status(400).json({ error: 'Informe o nome do administrador.' });
          return;
        }
        if (await existeAdministrador(sb)) {
          res.status(409).json({ error: 'O administrador já foi criado. Use o login.' });
          return;
        }
        const { data: criado, error } = await sb
          .from('ceva_portal_usuarios')
          .insert({ nome, email, senha_hash: hashSenha(senha), perfil: 'administrador', status: 'ativo', trocar_senha: false })
          .select('id, nome, email, perfil, trocar_senha')
          .single();
        if (error || !criado) {
          console.error('[ceva-portal] primeiro administrador', error?.message);
          res.status(500).json({ error: 'Não foi possível criar o administrador.' });
          return;
        }
        const session = sessaoDe(criado);
        if (!session) {
          res.status(500).json({ error: 'Não foi possível criar o administrador.' });
          return;
        }
        clearFailures(key);
        res.status(201).json({ token: issueCevaPortalToken(criado.id), user: session });
      } catch (error) {
        console.error('[ceva-portal] primeiro acesso', error instanceof Error ? error.message : error);
        res.status(500).json({ error: 'Não foi possível concluir o primeiro acesso.' });
      }
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
      const { data: user } = await sb.from('ceva_portal_usuarios').select('id, senha_hash').eq('id', session.id).maybeSingle();
      if (!user || !senhaConfere(senhaAtual, user.senha_hash)) {
        res.status(401).json({ error: 'A senha atual não confere.' });
        return;
      }
      const { error } = await sb
        .from('ceva_portal_usuarios')
        .update({ senha_hash: hashSenha(senhaNova), trocar_senha: false, atualizado_em: new Date().toISOString() })
        .eq('id', session.id);
      if (error) {
        res.status(500).json({ error: 'Não foi possível trocar a senha.' });
        return;
      }
      res.status(200).json({ user: { ...session, trocarSenha: false } });
      return;
    }

    if (op === 'pessoas' && method === 'GET') {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      if (!podeCadastrarPessoa(session.perfil)) {
        res.status(403).json({ error: 'O analista não cadastra pessoas.' });
        return;
      }
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: 'Portal indisponível.' });
        return;
      }
      const { data, error } = await sb
        .from('ceva_portal_usuarios')
        .select('id, nome, email, perfil, status, trocar_senha')
        .order('nome');
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
      const { data, error } = await sb
        .from('ceva_portal_usuarios')
        .insert({ nome, email, perfil, status: 'ativo', trocar_senha: true, senha_hash: hashSenha(senhaTemporaria), criado_por: Number(session.id) })
        .select('id, nome, email, perfil, status, trocar_senha')
        .single();
      if (error?.code === '23505') {
        res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
        return;
      }
      if (error || !data) {
        res.status(500).json({ error: 'Não foi possível liberar o acesso.' });
        return;
      }
      const enviou = await sendCevaPortalAccessEmail({ nome, email, senhaTemporaria });
      if (!enviou) {
        await sb.from('ceva_portal_usuarios').delete().eq('id', data.id);
        res.status(503).json({ error: 'Não foi possível enviar o e-mail. O acesso não foi liberado.' });
        return;
      }
      res.status(201).json({
        pessoa: { id: data.id, nome: data.nome, email: data.email, perfil: data.perfil, status: data.status, trocarSenha: true },
      });
      return;
    }

    if (op === 'pessoas-item' && method === 'PATCH') {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      if (!podeCadastrarPessoa(session.perfil)) {
        res.status(403).json({ error: 'O analista não cadastra pessoas.' });
        return;
      }
      const id = Number(req.query?.id || req.params?.id);
      const status = body?.status === 'inativo' ? 'inativo' : body?.status === 'ativo' ? 'ativo' : '';
      if (!Number.isInteger(id) || !status) {
        res.status(400).json({ error: 'Informe a pessoa e a situação.' });
        return;
      }
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: 'Portal indisponível.' });
        return;
      }
      const { data: atual, error: leitura } = await sb
        .from('ceva_portal_usuarios')
        .select('id, perfil, status, senha_hash')
        .eq('id', id)
        .maybeSingle();
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
      const { data, error } = await sb
        .from('ceva_portal_usuarios')
        .update({ status: proximo, atualizado_em: new Date().toISOString() })
        .eq('id', id)
        .select('id, nome, email, perfil, status')
        .single();
      if (error || !data) {
        res.status(500).json({ error: 'Não foi possível alterar a pessoa.' });
        return;
      }
      res.status(200).json({ pessoa: data });
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
        const { montarMissaoAoVivo, ordenarMissoesAoVivo, STATUS_AO_VIVO } = await import('./aoVivo.js');
        const { data, error } = await sb
          .from('missions')
          .select('id, status, start_time, end_time, mission_type, driver_name, origin, destination, client_vehicle, start_km, end_km')
          .eq('client', 'CEVA LOGISTICS LTDA')
          .in('status', [...STATUS_AO_VIVO])
          .order('start_time', { ascending: false })
          .limit(500);
        if (error) throw error;
        if ((data || []).length >= 500) {
          res.status(503).json({ error: 'A consulta das missões em andamento não fechou.' });
          return;
        }
        const linhas = data || [];
        const [plates, campos] = await Promise.all([
          loadPlates(sb, linhas.map((row) => row.client_vehicle)),
          loadCamposCliente(sb, linhas.map((row) => String(row.id || ''))),
        ]);
        const missoes = ordenarMissoesAoVivo(linhas.flatMap((row) => {
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
        console.error('[ceva-portal] ao-vivo', error instanceof Error ? error.message : error);
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
        const { data: clientRow, error: clientError } = await sb
          .from('clients')
          .select('*')
          .eq('name', 'CEVA LOGISTICS LTDA')
          .maybeSingle();
        if (clientError) throw clientError;
        if (!clientRow?.name) {
          res.status(503).json({ error: 'Cliente CEVA não encontrado.' });
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

        const [campos, catalogo] = await Promise.all([
          loadCamposCliente(sb, missionIds),
          loadCatalogo(sb),
        ]);
        for (const item of items) aplicarCamposCliente(item, campos.get(`GTM-${item.os}`), servicoDoSistema);

        res.status(200).json({
          periodo: '2026-01-01',
          total: items.length,
          completo: true,
          catalogo,
          items,
        });
      } catch (error) {
        if (error instanceof BillingDatasetIncompleteError) {
          console.error('[ceva-portal] relatorio incompleto', error.reason);
          res.status(503).json({ error: 'O conjunto de OS do boletim não fechou. Nada foi exibido para não inventar número.' });
          return;
        }
        const message = error instanceof Error ? error.message : 'falha';
        console.error('[ceva-portal] relatorio', message);
        res.status(500).json({ error: 'Não foi possível carregar as OS da CEVA.' });
      }
      return;
    }

    if (op === 'campos' && method === 'POST') {
      const session = await portalSession(req);
      if (!exigirUso(res, session)) return;
      const { decidirGravacao, ehCampoFiltro, textoPgr } = await import('./camposCliente.js');
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
        .eq('client', 'CEVA LOGISTICS LTDA')
        .maybeSingle();
      if (missionError) {
        res.status(500).json({ error: 'Não foi possível conferir a OS.' });
        return;
      }
      if (!mission) {
        res.status(404).json({ error: 'OS não encontrada no boletim da CEVA.' });
        return;
      }
      try {
        if (campo === 'atendimentoPgr') {
          const texto = textoPgr(valor);
          const atual = await gravarColuna(sb, missionId, 'atendimentoPgr', texto || null);
          const anterior = atual?.atendimento_pgr ?? null;
          if ((anterior || '') !== texto) {
            const { error: histError } = await sb.from('ceva_portal_pgr_historico').insert({
              mission_id: missionId,
              valor: texto,
              valor_anterior: anterior,
              alterado_por: session?.name || 'Portal CEVA',
            });
            if (histError) throw histError;
          }
          res.status(200).json({ valor: texto || null });
          return;
        }
        if (!ehCampoFiltro(campo)) {
          res.status(400).json({ error: 'Campo inválido.' });
          return;
        }
        const { data: linhas, error: catError } = await sb.from('ceva_portal_catalogo').select('valor').eq('campo', CATALOGO_CAMPO[campo]);
        if (catError) throw catError;
        const catalogo = (linhas || []).map((row) => String(row.valor));
        const decisao = decidirGravacao(campo, valor, catalogo);
        if (decisao.acao === 'confirmar' && !confirmarNovo) {
          res.status(409).json({ confirmar: true, nome: decisao.nome });
          return;
        }
        const gravar = decisao.acao === 'limpar' ? null : decisao.acao === 'aplicar' ? decisao.valor : decisao.nome;
        if (decisao.acao === 'confirmar') {
          const { error: novoError } = await sb.from('ceva_portal_catalogo').upsert(
            { campo: CATALOGO_CAMPO[campo], valor: decisao.nome },
            { onConflict: 'campo,valor', ignoreDuplicates: true },
          );
          if (novoError) throw novoError;
        }
        await gravarColuna(sb, missionId, campo, gravar);
        res.status(200).json({ valor: gravar, filtro: decisao.acao === 'confirmar' ? decisao.nome : null });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'falha';
        console.error('[ceva-portal] campos', message);
        res.status(500).json({ error: 'Não foi possível salvar o campo.' });
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
        .from('ceva_portal_pgr_historico')
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
      const { data, error } = await sb
        .from('ceva_escolta_solicitacoes')
        .select('id, numero, data_inicio, data_fim, solicitante, quem_autorizou, servico, atendimento_pgr, contrato, operacao, tsp, placa, motorista, franquia_hora, franquia_km, filled_by_name, filled_by_email, created_at')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) {
        console.error('[ceva-portal] list', error.message);
        res.status(500).json({ error: 'Não foi possível carregar as solicitações.' });
        return;
      }
      res.status(200).json({ items: (data || []).map(rowToJson) });
      return;
    }

    if (op === 'solicitacoes' && method === 'POST') {
      let session = null;
      if (CEVA_PORTAL_LOGIN_ENABLED) {
        session = await portalSession(req);
        if (!session) {
          res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
          return;
        }
      }
      const draft = buildCevaSolicitacao(session, body);
      if (!draft.ok) {
        res.status(400).json({ error: draft.error });
        return;
      }
      const sb = createSupabaseAdminClient();
      if (!sb) {
        res.status(503).json({ error: 'Portal indisponível.' });
        return;
      }
      const value = draft.value;
      const { data, error } = await sb
        .from('ceva_escolta_solicitacoes')
        .insert({
          data_inicio: value.dataInicio,
          data_fim: value.dataFim,
          solicitante: value.solicitante,
          quem_autorizou: value.quemAutorizou,
          servico: value.servico,
          atendimento_pgr: value.atendimentoPgr,
          contrato: value.contrato,
          operacao: value.operacao,
          tsp: value.tsp,
          placa: value.placa,
          motorista: value.motorista,
          franquia_hora: value.franquiaHora,
          franquia_km: value.franquiaKm,
          filled_by_user_id: value.filledByUserId,
          filled_by_name: value.filledByName,
          filled_by_email: value.filledByEmail,
        })
        .select('id, numero, data_inicio, data_fim, solicitante, quem_autorizou, servico, atendimento_pgr, contrato, operacao, tsp, placa, motorista, franquia_hora, franquia_km, filled_by_name, filled_by_email, created_at')
        .single();
      if (error || !data) {
        console.error('[ceva-portal] insert', error?.message);
        res.status(500).json({ error: 'Não foi possível registrar a solicitação.' });
        return;
      }
      res.status(201).json({ item: rowToJson(data) });
      return;
    }

    res.status(404).json({ error: 'Rota do portal CEVA não encontrada.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[ceva-portal]', message);
    if (!res.headersSent) {
      res.status(500).json({ error: message || 'Falha no portal CEVA.' });
    }
  }
}
