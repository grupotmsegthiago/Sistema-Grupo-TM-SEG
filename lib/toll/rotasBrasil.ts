/**
 * Link e instruções do Rotas Brasil para cálculo de pedágio na OS.
 *
 * Usar o apex (sem www): o certificado de www.rotasbrasil.com.br expirou
 * (NET::ERR_CERT_* no Chrome). O domínio sem www está com cert válido.
 */

const ROTAS_BRASIL_BASE = 'https://rotasbrasil.com.br/';

/**
 * Retorna a URL do Rotas Brasil.
 * Origem/destino são ignorados de propósito — o usuário informa no site.
 */
export function buildRotasBrasilUrl(_origin?: string | null, _destination?: string | null): string {
  return ROTAS_BRASIL_BASE;
}

/** Passos exibidos na OS (obrigatório seguir antes de informar o pedágio). */
export const ROTAS_BRASIL_STEPS_PT = [
  'Abra o site do Rotas Brasil (use o link abaixo).',
  'Informe a origem da viagem.',
  'Informe o destino da viagem.',
  'Escolha a rota mais cara (maior valor de pedágio).',
  'Inclua o valor real do pedágio na SM (o sistema detalha cliente e fornecedor).',
] as const;
