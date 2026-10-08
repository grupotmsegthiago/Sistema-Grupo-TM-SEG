import type { PerfilCeva } from './acesso';

export const DIAS_TROCA_SENHA_PORTAL = 30;
export const PERMISSAO_SO_PORTAL = 'portal-only';

/** Quem já tem hash no portal (a Lara, por exemplo) não recebe senha nova. */
export function preservarSenhaPortal(senhaHash: string | null | undefined): boolean {
  return String(senhaHash || '').startsWith('scrypt$');
}

export function senhaPortalVencida(
  senhaAlteradaEm: string | null | undefined,
  agora = new Date(),
  dias = DIAS_TROCA_SENHA_PORTAL,
): boolean {
  if (!senhaAlteradaEm) return false;
  const quando = new Date(senhaAlteradaEm).getTime();
  if (!Number.isFinite(quando)) return true;
  return agora.getTime() - quando >= dias * 24 * 60 * 60 * 1000;
}

export function deveTrocarSenhaPortal(input: {
  trocarSenha?: boolean | null;
  senhaAlteradaEm?: string | null;
  agora?: Date;
}): boolean {
  if (input.trocarSenha === true) return true;
  return senhaPortalVencida(input.senhaAlteradaEm, input.agora ?? new Date());
}

export function permissoesDoPortal(caminho: string, perfil: PerfilCeva): string[] {
  const rota = caminho.startsWith('/') ? caminho : `/${caminho}`;
  return [PERMISSAO_SO_PORTAL, `portal:${rota}`, `portal-perfil:${perfil}`];
}

export function usuarioSoPortal(perms: unknown): boolean {
  return Array.isArray(perms) && perms.includes(PERMISSAO_SO_PORTAL);
}

export function caminhoPortalDasPermissoes(perms: unknown): string | null {
  if (!Array.isArray(perms)) return null;
  const marca = perms.find((item) => typeof item === 'string' && item.startsWith('portal:/'));
  return typeof marca === 'string' ? marca.slice('portal:'.length) : null;
}

export function perfilPortalDasPermissoes(perms: unknown): PerfilCeva | null {
  if (!Array.isArray(perms)) return null;
  const marca = perms.find((item) => typeof item === 'string' && item.startsWith('portal-perfil:'));
  if (typeof marca !== 'string') return null;
  const perfil = marca.slice('portal-perfil:'.length);
  return perfil === 'administrador' || perfil === 'analista' ? perfil : null;
}

export function semMarcasDePortal(perms: unknown): string[] {
  if (!Array.isArray(perms)) return [];
  return perms.filter((item) => (
    typeof item === 'string'
    && item !== PERMISSAO_SO_PORTAL
    && !item.startsWith('portal:/')
    && !item.startsWith('portal-perfil:')
  ));
}

export function mensagemAcessoPortal(input: {
  nome: string;
  email: string;
  senha?: string;
  rotulo: string;
  link: string;
  manteveSenha: boolean;
}): string {
  const senha = input.manteveSenha
    ? 'A senha continua a mesma que você já usa neste portal.'
    : `🔑 *Senha:* ${input.senha || ''}`;
  const aviso = input.manteveSenha
    ? 'A senha precisa ser trocada a cada 30 dias dentro do portal.'
    : '⚠️ No primeiro acesso, você deverá trocar sua senha. Depois, a troca é obrigatória a cada 30 dias.';
  return [
    `🔐 *GRUPO TMSEG — Acesso ao portal ${input.rotulo}*`,
    '',
    `Olá *${input.nome}*,`,
    '',
    'Seu acesso mostra somente as informações deste cliente.',
    '',
    `📧 *Login:* ${input.email}`,
    senha,
    `🌐 *Link:* ${input.link}`,
    '',
    aviso,
    '',
    '_Grupo TMSEG — Gestão Operacional_',
  ].join('\n');
}

/** O acesso nasce no Cadastro de Usuários. A tela pública não cria administrador. */
export function decidirPrimeiroAcesso(_input?: {
  existeAdministrador?: boolean;
}): { ok: false; error: string } {
  return {
    ok: false,
    error: 'O acesso é criado no Cadastro de Usuários do cliente, com a opção Acesso ao portal. A senha chega nessa liberação e troca no primeiro acesso.',
  };
}
