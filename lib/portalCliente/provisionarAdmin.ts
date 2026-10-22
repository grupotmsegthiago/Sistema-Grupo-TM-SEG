import { hashSenha } from '../cevaPortal/acesso.js';
import { vincularCadastroCliente } from '../cevaPortal/cadastroSistema.js';
import { emailPortalDoSite, senhaInicialDoCnpj } from './acessoInicial.js';

type ClientePortal = {
  id?: number | string | null;
  name?: string | null;
  trading_name?: string | null;
  cnpj?: string | null;
  portal_site?: string | null;
  portal_slug?: string | null;
  portal_ativo?: boolean | null;
};

export async function criarAdministradorInicial(
  sb: { from: (tabela: string) => any },
  cliente: ClientePortal,
): Promise<{ ok: true; criado: boolean; email: string } | { ok: false; error: string }> {
  if (cliente.portal_ativo !== true) return { ok: false, error: 'O portal deste cliente não está ligado.' };
  const email = emailPortalDoSite(cliente.portal_site);
  if (!email) return { ok: false, error: 'Informe o site do cliente para criar o e-mail portal@domínio.' };
  const senha = senhaInicialDoCnpj(cliente.cnpj);
  if (!senha) return { ok: false, error: 'O primeiro acesso usa o CNPJ como senha. O documento precisa ter 14 números.' };
  const slug = String(cliente.portal_slug || '').trim();
  if (!slug) return { ok: false, error: 'Informe o endereço da página do portal.' };
  const clientId = cliente.id;
  if (clientId == null || clientId === '') return { ok: false, error: 'Cliente sem identificador.' };

  const leitura = await sb
    .from('portal_cliente_usuarios')
    .select('id, email, perfil')
    .eq('client_id', clientId)
    .eq('perfil', 'administrador')
    .limit(1);
  if (leitura.error) {
    const codigo = String(leitura.error.code || '');
    if (codigo === '42P01' || codigo === 'PGRST205' || codigo === 'PGRST204') {
      return { ok: false, error: 'A tabela de acessos do portal ainda não está no banco.' };
    }
    return { ok: false, error: 'Não foi possível consultar o administrador do portal.' };
  }
  const existente = Array.isArray(leitura.data) ? leitura.data[0] : null;
  if (existente?.email) return { ok: true, criado: false, email: String(existente.email) };

  const nome = String(cliente.trading_name || cliente.name || 'Administrador').trim().slice(0, 120);
  const novo = {
    client_id: clientId,
    nome,
    email,
    perfil: 'administrador',
    status: 'ativo',
    trocar_senha: true,
    trocar_email: true,
    senha_hash: hashSenha(senha),
    senha_alterada_em: null,
  };
  const gravado = await sb.from('portal_cliente_usuarios').insert(novo).select('id').single();
  if (gravado.error || !gravado.data?.id) {
    if (gravado.error?.code === '23505') return { ok: false, error: 'Este e-mail provisório já está em outro acesso.' };
    return { ok: false, error: 'Não foi possível criar o administrador do portal.' };
  }
  const vinculo = await vincularCadastroCliente(sb, {
    nome,
    email,
    senhaTemporaria: senha,
    clientId,
    caminho: `/${slug}`,
    perfil: 'administrador',
    ativo: true,
  });
  if (!vinculo.ok) {
    await sb.from('portal_cliente_usuarios').delete().eq('id', gravado.data.id);
    return vinculo;
  }
  return { ok: true, criado: true, email };
}
