import { criarHandlerSessao } from '../../lib/sessao/vercel';

/** Login no servidor. Não compara senha no navegador e não emite o token antigo. */
export default criarHandlerSessao('login');
