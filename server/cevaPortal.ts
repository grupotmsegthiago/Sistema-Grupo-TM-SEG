import type { Express, Request, Response } from 'express';
import { handleCevaPortalHttp } from '../lib/cevaPortal/httpHandler';

function withOp(op: string, extraQuery?: Record<string, string>) {
  return async (req: Request, res: Response) => {
    // Express 5 expõe req.query só como getter. Acrescentar a chave, sem trocar o objeto.
    if (req.query && typeof req.query === 'object') Object.assign(req.query, { op, ...(extraQuery || {}) });
    await handleCevaPortalHttp(req, res);
  };
}

/** Portal externo CEVA. Em produção Vercel usa api/ceva-portal.ts (leve). */
export function registerCevaPortalRoutes(app: Express): void {
  app.get('/api/ceva-portal/acesso', withOp('acesso'));
  app.post('/api/ceva-portal/login', withOp('login'));
  app.post('/api/ceva-portal/primeiro-acesso', withOp('primeiro-acesso'));
  app.get('/api/ceva-portal/me', withOp('me'));
  app.post('/api/ceva-portal/trocar-senha', withOp('trocar-senha'));
  app.get('/api/ceva-portal/pessoas', withOp('pessoas'));
  app.post('/api/ceva-portal/pessoas', withOp('pessoas'));
  app.patch('/api/ceva-portal/pessoas/:id', async (req, res) => {
    if (req.query && typeof req.query === 'object') Object.assign(req.query, { op: 'pessoas-item', id: String(req.params.id || '') });
    await handleCevaPortalHttp(req, res);
  });
  app.get('/api/ceva-portal/ao-vivo', withOp('ao-vivo'));
  app.get('/api/ceva-portal/relatorio', withOp('relatorio'));
  app.post('/api/ceva-portal/campos', withOp('campos'));
  app.get('/api/ceva-portal/catalogo', withOp('catalogo'));
  app.get('/api/ceva-portal/frota', withOp('frota'));
  app.post('/api/ceva-portal/catalogo', withOp('catalogo'));
  app.delete('/api/ceva-portal/catalogo', withOp('catalogo'));
  app.get('/api/ceva-portal/status', withOp('status'));
  app.get('/api/ceva-portal/pgr/:os', async (req, res) => {
    if (req.query && typeof req.query === 'object') Object.assign(req.query, { op: 'pgr', os: String(req.params.os || '') });
    await handleCevaPortalHttp(req, res);
  });
  app.get('/api/ceva-portal/solicitacoes', withOp('solicitacoes'));
  app.post('/api/ceva-portal/solicitacoes', withOp('solicitacoes'));
  app.post('/api/ceva-portal/medicao', withOp('medicao'));
  app.get('/api/ceva-portal/cotacao', withOp('cotacao'));
  app.post('/api/ceva-portal/cotacao', withOp('cotacao'));
  app.get('/api/proposta-escolta/operacoes', async (req, res) => {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const { extractUserIdFromToken } = await import('../lib/rh/apiEmployeesAuth.js');
    if (!extractUserIdFromToken(token)) {
      res.status(401).json({ error: 'Entre novamente.' });
      return;
    }
    const { rotuloDeOperacoes } = await import('../lib/portalCliente/cotacaoHttp.js');
    const { createSupabaseAdminClient } = await import('./supabaseConfig.js');
    const sb = createSupabaseAdminClient();
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).json({ operacoes: sb ? await rotuloDeOperacoes(sb) : null });
  });
  app.post('/api/proposta-escolta/email', async (req, res) => {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const { extractUserIdFromToken } = await import('../lib/rh/apiEmployeesAuth.js');
    if (!extractUserIdFromToken(token)) {
      res.status(401).json({ error: 'Entre novamente para enviar a proposta.' });
      return;
    }
    const para = String(req.body?.para || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(para)) {
      res.status(400).json({ error: 'Informe um e-mail válido.' });
      return;
    }
    const bruto = req.body?.proposta;
    if (!bruto || typeof bruto !== 'object') {
      res.status(400).json({ error: 'Proposta incompleta.' });
      return;
    }
    const numeros = [bruto.acionamento, bruto.kmFranquia, bruto.horasFranquia, bruto.kmExtra, bruto.horaExtra].map(Number);
    if (numeros.some((valor) => !Number.isFinite(valor))) {
      res.status(400).json({ error: 'Proposta incompleta.' });
      return;
    }
    const { cartaDaProposta } = await import('../lib/portalCliente/apresentacao.js');
    const { rotuloDeOperacoes } = await import('../lib/portalCliente/cotacaoHttp.js');
    const { createSupabaseAdminClient } = await import('./supabaseConfig.js');
    const sb = createSupabaseAdminClient();
    const operacoes = sb ? await rotuloDeOperacoes(sb) : null;
    const proposta = {
      acordada: Boolean(bruto.acordada),
      regiao: String(bruto.regiao || ''),
      origem: String(bruto.origem || ''),
      destino: String(bruto.destino || ''),
      paradas: Array.isArray(bruto.paradas) ? bruto.paradas.map((item: unknown) => String(item || '')) : [],
      acionamento: numeros[0],
      kmFranquia: numeros[1],
      horasFranquia: numeros[2],
      kmExtra: numeros[3],
      horaExtra: numeros[4],
      operacao: String(bruto.operacao || 'escolta').slice(0, 160),
    };
    try {
      const { sendMail, SMTP_FROM } = await import('../lib/email/smtp.js');
      await sendMail({
        from: SMTP_FROM,
        to: para,
        subject: `Proposta Grupo TM SEG — ${proposta.operacao}`,
        text: cartaDaProposta(proposta, operacoes),
      });
      res.status(200).json({ ok: true, enviado: true });
    } catch (error) {
      console.error('[proposta-escolta] email', error instanceof Error ? error.message : error);
      res.status(200).json({ ok: true, enviado: false, aviso: 'O e-mail não saiu agora. A proposta continua disponível para impressão.' });
    }
  });
  app.post('/api/proposta-escolta/visual', async (req, res) => {
    const { pedidoVisualAutorizado, visualizarFrota } = await import('./frotaVisual.js');
    if (!await pedidoVisualAutorizado(req.headers as Record<string, unknown>)) {
      res.status(401).json({ error: 'Entre novamente para preparar a carreta.' });
      return;
    }
    const cliente = String(req.body?.cliente || '').trim().slice(0, 120);
    if (!cliente) {
      res.status(400).json({ error: 'Informe o cliente.' });
      return;
    }
    const { corSegura } = await import('../lib/portalCliente/frotaVisual.js');
    const resultado = await visualizarFrota(cliente, corSegura(String(req.body?.cor || '')));
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).json(resultado);
  });
  app.patch('/api/cotacoes/:id/inativar', async (req, res) => {
    const { atenderGestaoCotacao } = await import('./cotacaoGestaoHttp.js');
    await atenderGestaoCotacao(req, res, 'inativar');
  });
  app.delete('/api/cotacoes/:id', async (req, res) => {
    const { atenderGestaoCotacao } = await import('./cotacaoGestaoHttp.js');
    await atenderGestaoCotacao(req, res, 'excluir');
  });
  app.post('/api/cotacoes/:id/enviar-email', async (req, res) => {
    const { atenderGestaoCotacao } = await import('./cotacaoGestaoHttp.js');
    await atenderGestaoCotacao(req, res, 'email');
  });
  app.post('/api/proposta-escolta/mapa', async (req, res) => {
    const { pedidoVisualAutorizado } = await import('./frotaVisual.js');
    if (!await pedidoVisualAutorizado(req.headers as Record<string, unknown>)) {
      res.status(401).json({ error: 'Entre novamente para montar o mapa.' });
      return;
    }
    const { urlMapaEstatico } = await import('../lib/portalCliente/frotaVisual.js');
    const { chaveDoMapaNoServidor, refererDoMapa } = await import('../lib/portalCliente/rotaCotacao.js');
    const pontos = Array.isArray(req.body?.pontos) ? req.body.pontos.slice(0, 120) : [];
    const paradas = Array.isArray(req.body?.paradas) ? req.body.paradas.slice(0, 6) : [];
    const url = urlMapaEstatico({
      polyline: String(req.body?.polyline || '').slice(0, 20000),
      chave: chaveDoMapaNoServidor(process.env),
      inicio: req.body?.inicio,
      fim: req.body?.fim,
      paradas,
      pontos,
    });
    if (!url) {
      res.status(400).json({ error: 'A rota ainda não tem um traçado para o mapa.' });
      return;
    }
    try {
      const referer = refererDoMapa(String(req.headers.origin || req.headers.referer || ''));
      const resposta = await fetch(url, { headers: { Referer: referer } });
      const tipo = String(resposta.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      const buffer = Buffer.from(await resposta.arrayBuffer());
      if (!resposta.ok || !tipo.startsWith('image/') || buffer.length < 8000) {
        res.status(502).json({ error: 'O mapa estático não veio como imagem.' });
        return;
      }
      res.setHeader('Cache-Control', 'private, no-store');
      res.status(200).json({ mapa: `data:${tipo};base64,${buffer.toString('base64')}` });
    } catch (error) {
      console.error('[proposta-escolta] mapa', error instanceof Error ? error.message : error);
      res.status(502).json({ error: 'O mapa estático não respondeu.' });
    }
  });
  app.get('/api/ceva-portal/fotos/:os', async (req, res) => {
    if (req.query && typeof req.query === 'object') Object.assign(req.query, { op: 'fotos', os: String(req.params.os || '') });
    await handleCevaPortalHttp(req, res);
  });
}
