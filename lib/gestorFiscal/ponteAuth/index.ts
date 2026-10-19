/**
 * Fase 1 da ponte de autenticação. Desligada e sem rota.
 * O login atual e a SQL de RLS não passam por aqui.
 */
export { FLAG_PONTE_AUTH, ponteAuthHabilitada } from './flag';
export { USUARIOS_FICTICIOS, LIVRO_FICTICIO, copiaUsuarios } from './fixtures';
export { criarPonteIsolada, atenderProducao } from './ponte';
export type { FonteConfiavel, PonteIsolada } from './ponte';
