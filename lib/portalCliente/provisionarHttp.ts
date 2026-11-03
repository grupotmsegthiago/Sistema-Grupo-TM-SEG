import { portalPorNomeCliente } from '../cevaPortal/portalServidor.js';
import { usuarioIdDoToken } from '../sessao/token.js';
import { createSupabaseAdminClient } from '../supabaseAdmin.js';
import { criarAdministradorInicial } from './provisionarAdmin.js';

function corpo(req: any): Record<string, unknown> {
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body || {};
}

/** Cria o administrador portal@domínio depois que o cadastro do cliente foi salvo. */
export async function responderProvisionar(req: any, res: any): Promise<void> {
  if (!usuarioIdDoToken(String(req.headers?.authorization || ''))) {
    res.status(401).json({ error: 'Não autorizado' });
    return;
  }
  const clientId = String(corpo(req).clientId || '').trim();
  if (!clientId) {
    res.status(400).json({ error: 'Informe o cliente.' });
    return;
  }
  const sb = createSupabaseAdminClient();
  if (!sb) {
    res.status(503).json({ error: 'Portal indisponível.' });
    return;
  }
  const { data, error } = await sb
    .from('clients')
    .select('id, name, trading_name, cnpj, status, portal_ativo, portal_site, portal_slug')
    .eq('id', clientId)
    .maybeSingle();
  if (error || !data) {
    res.status(404).json({ error: 'Cliente não encontrado.' });
    return;
  }
  if (portalPorNomeCliente(data.name)) {
    res.status(200).json({ ok: true, criado: false, fixo: true });
    return;
  }
  if (String(data.status || '') !== 'Ativo') {
    res.status(422).json({ error: 'O portal inicial só nasce com o cliente ativo.' });
    return;
  }
  const resultado = await criarAdministradorInicial(sb, data);
  res.status(resultado.ok ? 200 : 422).json(resultado);
}
