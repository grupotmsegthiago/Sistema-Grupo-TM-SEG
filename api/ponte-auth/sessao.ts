import { criarHandlerHttp } from '../../lib/gestorFiscal/ponteAuth/vercelPonte';

/** Validação da sessão. Desligada enquanto a integração HTTP não for liberada no código. */
export default criarHandlerHttp('sessao');
