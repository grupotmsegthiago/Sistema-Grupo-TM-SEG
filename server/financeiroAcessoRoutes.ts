/**
 * Valores financeiros saem do servidor, com a sessão e o perfil lidos no cadastro.
 * A chave anônima não passa por aqui.
 */
import type { Express, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { filtrarGravacaoOs, podeGravarTabelasPreco, podeLerAuditoriaOs, podeLerTabelasPreco, podeLerValoresOs, colunasProtegidasLegiveis } from '../lib/financeiro/acessoCampos';
import { senhasConferem } from '../lib/reaprovacaoFinanceira/capturaSenha';
import { createSupabaseAdminClient } from './supabaseConfig';

const SESSAO_MS = 7 * 24 * 60 * 60 * 1000;
const tentativas = new Map<string, { n: number; ate: number }>();

function sessaoDoPedido(req: Request): string {
  return String(req.headers['x-tmseg-sessao'] || '').trim();
}

async function principalDaSessao(req: Request) {
  const token = String((req as any).authToken || '');
  const sessao = sessaoDoPedido(req);
  const userId = token.match(/(?:tmseg-token|impersonation-token)-(.+)-(\d+)$/)?.[1] || '';
  if (!userId || !sessao) return null;
  const sb = createSupabaseAdminClient();
  if (!sb) return null;
  const sessaoRow = await sb
    .from('user_sessions')
    .select('id, user_id, expires_at, revoked_at')
    .eq('id', sessao)
    .maybeSingle();
  const row = sessaoRow.data as { user_id?: string; expires_at?: string; revoked_at?: string | null } | null;
  if (!row || String(row.user_id) !== String(userId) || row.revoked_at) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
  const usuario = await sb
    .from('system_users')
    .select('id, name, email, status, permissions, profiles:profile_id ( name, permissions )')
    .eq('id', userId)
    .maybeSingle();
  const data = usuario.data as any;
  if (!data || data.status !== 'Ativo') return null;
  const perfil = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles;
  const permissoes = [
    ...(Array.isArray(perfil?.permissions) ? perfil.permissions : []),
    ...(Array.isArray(data.permissions) ? data.permissions : []),
  ];
  return {
    id: data.id,
    name: data.name || null,
    email: data.email || null,
    role: String(perfil?.name || ''),
    permissions: permissoes,
  };
}

export function registerFinanceiroAcessoRoutes(app: Express, requireAuth: any): void {
  app.post('/api/auth/sessao', async (req: Request, res: Response) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const senha = String(req.body?.senha || '');
    if (req.body && typeof req.body === 'object') delete req.body.senha;
    const agora = Date.now();
    const marca = tentativas.get(email) || { n: 0, ate: agora + 10 * 60 * 1000 };
    if (marca.ate < agora) {
      marca.n = 0;
      marca.ate = agora + 10 * 60 * 1000;
    }
    marca.n += 1;
    tentativas.set(email, marca);
    if (!email || !senha || marca.n > 12) {
      res.status(401).json({ erro: 'Não foi possível abrir a sessão.' });
      return;
    }
    const sb = createSupabaseAdminClient();
    if (!sb) {
      res.status(503).json({ erro: 'O servidor não conseguiu abrir a sessão.' });
      return;
    }
    const consulta = await sb
      .from('system_users')
      .select('id, email, password, status')
      .ilike('email', email)
      .maybeSingle();
    const usuario = consulta.data as { id?: string | number; password?: string; status?: string } | null;
    if (!usuario || usuario.status !== 'Ativo' || !senhasConferem(String(usuario.password || ''), senha)) {
      res.status(401).json({ erro: 'Não foi possível abrir a sessão.' });
      return;
    }
    const id = randomUUID();
    const gravou = await sb.from('user_sessions').insert({
      id,
      user_id: String(usuario.id),
      expires_at: new Date(Date.now() + SESSAO_MS).toISOString(),
    });
    if (gravou.error) {
      res.status(503).json({ erro: 'A sessão ainda não está disponível.' });
      return;
    }
    res.json({
      token: `tmseg-token-${usuario.id}-${Date.now()}`,
      sessao: id,
    });
  });

  app.post('/api/financeiro/os/valores', requireAuth, async (req: Request, res: Response) => {
    const principal = await principalDaSessao(req);
    if (!principal) {
      res.status(401).json({ erro: 'Sessão financeira ausente.' });
      return;
    }
    const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map((id: unknown) => String(id || '')).filter(Boolean))].slice(0, 400);
    const colunas = colunasProtegidasLegiveis(principal);
    if (ids.length === 0 || colunas.length === 0) {
      res.json({ linhas: [] });
      return;
    }
    const sb = createSupabaseAdminClient();
    if (!sb) {
      res.status(503).json({ erro: 'O servidor não conseguiu ler os valores.' });
      return;
    }
    const consulta = await sb.from('missions').select(['id', ...colunas].join(',')).in('id', ids);
    if (consulta.error) {
      res.status(500).json({ erro: 'Falha ao ler os valores.' });
      return;
    }
    res.json({ linhas: consulta.data || [] });
  });

  app.post('/api/financeiro/os/gravar', requireAuth, async (req: Request, res: Response) => {
    const principal = await principalDaSessao(req);
    if (!principal) {
      res.status(401).json({ erro: 'Sessão financeira ausente.' });
      return;
    }
    const modo = req.body?.modo === 'insert' ? 'insert' : 'update';
    const sb = createSupabaseAdminClient();
    if (!sb) {
      res.status(503).json({ erro: 'O servidor não conseguiu gravar.' });
      return;
    }
    if (modo === 'insert') {
      const brutos = Array.isArray(req.body?.valores) ? req.body.valores : [];
      const linhas = brutos.map((linha: Record<string, unknown>) => filtrarGravacaoOs(principal, linha || {}, 'insert'));
      const gravou = await sb.from('missions').insert(linhas).select('id');
      if (gravou.error) {
        res.status(400).json({ erro: 'A OS não foi gravada.' });
        return;
      }
      res.json({ linhas: gravou.data || [] });
      return;
    }
    const idEq = req.body?.filtros?.eq?.id;
    const idIn = req.body?.filtros?.inn?.id || req.body?.filtros?.in?.id;
    const ids = idEq != null ? [String(idEq)] : Array.isArray(idIn) ? idIn.map(String) : [];
    if (ids.length === 0) {
      res.status(400).json({ erro: 'A gravação financeira precisa da OS.' });
      return;
    }
    const payload = filtrarGravacaoOs(principal, req.body?.valores || {}, 'update');
    const gravou = await sb.from('missions').update(payload).in('id', ids).select('id, last_update, current_location, map_link');
    if (gravou.error) {
      res.status(400).json({ erro: 'A OS não foi gravada.' });
      return;
    }
    res.json({ linhas: gravou.data || [] });
  });

  app.post('/api/financeiro/tabelas/ler', requireAuth, async (req: Request, res: Response) => {
    const principal = await principalDaSessao(req);
    if (!principal || !podeLerTabelasPreco(principal)) {
      res.status(403).json({ erro: 'Sem acesso à tabela de preço.' });
      return;
    }
    const tabela = req.body?.tabela === 'provider_cost_tables' ? 'provider_cost_tables' : 'client_price_tables';
    const sb = createSupabaseAdminClient();
    if (!sb) {
      res.status(503).json({ erro: 'O servidor não conseguiu ler a tabela.' });
      return;
    }
    const consulta = await sb.from(tabela).select('*');
    if (consulta.error) {
      res.status(500).json({ erro: 'Falha ao ler a tabela.' });
      return;
    }
    res.json({ linhas: consulta.data || [] });
  });

  app.post('/api/financeiro/tabelas/gravar', requireAuth, async (req: Request, res: Response) => {
    const principal = await principalDaSessao(req);
    if (!principal || !podeGravarTabelasPreco(principal)) {
      res.status(403).json({ erro: 'Sem permissão para gravar a tabela.' });
      return;
    }
    const tabela = req.body?.tabela === 'provider_cost_tables' ? 'provider_cost_tables' : 'client_price_tables';
    const modo = String(req.body?.modo || '');
    const sb = createSupabaseAdminClient();
    if (!sb) {
      res.status(503).json({ erro: 'O servidor não conseguiu gravar a tabela.' });
      return;
    }
    const filtros = Array.isArray(req.body?.filtros) ? req.body.filtros : [];
    const eq = (coluna: string) => filtros.find((f: { tipo?: string; coluna?: string }) => f.tipo === 'eq' && f.coluna === coluna)?.valor;
    const inn = (coluna: string) => filtros.find((f: { tipo?: string; coluna?: string }) => f.tipo === 'in' && f.coluna === coluna)?.valor;
    if (modo === 'insert') {
      const linhas = Array.isArray(req.body?.valores) ? req.body.valores : [req.body?.valores];
      const gravou = await sb.from(tabela).insert(linhas).select('id');
      if (gravou.error) {
        res.status(400).json({ erro: 'A tabela não foi gravada.' });
        return;
      }
      res.json({ linhas: gravou.data || [] });
      return;
    }
    const id = eq('id');
    const ids = Array.isArray(inn('id')) ? inn('id') : id != null ? [id] : [];
    if (ids.length === 0) {
      res.status(400).json({ erro: 'A gravação da tabela precisa do identificador.' });
      return;
    }
    if (modo === 'delete') {
      const apagou = await sb.from(tabela).delete().in('id', ids).select('id');
      if (apagou.error) {
        res.status(400).json({ erro: 'A tabela não foi alterada.' });
        return;
      }
      res.json({ linhas: apagou.data || [] });
      return;
    }
    const gravou = await sb.from(tabela).update(req.body?.valores || {}).in('id', ids).select('id');
    if (gravou.error) {
      res.status(400).json({ erro: 'A tabela não foi gravada.' });
      return;
    }
    res.json({ linhas: gravou.data || [] });
  });
}

export function financeiroAcessoNegadoParaAnon(): boolean {
  return !podeLerValoresOs(null) && !podeLerAuditoriaOs(null);
}
