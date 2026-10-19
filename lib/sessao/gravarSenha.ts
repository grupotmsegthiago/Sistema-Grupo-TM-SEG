/**
 * Grava a senha nova. Prefere o hash versionado e apaga o texto.
 * Se a coluna password_hash ainda não existir, mantém o texto para a troca não travar o funcionário.
 */
import { gerarHashVersionado } from '../gestorFiscal/ponteAuth/hashSenha';

type Resultado = { error: { message?: string } | null };

export interface ClienteSenha {
  from(tabela: string): {
    update(valores: Record<string, unknown>): {
      eq(coluna: string, valor: string): PromiseLike<Resultado>;
    };
  };
}

export async function gravarSenhaNoServidor(
  cliente: ClienteSenha,
  usuarioId: string,
  senha: string,
  extras: Record<string, unknown> = {},
): Promise<'hash' | 'texto'> {
  const hash = gerarHashVersionado(senha);
  const comHash = await cliente.from('system_users').update({
    password_hash: hash,
    password: null,
    ...extras,
  }).eq('id', usuarioId);
  if (!comHash.error) return 'hash';
  const texto = await cliente.from('system_users').update({
    password: senha,
    ...extras,
  }).eq('id', usuarioId);
  if (texto.error) throw new Error(texto.error.message || 'Falha ao gravar a senha.');
  return 'texto';
}
