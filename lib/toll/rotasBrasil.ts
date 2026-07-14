/**
 * Link e instruções do Rotas Brasil para cálculo de pedágio na OS.
 * Abrimos só a home do site (sem query de origem/destino): URLs com ?pontos=
 * têm gerado ERR_CERT_COMMON_NAME_INVALID em alguns navegadores.
 */

const ROTAS_BRASIL_BASE = 'https://www.rotasbrasil.com.br/';

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
  'Inclua o valor do pedágio na SM (mesmo valor no cliente e no fornecedor).',
] as const;
