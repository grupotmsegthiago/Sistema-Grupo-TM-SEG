/**
 * A ficha vem do servidor. Perfil, permissão e empresa do pedido não autorizam.
 */
import type { AcaoPonte, UsuarioConfiavel } from './tipos';

function tem(usuario: UsuarioConfiavel, permissao: string): boolean {
  return usuario.permissoes.includes(permissao);
}

export function avancado(usuario: UsuarioConfiavel): boolean {
  return usuario.perfil === 'Avançado';
}

export function portal(usuario: UsuarioConfiavel): boolean {
  return usuario.clienteId != null && usuario.clienteId !== '';
}

export function pode(usuario: UsuarioConfiavel, acao: AcaoPonte): boolean {
  if (usuario.status !== 'Ativo') return false;
  if (acao === 'ler_portal') return portal(usuario);
  if (portal(usuario)) return false;
  if (acao === 'ler_os') {
    return tem(usuario, 'missions') || tem(usuario, '*') || (
      usuario.perfil === 'Diretoria' && (tem(usuario, 'gestor-fiscal') || tem(usuario, 'diretoria-faturamento'))
    );
  }
  if (avancado(usuario)) return false;
  if (acao === 'ler_financeiro') {
    return tem(usuario, 'fin-dashboard')
      || tem(usuario, 'finance-group')
      || (usuario.perfil === 'Diretoria' && (tem(usuario, 'gestor-fiscal') || tem(usuario, 'diretoria-faturamento')))
      || (usuario.perfil === 'Financeiro' && tem(usuario, '*'));
  }
  if (acao === 'ler_faturamento') {
    return usuario.perfil === 'Diretoria' && tem(usuario, 'diretoria-faturamento');
  }
  return false;
}

export function empresasVisiveis(usuario: UsuarioConfiavel, empresaInformada: string | null): string[] | null {
  const lista = usuario.empresas.length ? [...usuario.empresas] : ['FX-GESTAO', 'FX-SEG'];
  if (!empresaInformada) return lista;
  if (!lista.includes(empresaInformada)) return null;
  return [empresaInformada];
}
