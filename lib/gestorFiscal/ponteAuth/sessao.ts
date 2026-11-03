/**
 * Sessão opaca. O segredo aparece uma vez. O servidor guarda só o hash.
 * O token tmseg-token-<id>-<hora> não entra aqui: ele não é verificável.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export interface SessaoGuardada {
  id: string;
  usuarioId: string;
  expiraEm: number;
  revogada: boolean;
  hash: Buffer;
}

export class SessoesMemoria {
  private sessoes: SessaoGuardada[] = [];
  private sequencia = 1;

  emitir(usuarioId: string, agora: number, ttlMs: number): { token: string; expiraEm: number } {
    const id = `ses-${this.sequencia++}`;
    const segredo = randomBytes(32).toString('base64url');
    const token = `ponte.${id}.${segredo}`;
    const expiraEm = agora + ttlMs;
    this.sessoes.push({
      id,
      usuarioId,
      expiraEm,
      revogada: false,
      hash: createHash('sha256').update(token).digest(),
    });
    return { token, expiraEm };
  }

  localizar(token: string): SessaoGuardada | null {
    if (!token.startsWith('ponte.')) return null;
    const hash = createHash('sha256').update(token).digest();
    return this.sessoes.find((sessao) => timingSafeEqual(sessao.hash, hash)) ?? null;
  }

  revogar(token: string): boolean {
    const sessao = this.localizar(token);
    if (!sessao) return false;
    sessao.revogada = true;
    return true;
  }

  /** Só o hash. O segredo do token não volta para o repositório. */
  resumo(): { id: string; usuarioId: string; expiraEm: number; revogada: boolean; hashHex: string }[] {
    return this.sessoes.map((sessao) => ({
      id: sessao.id,
      usuarioId: sessao.usuarioId,
      expiraEm: sessao.expiraEm,
      revogada: sessao.revogada,
      hashHex: sessao.hash.toString('hex'),
    }));
  }
}
