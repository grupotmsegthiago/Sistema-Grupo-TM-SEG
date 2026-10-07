import type { Express, Request, Response } from 'express';
import { createSupabaseAdminClient } from './supabaseConfig';
import { emailDeAcesso, nomeDeAcesso, perfilDeAcesso } from '../lib/cevaPortal/acesso';
import { perfilPortalDasPermissoes } from '../lib/cevaPortal/regrasAcesso';
import { sincronizarAcessoPortal } from '../lib/cevaPortal/cadastroSistema';
import { portalPorNomeCliente } from '../lib/cevaPortal/portalServidor';

function idDoTokenInterno(token: string): string | null {
  const limpo = String(token || '').replace(/^Bearer\s+/i, '').trim();
  const match = limpo.match(/^(?:tmseg-token|impersonation-token)-(.+)-(\d+)$/);
  return match ? match[1] : null;
}

/** Cadastro de Usuários do cliente libera o portal sem abrir o restante do sistema. */
export function registerPortalClienteAcesso(app: Express): void {
  app.post('/api/portal-cliente/acesso', async (req: Request, res: Response) => {
    const userId = idDoTokenInterno(String(req.headers.authorization || ''));
    if (!userId) {
      res.status(401).json({ error: 'Não autorizado' });
      return;
    }
    const sb = createSupabaseAdminClient();
    if (!sb) {
      res.status(503).json({ error: 'Portal indisponível.' });
      return;
    }
    const { data: principal } = await sb
      .from('system_users')
      .select('id, status, client_id, provider_id, permissions, profiles:profile_id ( permissions )')
      .eq('id', userId)
      .maybeSingle();
    if (!principal || principal.status !== 'Ativo') {
      res.status(401).json({ error: 'Não autorizado' });
      return;
    }

    const clientId = String(req.body?.clientId || '').trim();
    const email = emailDeAcesso(req.body?.email);
    const nome = nomeDeAcesso(req.body?.nome);
    const perfil = perfilDeAcesso(req.body?.perfil);
    const systemUserId = String(req.body?.systemUserId || '').trim();
    const acesso = req.body?.acesso === true;
    const ativo = req.body?.ativo !== false;
    if (!clientId || !email || !nome || !perfil || !systemUserId) {
      res.status(400).json({ error: 'Informe cliente, nome, e-mail, perfil e o usuário do cadastro.' });
      return;
    }

    const perfilPerms = Array.isArray((principal.profiles as { permissions?: string[] } | null)?.permissions)
      ? (principal.profiles as { permissions: string[] }).permissions
      : [];
    const userPerms = Array.isArray(principal.permissions) ? principal.permissions : [];
    const perms = [...new Set([...perfilPerms, ...userPerms])];
    if (principal.provider_id && !principal.client_id) {
      res.status(403).json({ error: 'Fornecedor não libera portal de cliente.' });
      return;
    }
    if (principal.client_id && String(principal.client_id) !== clientId) {
      res.status(403).json({ error: 'Você só libera acesso do seu cliente.' });
      return;
    }
    if (principal.client_id) {
      const pode = perms.includes('client-users') || perms.includes('*') || perfilPortalDasPermissoes(perms) === 'administrador';
      if (!pode) {
        res.status(403).json({ error: 'Sem permissão para cadastrar usuários do portal.' });
        return;
      }
    }

    const { data: cliente, error: erroCliente } = await sb.from('clients').select('id, name').eq('id', clientId).maybeSingle();
    if (erroCliente || !cliente?.name) {
      res.status(404).json({ error: 'Cliente não encontrado.' });
      return;
    }
    const portal = portalPorNomeCliente(cliente.name);
    if (!portal) {
      res.status(400).json({ error: 'Este cliente não tem portal.' });
      return;
    }

    const resultado = await sincronizarAcessoPortal(sb, {
      clientId: cliente.id,
      nome,
      email,
      senha: String(req.body?.senha || ''),
      perfil,
      ativo,
      systemUserId,
      acesso,
      tabela: portal.tabelas.usuarios,
      caminho: portal.caminho,
    });
    if (!resultado.ok) {
      res.status(resultado.status).json({ error: resultado.error });
      return;
    }
    res.status(200).json({
      manteveSenha: resultado.manteveSenha,
      acesso: resultado.acesso,
      rotulo: portal.rotulo,
      caminho: portal.caminho,
    });
  });
}
