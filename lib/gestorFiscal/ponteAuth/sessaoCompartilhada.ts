/**
 * Contrato do armazenamento compartilhado da sessão.
 * O processo da Vercel não é o depósito definitivo: a tabela proposta é.
 * Esta fase não abre essa tabela.
 */

export interface RegistroSessaoCompartilhada {
  id: string;
  usuarioId: string;
  tokenHashHex: string;
  csrfHashHex: string;
  criadaEm: number;
  expiraEm: number;
  revogadaEm: number | null;
  ultimaAtividade: number;
}

export interface ArmazenSessaoCompartilhado {
  guardar(registro: RegistroSessaoCompartilhada): Promise<void>;
  buscarPorTokenHash(tokenHashHex: string): Promise<RegistroSessaoCompartilhada | null>;
  revogar(tokenHashHex: string, quando: number): Promise<boolean>;
  tocar(tokenHashHex: string, quando: number): Promise<void>;
  listarDoUsuario(usuarioId: string): Promise<RegistroSessaoCompartilhada[]>;
}

export function sessaoAtiva(registro: RegistroSessaoCompartilhada, agora: number): boolean {
  return registro.revogadaEm == null && registro.expiraEm > agora;
}
