import { createClient } from '@supabase/supabase-js';
import { sendMissionEmailToClient } from './emailService';

const CYCLE_MS = 5 * 60 * 1000;
const MAX_PER_CYCLE = 20;

const PROCESSABLE_STATUSES = [
  'Solicitada',
  'Documentação',
  'Documentacao',
  'Agendada',
  'Origem',
];

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key =
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    '';
  if (!url || !key) return null;
  return createClient(url, key);
}

async function findClientEmail(supabase: any, clientName: string): Promise<string> {
  const { data: byName } = await supabase
    .from('clients')
    .select('operational_email, email, trading_name, name, status')
    .eq('name', clientName);
  let row = byName?.find((c: any) => c.status === 'Ativo') || byName?.[0] || null;
  if (!row) {
    const { data: byTrading } = await supabase
      .from('clients')
      .select('operational_email, email, trading_name, name, status')
      .eq('trading_name', clientName);
    row = byTrading?.find((c: any) => c.status === 'Ativo') || byTrading?.[0] || null;
  }
  if (!row) {
    const { data: byIlike } = await supabase
      .from('clients')
      .select('operational_email, email, trading_name, name, status')
      .ilike('trading_name', clientName);
    row = byIlike?.find((c: any) => c.status === 'Ativo') || byIlike?.[0] || null;
  }
  return (row?.operational_email?.trim() || row?.email?.trim() || '') as string;
}

async function processOne(supabase: any, mission: any): Promise<'sent' | 'skipped' | 'error'> {
  try {
    let clientVehicleLabel = '';
    if (mission.client_vehicle_id) {
      const { data: cv } = await supabase
        .from('client_vehicles')
        .select('plate, model')
        .eq('id', mission.client_vehicle_id)
        .single();
      if (cv?.plate) clientVehicleLabel = cv.model ? `${cv.plate} / ${cv.model}` : cv.plate;
    }
    if (!clientVehicleLabel && mission.client_vehicle && !isNaN(Number(mission.client_vehicle))) {
      const { data: cvFb } = await supabase
        .from('client_vehicles')
        .select('plate, model')
        .eq('id', Number(mission.client_vehicle))
        .single();
      if (cvFb?.plate) clientVehicleLabel = cvFb.model ? `${cvFb.plate} / ${cvFb.model}` : cvFb.plate;
    }

    let escortVehiclePlate = '';
    let trackerInfo = '';
    if (mission.vehicle_id) {
      const { data: veh } = await supabase
        .from('vehicles')
        .select('plate, model, tracker_type, tracker_id')
        .eq('id', mission.vehicle_id)
        .single();
      if (veh?.plate) escortVehiclePlate = veh.model ? `${veh.plate} / ${veh.model}` : veh.plate;
      if (veh && (veh.tracker_type || veh.tracker_id)) {
        trackerInfo = `${veh.tracker_type || '-'} / ID: ${veh.tracker_id || '-'}`;
      }
    }

    const agent1 = mission.agent1 || '';
    const agent2 = mission.agent2 || '';
    const driverName = mission.driver_name || '';
    const driverPhone = mission.driver_phone || '';
    const origin = mission.origin || '';
    const destination = mission.destination || '';

    const missing: string[] = [];
    if (!agent1) missing.push('agent1');
    if (!agent2) missing.push('agent2');
    if (!escortVehiclePlate) missing.push('escortPlate');
    if (!clientVehicleLabel) missing.push('clientVehicle');
    if (!driverName) missing.push('driverName');
    if (!driverPhone) missing.push('driverPhone');
    if (!origin) missing.push('origin');
    if (!destination) missing.push('destination');

    if (missing.length > 0) return 'skipped';

    const clientEmail = await findClientEmail(supabase, mission.client || '');
    if (!clientEmail) {
      console.log(`[Email Queue] Missão ${mission.id} sem e-mail cadastrado para "${mission.client}" — mantém na fila.`);
      return 'skipped';
    }

    const payload = {
      id: mission.id,
      client: mission.client || '',
      provider: mission.provider || '',
      origin,
      destination,
      start_time: mission.start_time || '',
      mission_type: mission.mission_type || 'Caracterizada',
      agent1,
      agent2,
      escort_vehicle_plate: escortVehiclePlate,
      driver_name: driverName,
      driver_phone: driverPhone,
    };

    const result = await sendMissionEmailToClient(
      payload as any,
      clientEmail,
      clientVehicleLabel,
      mission.gr_espelhamento || '',
      trackerInfo,
      'Sistema (Fila)'
    );
    const success = typeof result === 'object' ? (result as any).success : result;
    if (!success) {
      console.log(`[Email Queue] Falha ao enviar e-mail do cliente para missão ${mission.id}.`);
      return 'error';
    }

    const update: any = { email_pending_client: false };
    if (typeof result === 'object' && (result as any).messageId) {
      update.email_message_id = (result as any).messageId;
    }
    await supabase.from('missions').update(update).eq('id', mission.id);
    console.log(`[Email Queue] Enviado e-mail do cliente para missão ${mission.id} → ${clientEmail}.`);
    return 'sent';
  } catch (e: any) {
    console.log(`[Email Queue] erro missão ${mission?.id}: ${e?.message || e}`);
    return 'error';
  }
}

async function runCycle() {
  const supabase = getSupabase();
  if (!supabase) return;

  const { data: pending, error } = await supabase
    .from('missions')
    .select(
      'id, client, provider, origin, destination, start_time, mission_type, status, agent1, agent2, vehicle_id, client_vehicle, client_vehicle_id, driver_name, driver_phone, gr_espelhamento, email_pending_client, email_message_id'
    )
    .eq('email_pending_client', true)
    .is('email_message_id', null)
    .in('status', PROCESSABLE_STATUSES)
    .order('created_at', { ascending: true })
    .limit(MAX_PER_CYCLE);

  if (error) {
    console.log('[Email Queue] erro ao buscar fila:', error.message);
    return;
  }
  if (!pending || pending.length === 0) return;

  let sent = 0, skipped = 0, errors = 0;
  for (const m of pending) {
    const r = await processOne(supabase, m);
    if (r === 'sent') sent++;
    else if (r === 'skipped') skipped++;
    else errors++;
    await new Promise(r => setTimeout(r, 500));
  }
  if (sent > 0 || errors > 0) {
    console.log(`[Email Queue] ciclo concluído — enviadas=${sent} | puladas=${skipped} | erros=${errors}`);
  }
}

let started = false;
let cycleRunning = false;
async function safeCycle() {
  if (cycleRunning) {
    console.log('[Email Queue] ciclo anterior ainda em execução — pulando este disparo.');
    return;
  }
  cycleRunning = true;
  try {
    await runCycle();
  } catch (e: any) {
    console.log('[Email Queue] erro:', e?.message || e);
  } finally {
    cycleRunning = false;
  }
}
export function startClientEmailQueueWorker() {
  if (started) return;
  started = true;
  console.log(`[Email Queue] worker ativo — ciclo a cada ${CYCLE_MS / 60000} min (reprocessa e-mails do cliente pendentes).`);
  setTimeout(safeCycle, 90_000);
  setInterval(safeCycle, CYCLE_MS);
}
