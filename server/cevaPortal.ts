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
  app.delete('/api/ceva-portal/pessoas/:id', async (req, res) => {
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
    const { montarDestinatariosEnvio } = await import('../lib/portalCliente/gestaoCotacao.js');
    const { atorDaRequisicao } = await import('./cotacaoGestaoHttp.js');
    const { createSupabaseAdminClient: criarBanco } = await import('./supabaseConfig.js');
    const bancoAtor = criarBanco();
    const ator = bancoAtor ? await atorDaRequisicao(bancoAtor, req.headers as Record<string, unknown>) : null;
    const destinos = montarDestinatariosEnvio({
      selecionados: String(req.body?.para || ''),
      autor: ator?.email || '',
    });
    if (!destinos.ok) {
      res.status(400).json({ error: destinos.error });
      return;
    }
    const { cartaDaProposta, htmlDaProposta, propostaRecebida } = await import('../lib/portalCliente/apresentacao.js');
    const proposta = propostaRecebida(req.body?.proposta);
    if (!proposta) {
      res.status(400).json({ error: 'Proposta incompleta.' });
      return;
    }
    const { rotuloDeOperacoes } = await import('../lib/portalCliente/cotacaoHttp.js');
    const operacoes = bancoAtor ? await rotuloDeOperacoes(bancoAtor) : null;
    try {
      const { pdfAnexoAceito } = await import('../lib/portalCliente/gestaoCotacao.js');
      const { nomeAnexoPdf } = await import('../lib/portalCliente/historicoCotacoes.js');
      const anexo = pdfAnexoAceito(String(req.body?.pdf || ''));
      if (!anexo.ok) {
        res.status(400).json({ error: anexo.error });
        return;
      }
      const { sendMail, SMTP_FROM } = await import('../lib/email/smtp.js');
      await sendMail({
        from: SMTP_FROM,
        to: destinos.para,
        cc: destinos.copias.length ? destinos.copias : undefined,
        subject: `Proposta Grupo TM SEG — ${proposta.operacao}`,
        text: cartaDaProposta(proposta, operacoes),
        html: htmlDaProposta(proposta, operacoes),
        attachments: [{
          filename: nomeAnexoPdf(req.body?.nomePdf, {
            cliente: '',
            origem: proposta.origem,
            destino: proposta.destino,
            numero: proposta.numero,
          }),
          content: Buffer.from(anexo.base64, 'base64'),
          contentType: 'application/pdf',
        }],
      });
      res.status(200).json({ ok: true, enviado: true, para: destinos.para, copias: destinos.copias });
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
    const { urlMapaEstatico, urlMapaPorEnderecos } = await import('../lib/portalCliente/frotaVisual.js');
    const { chaveDoMapaNoServidor, refererDoMapa } = await import('../lib/portalCliente/rotaCotacao.js');
    const pontos = Array.isArray(req.body?.pontos) ? req.body.pontos.slice(0, 120) : [];
    const paradasBrutas = Array.isArray(req.body?.paradas) ? req.body.paradas.slice(0, 6) : [];
    const paradasPonto = paradasBrutas.filter((item: unknown) => item && typeof item === 'object');
    const paradasTexto = paradasBrutas.map((item: unknown) => (typeof item === 'string' ? item : '')).filter(Boolean);
    const chave = chaveDoMapaNoServidor(process.env);
    const url = urlMapaEstatico({
      polyline: String(req.body?.polyline || '').slice(0, 20000),
      chave,
      inicio: req.body?.inicio,
      fim: req.body?.fim,
      paradas: paradasPonto,
      pontos,
    }) || urlMapaPorEnderecos({
      origem: String(req.body?.origem || ''),
      destino: String(req.body?.destino || ''),
      paradas: paradasTexto,
      chave,
    });
    if (!url) {
      res.status(400).json({ error: 'A rota ainda não tem um traçado para o mapa.' });
      return;
    }
    try {
      const mapa = await imagemDoMapa(url, String(req.headers.origin || req.headers.referer || ''));
      if (!mapa) {
        res.status(502).json({ error: 'O mapa estático não veio como imagem.' });
        return;
      }
      res.setHeader('Cache-Control', 'private, no-store');
      res.status(200).json({ mapa });
    } catch (error) {
      console.error('[proposta-escolta] mapa', error instanceof Error ? error.message : error);
      res.status(502).json({ error: 'O mapa estático não respondeu.' });
    }
  });
  app.get('/api/ceva-portal/fotos/:os', async (req, res) => {
    if (req.query && typeof req.query === 'object') Object.assign(req.query, { op: 'fotos', os: String(req.params.os || '') });
    await handleCevaPortalHttp(req, res);
  });
  app.post('/api/cotacoes/:id/link-visualizacao', async (req, res) => {
    const { createSupabaseAdminClient } = await import('./supabaseConfig.js');
    const { atorDaRequisicao } = await import('./cotacaoGestaoHttp.js');
    const { emitirLinkProposta } = await import('../lib/portalCliente/linkPropostaHttp.js');
    const { randomBytes } = await import('crypto');
    const sb = createSupabaseAdminClient();
    const banco = sb ? bancoDoLink(sb) : null;
    if (!banco) {
      res.status(503).json({ error: 'Cotação indisponível.' });
      return;
    }
    const ator = await atorDaRequisicao(sb!, req.headers as Record<string, unknown>);
    const resultado = await emitirLinkProposta(banco, ator, String(req.params.id || ''), new Date(), randomBytes(16));
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(resultado.status).json(resultado.corpo);
  });
  app.get('/api/proposta-publica/:id/:token', async (req, res) => {
    const { createSupabaseAdminClient } = await import('./supabaseConfig.js');
    const { lerPropostaPublica } = await import('../lib/portalCliente/linkPropostaHttp.js');
    const sb = createSupabaseAdminClient();
    const banco = sb ? bancoDoLink(sb) : null;
    if (!banco) {
      res.status(503).json({ error: 'Cotação indisponível.' });
      return;
    }
    const resultado = await lerPropostaPublica(banco, String(req.params.id || ''), String(req.params.token || ''), new Date());
    res.setHeader('Cache-Control', 'private, no-store');
    if (resultado.status !== 200 || !('proposta' in resultado.corpo) || !resultado.corpo.proposta) {
      res.status(resultado.status).json(resultado.corpo);
      return;
    }
    const proposta = resultado.corpo.proposta as { origem?: string; destino?: string; paradas?: string[] };
    const mapa = await mapaPorEndereco(String(proposta.origem || ''), String(proposta.destino || ''), Array.isArray(proposta.paradas) ? proposta.paradas : [], String(req.headers.origin || req.headers.referer || ''));
    res.status(200).json({ ...resultado.corpo, mapa });
  });
}

