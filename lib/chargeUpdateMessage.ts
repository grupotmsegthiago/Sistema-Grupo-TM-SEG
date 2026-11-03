import { formatAgentShortName } from './monitoringWhatsAppReport';

export type ChargeUpdateMessageInput = {
  osId: string;
  origin?: string;
  destination?: string;
  plate?: string;
  agent1?: string;
  agent2?: string;
  agent1Phone?: string;
  agent2Phone?: string;
};

/** (DDD)número. O 55 só sai quando é código do país, não o DDD do Rio Grande do Sul. */
export function formatPhoneDddNumber(phone?: string): string {
  let digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 12) digits = digits.slice(2);
  if (digits.length < 3) return '';
  return `(${digits.slice(0, 2)})${digits.slice(2)}`;
}

function mentionAgent(name?: string, phone?: string): string | null {
  const short = formatAgentShortName(name);
  if (short === 'N/A') return null;
  const phoneLabel = formatPhoneDddNumber(phone);
  return phoneLabel ? `*${short}* @${phoneLabel}` : `*${short}*`;
}

/** Texto para colar no grupo e cobrar atualização da equipe. Asterisco = negrito do WhatsApp. */
export function buildChargeUpdateMessage(input: ChargeUpdateMessageInput): string {
  const team = [mentionAgent(input.agent1, input.agent1Phone), mentionAgent(input.agent2, input.agent2Phone)].filter(Boolean);
  const teamText = team.length ? team.join(' e ') : 'de escolta';
  const plate = (input.plate || '').trim().toUpperCase() || 'NÃO INFORMADA';
  const origin = (input.origin || '').trim() || 'NÃO INFORMADA';
  const destination = (input.destination || '').trim() || 'NÃO INFORMADO';
  const os = (input.osId || '').trim() || 'N/A';

  return [
    '📋 *SOLICITAÇÃO DE ATUALIZAÇÃO*',
    '',
    `🚨 *ATENÇÃO* equipe ${teamText}, que esta escoltando o veículo *${plate}*`,
    '',
    `📍 *ORIGEM:* ${origin}`,
    `🏁 *DESTINO:* ${destination}`,
    '',
    `Solicitamos atualização da missão da OS *${os}*, favor encaminhar:`,
    '',
    '📍 *LOCALIZAÇÃO FIXA:*',
    '📸 *FOTO* normal sem logotipo ou timestamp.',
    '🚦 *SITUAÇÃO DA VIAGEM:*',
    '',
    '⏰ *LEMBRANDO QUE, A PRÓXIMA ATUALIZAÇÃO É DAQUI 01 HORA*',
  ].join('\n');
}
