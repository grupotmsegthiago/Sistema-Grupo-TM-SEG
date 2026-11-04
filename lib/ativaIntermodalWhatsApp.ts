import { fornecedorAtiva, isVeladaMission } from './liveTrack/isVeladaMission';

/** Agente e cliente: toda velada. Parceiro ATIVA: só velada com fornecedor ATIVA e cliente Intermodal. */
export function botoesWhatsAppDaOs(input: {
  client?: string | null;
  provider?: string | null;
  mission_type?: string | null;
  missionType?: string | null;
} | null | undefined): { agente: boolean; cliente: boolean; parceiro: boolean } {
  const velada = isVeladaMission(input);
  return {
    agente: velada,
    cliente: velada,
    parceiro: mensagensAtivaIntermodal(input),
  };
}

export function mensagensAtivaIntermodal(input: {
  client?: string | null;
  provider?: string | null;
  mission_type?: string | null;
  missionType?: string | null;
} | null | undefined): boolean {
  if (!input) return false;
  return isVeladaMission(input) && fornecedorAtiva(input.provider) && /intermodal/i.test(String(input.client || ''));
}

export type TextoAtivaIntermodal = {
  os: string;
  cliente: string;
  origem: string;
  destino: string;
  motorista: string;
  agente: string;
  viatura: string;
  linkAgente: string;
  linkCliente: string;
};

function pessoaDaMissao(motorista: string, agente: string): string {
  const m = String(motorista || '').trim();
  const a = String(agente || '').trim();
  if (m && a && m.toLowerCase() !== a.toLowerCase()) return `${m} / ${a}`;
  return m || a || 'N/A';
}

export function textoParceiroAtiva(d: TextoAtivaIntermodal): string {
  return `🟢 *TMSEG | ORDEM DE MISSÃO - PARCEIRO ATIVA*

Prezado parceiro ATIVA, segue o direcionamento operacional para a missão de hoje:

📍 *Origem:* ${d.origem || 'N/A'}
🏁 *Destino:* ${d.destino || 'N/A'}
🚗 *Viatura:* ${d.viatura || 'N/A'}

⚠️ *Instrução Operacional:* Por favor, encaminhe o link abaixo para o agente em campo realizar o check-in, ativar a transmissão da posição GPS e iniciar o monitoramento em tempo real com a nossa central:

🔗 *Painel de Ativação (Agente):*
${d.linkAgente}

*Certifique-se de que o dispositivo esteja com a geolocalização ativada durante todo o percurso.*`;
}

export function textoAgenteAtiva(d: TextoAtivaIntermodal): string {
  return `🟢 *TM SEG | ORDEM DE MISSÃO - CAMPO*

Olá, ${d.agente || 'agente'}. Você foi escalado para a escolta/operação de hoje.

📍 *Origem:* ${d.origem || 'N/A'}
🏁 *Destino:* ${d.destino || 'N/A'}
🚗 *Viatura:* ${d.viatura || 'N/A'}

⚠️ *Instrução:* Acesse o link abaixo para registrar sua posição e ativar a transmissão em tempo real para a central:

🔗 *Acesse o Painel do Agente:*
${d.linkAgente}

*Mantenha a localização do telemóvel ativada durante todo o trajeto.*`;
}

export function textoClienteAtiva(d: TextoAtivaIntermodal): string {
  return `🔷 *TM SEG | MONITORAMENTO EM TEMPO REAL*

Prezado cliente, sua operação já se encontra em preparação/andamento sob nossa supervisão.

📋 *DADOS DA MISSÃO:*
• *OS:* ${d.os || 'N/A'}
• *Cliente:* ${d.cliente || 'N/A'}
• *Origem:* ${d.origem || 'N/A'}
• *Destino:* ${d.destino || 'N/A'}
• *Motorista / Agente:* ${pessoaDaMissao(d.motorista, d.agente)}
• *Veículo Escoltado / Viatura:* ${d.viatura || 'N/A'}

Você pode acompanhar o deslocamento da carga, o mapa em tempo real e a linha do tempo detalhada da viagem através do link seguro abaixo:

🗺️ *Acessar Rastreamento ao Vivo:*
${d.linkCliente}

⏱️ *Status Atual:* Aguardando sinal do agente / Trânsito monitorado

*Este link atualiza automaticamente em tempo real sem necessidade de atualizar a página.*`;
}