async function imagemDoMapa(url: string, origem: string): Promise<string | null> {
  const { refererDoMapa } = await import('../lib/portalCliente/rotaCotacao.js');
  const resposta = await fetch(url, { headers: { Referer: refererDoMapa(origem) } });
  const tipo = String(resposta.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const buffer = Buffer.from(await resposta.arrayBuffer());
  if (!resposta.ok || !tipo.startsWith('image/') || buffer.length < 8000) return null;
  return `data:${tipo};base64,${buffer.toString('base64')}`;
}

async function mapaPorEndereco(origem: string, destino: string, paradas: string[], referer: string): Promise<string | null> {
  const { urlMapaPorEnderecos } = await import('../lib/portalCliente/frotaVisual.js');
  const { chaveDoMapaNoServidor } = await import('../lib/portalCliente/rotaCotacao.js');
  const url = urlMapaPorEnderecos({
    origem,
    destino,
    paradas: paradas.map((item) => String(item || '')).filter(Boolean).slice(0, 6),
    chave: chaveDoMapaNoServidor(process.env),
  });
  if (!url) return null;
  try {
    return await imagemDoMapa(url, referer);
  } catch (error) {
    console.error('[proposta-publica] mapa', error instanceof Error ? error.message : error);
    return null;
  }
}

function bancoDoLink(sb: { from: (tabela: string) => any }) {
  return {
    async ler(id: string) {
      const { data, error } = await sb.from('quotes').select('id, client_name, origin, destination, total_km, total_hours, total_value, created_at, created_by, status, is_active, converted_to_order_id, contract_details').eq('id', id).maybeSingle();
      if (error || !data) return null;
      return {
        ...data,
        id: String(data.id),
        contract_details: data.contract_details == null ? null : String(data.contract_details),
      };
    },
    async gravar(id: string, contractDetails: string) {
      const { error } = await sb.from('quotes').update({ contract_details: contractDetails }).eq('id', id);
      return error ? 'Não foi possível gravar o link.' : null;
    },
  };
}
