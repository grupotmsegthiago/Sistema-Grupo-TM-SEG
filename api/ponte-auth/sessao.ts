import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { criarHandlerSessao } = require('./_sessao.cjs') as {
  criarHandlerSessao: (acao: 'sessao') => (req: unknown, res: unknown) => Promise<void>;
};

export default criarHandlerSessao('sessao');
