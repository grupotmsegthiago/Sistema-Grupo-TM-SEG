import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { criarHandlerSessao } = require('./_sessao.cjs') as {
  criarHandlerSessao: (acao: 'confirmar') => (req: unknown, res: unknown) => Promise<void>;
};

export default criarHandlerSessao('confirmar');
