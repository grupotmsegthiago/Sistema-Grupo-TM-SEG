/** Link para consulta de pedágio no Rotas Brasil (origem/destino da OS). */

const ROTAS_BRASIL_BASE = 'https://www.rotasbrasil.com.br/';

/**
 * Monta URL do Rotas Brasil. Quando há origem e destino, inclui `pontos`
 * no padrão da API do site (origem;destino) para facilitar o preenchimento.
 */
export function buildRotasBrasilUrl(origin?: string | null, destination?: string | null): string {
  const o = String(origin || '').trim().replace(/\s+/g, ' ');
  const d = String(destination || '')
    .trim()
    .replace(/\s*[—-]\s*DESTINO\s+A\s+DEFINIR\s*$/i, '')
    .replace(/\s+/g, ' ');
  if (!o || !d || /DESTINO\s+A\s+DEFINIR|ACOMPANHAMENTO|RAIO\s/i.test(d)) {
    return ROTAS_BRASIL_BASE;
  }
  const pontos = `${o};${d}`;
  return `${ROTAS_BRASIL_BASE}?pontos=${encodeURIComponent(pontos)}`;
}

export const ROTAS_BRASIL_STEPS_PT = [
  'Abra o site Rotas Brasil (use o link — preferencialmente já com origem e destino da OS).',
  'Confira o endereço de origem preenchido.',
  'Confira o endereço de destino preenchido.',
  'Anote o VALOR do pedágio da rota mais cara (maior valor) — assim não há risco de cobrar a menos.',
  'Inclua esse valor no campo Pedágio da SM e salve.',
] as const;
