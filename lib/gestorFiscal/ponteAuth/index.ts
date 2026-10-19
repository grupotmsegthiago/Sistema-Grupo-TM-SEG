/**
 * Ponte de autenticação. Desligada, sem rota HTTP e sem banco de produção.
 * O login atual e a SQL de RLS não passam por aqui.
 */
export { FLAG_PONTE_AUTH, ponteAuthHabilitada } from './flag';
export { USUARIOS_FICTICIOS, LIVRO_FICTICIO, copiaUsuarios } from './fixtures';
export { criarPonteIsolada, atenderProducao } from './ponte';
export type { FonteConfiavel, PonteIsolada } from './ponte';
export { criarIntegracaoIsolada, entrarProducao, ROTAS_PREPARADAS, consultarGestorProducao } from './integracao';
export type { IntegracaoIsolada } from './integracao';
