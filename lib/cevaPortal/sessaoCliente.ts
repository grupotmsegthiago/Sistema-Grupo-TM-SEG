import type { PerfilCeva } from './acesso';

const CHAVE = 'ceva-portal-sessao';
const EVENTO = 'ceva-portal-sair';

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

export function lerSessaoPortal(chave = CHAVE): SessaoCeva | null {
  try {
    const bruto = armazenamento()?.getItem(chave);
    if (!bruto) return null;
    const dados = JSON.parse(bruto) as SessaoCeva;
    if (!dados?.token || (dados.user?.perfil !== 'administrador' && dados.user?.perfil !== 'analista')) return null;
    return dados;
  } catch {
    return null;
  }
}

export function gravarSessaoPortal(chave: string, sessao: SessaoCeva): void {
  armazenamento()?.setItem(chave, JSON.stringify(sessao));
}

export function limparSessaoPortal(chave = CHAVE): void {
  armazenamento()?.removeItem(chave);
}

export function cabecalhosPortal(chave = CHAVE): Record<string, string> {
  const sessao = lerSessaoPortal(chave);
  return sessao ? { Authorization: `Bearer ${sessao.token}` } : {};
}

export function sairDoPortal(chave = CHAVE, evento = EVENTO): void {
  limparSessaoPortal(chave);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(evento));
}

export function lerSessaoCeva(): SessaoCeva | null {
  return lerSessaoPortal(CHAVE);
}

export function gravarSessaoCeva(sessao: SessaoCeva): void {
  gravarSessaoPortal(CHAVE, sessao);
}

export function limparSessaoCeva(): void {
  limparSessaoPortal(CHAVE);
}

export function cabecalhosCeva(): Record<string, string> {
  return cabecalhosPortal(CHAVE);
}

export function sairDoPortalCeva(): void {
  sairDoPortal(CHAVE, EVENTO);
}
