/**
 * Grava a senha nova. Prefere o hash versionado e apaga o texto.
 * Se a coluna password_hash ainda não existir, mantém o texto e não exige troca obrigatória, para o funcionário não travar.
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

function colunaAusente(mensagem: string, coluna: string): boolean {
  return new RegExp(coluna, 'i').test(mensagem)
    && /does not exist|n[aã]o existe|schema cache|could not find/i.test(mensagem);
}

export async function gravarSenhaNoServidor(
  cliente: ClienteSenha,
  usuarioId: string,
  senha: string,
  extras: Record<string, unknown> = {},
): Promise<'hash' | 'texto'> {
  const hash = gerarHashVersionado(senha);
  const base: Record<string, unknown> = {
    password_hash: hash,
    password: null,
    ...extras,
  };
  let resultado = await cliente.from('system_users').update(base).eq('id', usuarioId);
  if (resultado.error && colunaAusente(resultado.error.message || '', 'session_epoch')) {
    const semEpoch = { ...base };
    delete semEpoch.session_epoch;
    resultado = await cliente.from('system_users').update(semEpoch).eq('id', usuarioId);
  }
  if (!resultado.error) return 'hash';
  const mensagem = resultado.error.message || '';
  if (!colunaAusente(mensagem, 'password_hash')) {
    throw new Error('Falha ao gravar a senha.');
  }
  const legado: Record<string, unknown> = { password: senha };
  for (const [chave, valor] of Object.entries(extras)) {
    if (chave === 'session_epoch' || chave === 'force_password_change') continue;
    legado[chave] = valor;
  }
  const texto = await cliente.from('system_users').update(legado).eq('id', usuarioId);
  if (texto.error) throw new Error('Falha ao gravar a senha.');
  return 'texto';
}
