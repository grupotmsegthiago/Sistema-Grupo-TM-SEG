/**
 * Relatório WhatsApp de monitoramento para clientes NÃO-DHL.
 * O template DHL (*ESCOLTA ARMADA*) permanece inline em UpdateMissionModal e MissionTable.
 */
export type MonitoringWhatsAppReportInput = {
  osId: string;
  status: string;
  dateStr: string;
  timeStr: string;
  operationType?: string;
  client: string;
  origin: string;
  destination: string;
  vehiclePlate?: string;
  vehicleModel?: string;
  driverName?: string;
  driverPhone?: string;
  escortVehicle?: string;
  agent1?: string;
  agent2?: string;
  progress: number;
  occurrence?: string;
  locationCity?: string;
  mapLink?: string;
};

/** Nome curto para relatório (primeiro + último sobrenome). */
export function formatAgentShortName(name?: string): string {
  if (!name || name === '---' || name === '') return 'N/A';
  const parts = name.trim().split(' ');
  return parts.length > 2
    ? `${parts[0]} ${parts[parts.length - 1]}`.toUpperCase()
    : name.toUpperCase();
}

/** Quantidade de quadrados e percentual de cada um. */
const PROGRESS_SQUARE_COUNT = 4;
const PROGRESS_STEP_PERCENT = 100 / PROGRESS_SQUARE_COUNT;

/**
 * Tom do quadrado preenchido conforme a quantidade (verde claro → verde escuro).
 * WhatsApp só oferece 🟢 (verde limão) e 🟩 (quadrado verde escuro) — sem coração.
 */
const FILL_GREEN_TONE_BY_COUNT = ['', '🟢', '🟢', '🟩', '🟩'] as const;
const EMPTY_PROGRESS_SQUARE = '⬜';

/** Barra visual de progresso: verde claro no início, escurecendo até 100%. */
export function formatProgressSquares(progress: number): string {
  const percent = Math.min(100, Math.max(0, Math.floor(progress)));
  const filled =
    percent === 0 ? 0 : Math.min(PROGRESS_SQUARE_COUNT, Math.ceil(percent / PROGRESS_STEP_PERCENT));
  if (filled === 0) {
    return `${EMPTY_PROGRESS_SQUARE.repeat(PROGRESS_SQUARE_COUNT)} ${percent}%`;
  }
  const tone = FILL_GREEN_TONE_BY_COUNT[filled];
  const squares =
    tone.repeat(filled) + EMPTY_PROGRESS_SQUARE.repeat(PROGRESS_SQUARE_COUNT - filled);
  return `${squares} ${percent}%`;
}

export function stripDestinationToDefine(destination: string): string {
  return destination.replace(/\s*[—-]\s*DESTINO\s+A\s+DEFINIR\s*$/i, '').trim();
}

/** Extrai ocorrência e cidade do campo currentLocation (formato "OCORRÊNCIA|endereço"). */
export function parseMonitoringLocation(currentLocation?: string): { occurrence: string; city: string } {
  const fullLocationRaw = (currentLocation || '').trim() || 'AGUARDANDO INÍCIO';
  const locationParts = fullLocationRaw.split('|');
  const occurrence = locationParts[0].trim();
  const addressPart = locationParts.length > 1 ? locationParts[1].trim() : locationParts[0].trim();
  const citySplit = addressPart.split('-');
  const city =
    citySplit.length > 1
      ? `${citySplit[citySplit.length - 2].split(',').pop()?.trim() || ''} - ${citySplit[citySplit.length - 1].trim()}`
      : addressPart;
  return { occurrence, city };
}

/** Monta cidade a partir do nome de localização (currentLocationName no modal). */
export function parseMonitoringCityFromLocationName(locationName?: string): string {
  if (!locationName?.trim()) return 'S/D';
  const cityParts = locationName.split('-');
  if (cityParts.length > 1) {
    const city = cityParts[cityParts.length - 2].split(',').pop()?.trim();
    return `${city || ''} - ${cityParts[cityParts.length - 1].trim()}`.trim();
  }
  return locationName.trim();
}

export function buildMonitoringWhatsAppReport(input: MonitoringWhatsAppReportInput): string {
  const destination = stripDestinationToDefine(input.destination) || 'N/A';

  return `*MONITORAMENTO GRUPO TMSEG*
*OS:* ${input.osId} | *STATUS:* ${input.status.toUpperCase()}

🗓️ *DATA:* ${input.dateStr} *HORA:* ${input.timeStr}
🛡️ *OPERAÇÃO:* ${(input.operationType || 'CARACTERIZADA').toUpperCase()}
🏢 *CLIENTE:* ${input.client}

📍 *ORIGEM:* ${input.origin.toUpperCase()}
🏁 *DESTINO:* ${destination.toUpperCase()}

🚛 *VEÍCULO:* ${input.vehiclePlate || 'N/A'} (${input.vehicleModel || 'N/D'})
👤 *MOTORISTA:* ${formatAgentShortName(input.driverName)}
📞 *CONTATO:* ${input.driverPhone || 'N/A'}

🚔 *VIATURA:* ${input.escortVehicle || 'N/A'}
👮 *AGENTE 01:* ${formatAgentShortName(input.agent1)}
👮 *AGENTE 02:* ${formatAgentShortName(input.agent2)}

📈*PROGRESSO DA MISSÃO:* ${formatProgressSquares(input.progress)}

🏙️ *LOCALIZAÇÃO:* ${(input.locationCity || 'S/D').toUpperCase()}
🗾 *LINK DO GOOGLE:* ${input.mapLink || 'N/A'}

📣 *OCORRÊNCIA:* ${(input.occurrence || 'SEM INFORMAÇÃO').toUpperCase()}`;
}
