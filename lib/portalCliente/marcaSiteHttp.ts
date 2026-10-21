/** Leitura do site no cadastro. Só usuário interno autenticado. */

import { usuarioIdDoToken } from '../sessao/token';
import { buscarMarcaDoSite } from './marcaSite';

export async function responderMarcaSite(req: any, res: any): Promise<void> {
  const userId = usuarioIdDoToken(String(req.headers?.authorization || ''));
  if (!userId) {
    res.status(401).json({ error: 'Não autorizado' });
    return;
  }
  const bruto = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : (req.body || {});
  const url = String(bruto?.url || '');
  const marca = await buscarMarcaDoSite(url);
  if ('error' in marca) {
    res.status(422).json(marca);
    return;
  }
  res.status(200).json(marca);
}
