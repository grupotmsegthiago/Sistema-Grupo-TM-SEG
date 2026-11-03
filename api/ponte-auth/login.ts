import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// Bundle gerado no build. Import TS sem extensão quebra na Vercel (ERR_MODULE_NOT_FOUND).
const { criarHandlerSessao } = require('./_sessao.cjs') as {
  criarHandlerSessao: (acao: 'login') => (req: unknown, res: unknown) => Promise<void>;
};

/** Login no servidor. Não compara senha no navegador e não emite o token antigo. */
export default criarHandlerSessao('login');
