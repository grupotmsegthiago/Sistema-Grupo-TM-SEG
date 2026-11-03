/**
 * Repositório só de memória. Não abre rede e não grava produção.
 * A ficha pública não inclui o hash da senha.
 */
import { USUARIOS_FICTICIOS } from './fixtures';
import { conferirSenha, gerarHashSenha } from './senha';
import type { UsuarioConfiavel } from './tipos';

interface Registro extends UsuarioConfiavel {
  email: string;
  senhaHash: string;
}

export interface RepositorioIsolado {
  ler(usuarioId: string): Promise<UsuarioConfiavel | null>;
  conferir(email: string, senha: string): Promise<
    | { tipo: 'ok'; usuario: UsuarioConfiavel }
    | { tipo: 'invalido' }
    | { tipo: 'desativado' }
    | { tipo: 'falha' }
  >;
  substituirPermissoes(usuarioId: string, permissoes: readonly string[]): void;
  definirStatus(usuarioId: string, status: 'Ativo' | 'Inativo'): void;
  simularFalha(ligada: boolean): void;
  producaoAlterada(): boolean;
}

function publico(registro: Registro): UsuarioConfiavel {
  return {
    id: registro.id,
    status: registro.status,
    perfil: registro.perfil,
    permissoes: [...registro.permissoes],
    empresas: [...registro.empresas],
    clienteId: registro.clienteId,
  };
}

function senhaFicticia(id: string): string {
  return `senha-isolada-${id}`;
}

export function senhaDoUsuarioIsolado(id: string): string {
  return senhaFicticia(id);
}

export async function criarRepositorioIsolado(): Promise<RepositorioIsolado> {
  const registros: Registro[] = [];
  const base = [
    ...USUARIOS_FICTICIOS,
    {
      id: 'usr-cadastro',
      status: 'Ativo' as const,
      perfil: 'Operador' as const,
      permissoes: ['clients', 'providers'],
      empresas: ['FX-GESTAO'],
      clienteId: null,
    },
  ];
  for (const usuario of base) {
    registros.push({
      ...usuario,
      permissoes: [...usuario.permissoes],
      empresas: [...usuario.empresas],
      email: `${usuario.id}@isolado.invalid`,
      senhaHash: await gerarHashSenha(senhaFicticia(usuario.id)),
    });
  }
  let falha = false;
  const hashAusente = await gerarHashSenha('ausente-isolado');

  const achar = (usuarioId: string) => registros.find((registro) => registro.id === usuarioId) ?? null;

  return {
    async ler(usuarioId) {
      if (falha) throw new Error('repositorio isolado indisponivel');
      const registro = achar(usuarioId);
      return registro ? publico(registro) : null;
    },
    async conferir(email, senha) {
      if (falha) return { tipo: 'falha' };
      const chave = email.trim().toLowerCase();
      const registro = registros.find((item) => item.email === chave);
      if (!registro) {
        await conferirSenha(senha.trim() || 'vazia', hashAusente);
        return { tipo: 'invalido' };
      }
      const confere = await conferirSenha(senha.trim(), registro.senhaHash);
      if (!confere) return { tipo: 'invalido' };
      if (registro.status !== 'Ativo') return { tipo: 'desativado' };
      return { tipo: 'ok', usuario: publico(registro) };
    },
    substituirPermissoes(usuarioId, permissoes) {
      const registro = achar(usuarioId);
      if (!registro) return;
      registro.permissoes = [...permissoes];
    },
    definirStatus(usuarioId, status) {
      const registro = achar(usuarioId);
      if (!registro) return;
      registro.status = status;
    },
    simularFalha(ligada) {
      falha = ligada;
    },
    producaoAlterada() {
      return false;
    },
  };
}
