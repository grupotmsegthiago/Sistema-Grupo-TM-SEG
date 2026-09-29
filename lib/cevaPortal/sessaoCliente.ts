import type { PerfilCeva } from './acesso';

const CHAVE = 'ceva-portal-sessao';

export type SessaoCeva = {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    perfil: PerfilCeva;
    trocarSenha?: boolean;
  };
};

function armazenamento(): Storage | null {
  return typeof sessionStorage === 'undefined' ? null : sessionStorage;
}

export function lerSessaoCeva(): SessaoCeva | null {
  try {
    const bruto = armazenamento()?.getItem(CHAVE);
    if (!bruto) return null;
    const dados = JSON.parse(bruto) as SessaoCeva;
    if (!dados?.token || (dados.user?.perfil !== 'administrador' && dados.user?.perfil !== 'analista')) return null;
    return dados;
  } catch {
    return null;
  }
}

export function gravarSessaoCeva(sessao: SessaoCeva): void {
  armazenamento()?.setItem(CHAVE, JSON.stringify(sessao));
}

export function limparSessaoCeva(): void {
  armazenamento()?.removeItem(CHAVE);
}

export function cabecalhosCeva(): Record<string, string> {
  const sessao = lerSessaoCeva();
  return sessao ? { Authorization: `Bearer ${sessao.token}` } : {};
}

export function sairDoPortalCeva(): void {
  limparSessaoCeva();
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('ceva-portal-sair'));
}
