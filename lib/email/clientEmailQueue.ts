import { getSupabaseAdmin } from '../dhl-intake/dhlIntakeSupabase.js';
import { findClientEmail } from './missionEmailHelpers.js';
import { sendMissionEmailToClient } from './missionEmails.js';

const PROCESSABLE_STATUSES = ['Solicitada', 'Documentação', 'Documentacao', 'Agendada', 'Origem'];
const MAX_PER_CYCLE = 20;

async function processOne(sb: any, mission: any): Promise<'sent' | 'skipped' | 'error'> {
  try {
    let clientVehicleLabel = '';
    if (mission.client_vehicle_id) {
      const { data: cv } = await sb.from('client_vehicles').select('plate, model').eq('id', mission.client_vehicle_id).single();
      if (cv?.plate) clientVehicleLabel = cv.model ? `${cv.plate} / ${cv.model}` : cv.plate;
    }
    const { email: clientEmail } = await findClientEmail(sb, mission.client);
    if (!clientEmail) return 'skipped';
    const result = await sendMissionEmailToClient(
      {
        id: mission.id,
        client: mission.client,
        provider: mission.provider || '',
        origin: mission.origin || '',
        destination: mission.destination || '',
        start_time: mission.start_time || '',
        mission_type: mission.mission_type,
        agent1: mission.agent1,
        agent2: mission.agent2,
        driver_name: mission.driver_name,
        driver_phone: mission.driver_phone,
      },
      clientEmail,
      clientVehicleLabel,
      mission.gr_espelhamento || '',
      '',
    );
    if (result.success) {
      await sb.from('missions').update({ email_pending_client: false }).eq('id', mission.id);
      return 'sent';
    }
    return 'error';
  } catch {
    return 'error';
  }
}

export async function runClientEmailQueueCycle(): Promise<void> {
  // DESATIVADO (2026-07-14): fila retroativa estava reenviando e-mails de OS
  // antigas. E-mail do cliente/fornecedor só deve sair na abertura da OS
  // (envio síncrono em /api/email/mission-*). Não reprocessar backlog.
  console.log('[Email Queue Vercel] DESATIVADO — sem envio retroativo. Só abertura de OS.');
  return;
}
