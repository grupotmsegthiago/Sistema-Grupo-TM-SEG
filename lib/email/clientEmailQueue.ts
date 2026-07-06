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
  const sb = await getSupabaseAdmin();
  const { data: pending } = await sb
    .from('missions')
    .select('*')
    .eq('email_pending_client', true)
    .in('status', PROCESSABLE_STATUSES)
    .order('created_at', { ascending: true })
    .limit(MAX_PER_CYCLE);
  if (!pending?.length) return;
  let sent = 0;
  for (const m of pending) {
    const r = await processOne(sb, m);
    if (r === 'sent') sent++;
    await new Promise(res => setTimeout(res, 500));
  }
  if (sent > 0) console.log(`[Email Queue Vercel] enviadas=${sent}`);
}
