import { findClientEmail, findProviderEmail, getSupabaseAdmin, loadOperationalFallback } from './missionEmailHelpers.js';
import { sendMissionEmailToClient, sendMissionEmailToProvider } from './reexport.js';

export async function handleMissionScheduled(body: Record<string, any>) {
  const { missionId, client, origin, destination, start_time, mission_type, vehiclePlate, senderName } = body;
  if (!missionId || !client) return { status: 400, body: { error: 'Campos missionId e client obrigatórios' } };

  const sb = await getSupabaseAdmin();
  const { data: missionCheck } = await sb.from('missions').select('*').eq('id', missionId).single();
  if (!missionCheck) return { status: 404, body: { error: 'Missão não encontrada' } };

  const missionData = {
    id: missionId,
    client: missionCheck.client || client || '',
    provider: missionCheck.provider || '',
    origin: origin || missionCheck.origin || '',
    destination: destination || missionCheck.destination || '',
    start_time: start_time || missionCheck.start_time || '',
    mission_type: mission_type || missionCheck.mission_type || 'Caracterizada',
  };

  let clientVehicleLabel = '';
  if (missionCheck.client_vehicle_id) {
    const { data: cv } = await sb.from('client_vehicles').select('plate, model').eq('id', missionCheck.client_vehicle_id).single();
    if (cv?.plate) clientVehicleLabel = cv.model ? `${cv.plate} / ${cv.model}` : cv.plate;
  }
  if (!clientVehicleLabel && vehiclePlate && vehiclePlate !== '—') clientVehicleLabel = vehiclePlate;
  if (!clientVehicleLabel) {
    const fallbackVal = missionCheck.client_vehicle || '';
    if (fallbackVal && !isNaN(Number(fallbackVal))) {
      const { data: cvFallback } = await sb.from('client_vehicles').select('plate, model').eq('id', Number(fallbackVal)).single();
      if (cvFallback?.plate) clientVehicleLabel = cvFallback.model ? `${cvFallback.plate} / ${cvFallback.model}` : cvFallback.plate;
    } else if (fallbackVal) {
      clientVehicleLabel = fallbackVal;
    }
  }

  const grEspelhamento = missionCheck.gr_espelhamento || '';
  let trackerInfo = '';
  if (missionCheck.vehicle_id) {
    const { data: veh } = await sb.from('vehicles').select('tracker_type, tracker_id').eq('id', missionCheck.vehicle_id).single();
    if (veh && (veh.tracker_type || veh.tracker_id)) trackerInfo = `${veh.tracker_type || '-'} / ID: ${veh.tracker_id || '-'}`;
  }

  const agent1 = missionCheck.agent1 || '';
  const agent2 = missionCheck.agent2 || '';
  let escortVehiclePlate = '';
  if (missionCheck.vehicle_id) {
    const { data: escVeh } = await sb.from('vehicles').select('plate, model').eq('id', missionCheck.vehicle_id).single();
    if (escVeh?.plate) escortVehiclePlate = escVeh.model ? `${escVeh.plate} / ${escVeh.model}` : escVeh.plate;
  }

  const missingFields: string[] = [];
  if (!agent1) missingFields.push('Agente 01');
  if (!agent2) missingFields.push('Agente 02');
  if (!escortVehiclePlate) missingFields.push('Placa da viatura de escolta');
  if (!clientVehicleLabel || clientVehicleLabel === '—') missingFields.push('Placa do veículo do cliente');
  if (!missionCheck.driver_name) missingFields.push('Nome do motorista');
  if (!missionCheck.driver_phone) missingFields.push('Telefone do motorista');
  if (!missionData.origin) missingFields.push('Origem');
  if (!missionData.destination) missingFields.push('Destino');

  if (missingFields.length > 0) {
    // Sem fila retroativa — só envio na abertura/ação explícita.
    return {
      status: 200,
      body: {
        success: false,
        queued: false,
        message: `E-mail do cliente não enviado — faltam: ${missingFields.join(', ')}. Complete os dados e envie manualmente se necessário.`,
      },
    };
  }

  await sb.from('missions').update({ email_pending_client: false }).eq('id', missionId);
  const { email: clientEmail } = await findClientEmail(sb, missionData.client);
  const enrichedMission = {
    ...missionData,
    agent1,
    agent2,
    escort_vehicle_plate: escortVehiclePlate,
    driver_name: missionCheck.driver_name || '',
    driver_phone: missionCheck.driver_phone || '',
  };

  if (!clientEmail) {
    const fallback = await loadOperationalFallback(sb);
    const alertMission = { ...enrichedMission, _noEmailAlert: true, _alertEntity: 'Cliente', _alertName: missionData.client };
    const result = await sendMissionEmailToClient(alertMission, fallback, clientVehicleLabel, grEspelhamento, trackerInfo, senderName);
    const success = typeof result === 'object' ? result.success : result;
    return { status: 200, body: { success, message: success ? `⚠️ Cliente "${missionData.client}" sem e-mail — notificação enviada para operacional.` : 'Falha ao enviar' } };
  }

  const result = await sendMissionEmailToClient(enrichedMission, clientEmail, clientVehicleLabel, grEspelhamento, trackerInfo, senderName);
  const success = typeof result === 'object' ? result.success : result;
  if (success && typeof result === 'object' && result.messageId) {
    await sb.from('missions').update({ email_message_id: result.messageId }).eq('id', missionId);
  }
  return { status: 200, body: { success, message: success ? 'E-mail de agendamento enviado ao cliente!' : 'Falha ao enviar' } };
}

export async function handleMissionSolicited(body: Record<string, any>) {
  const { missionId, provider, vehiclePlate, origin, destination, start_time, mission_type, driver_name, driver_phone, senderName } = body;
  if (!missionId || !provider) return { status: 400, body: { error: 'Campos missionId e provider obrigatórios' } };

  const sb = await getSupabaseAdmin();
  const { data: missionCheck } = await sb.from('missions').select('*').eq('id', missionId).single();
  if (!missionCheck) return { status: 404, body: { error: 'Missão não encontrada' } };

  const missionData = {
    id: missionId,
    client: missionCheck.client || '',
    provider: missionCheck.provider || provider || '',
    origin: origin || missionCheck.origin || '',
    destination: destination || missionCheck.destination || '',
    start_time: start_time || missionCheck.start_time || '',
    mission_type: mission_type || missionCheck.mission_type || 'Caracterizada',
    driver_name: driver_name || missionCheck.driver_name || '',
    driver_phone: driver_phone || missionCheck.driver_phone || '',
  };

  let cargoVehicleLabel = vehiclePlate || '';
  if (missionCheck.vehicle_id) {
    const { data: veh } = await sb.from('vehicles').select('plate, model').eq('id', missionCheck.vehicle_id).single();
    if (veh) cargoVehicleLabel = veh.model ? `${veh.plate} / ${veh.model}` : veh.plate;
  }
  if (!cargoVehicleLabel) cargoVehicleLabel = missionCheck.client_vehicle || '';

  const missingFields: string[] = [];
  if (!cargoVehicleLabel || cargoVehicleLabel === '—') missingFields.push('Placa do veículo/carga');
  if (!missionData.driver_name) missingFields.push('Nome do motorista');
  if (!missionData.driver_phone) missingFields.push('Telefone do motorista');
  if (!missionData.origin) missingFields.push('Origem');
  if (!missionData.destination) missingFields.push('Destino');

  if (missingFields.length > 0) {
    // Sem fila retroativa — só envio na abertura/ação explícita.
    return {
      status: 200,
      body: {
        success: false,
        queued: false,
        message: `E-mail do fornecedor não enviado — faltam: ${missingFields.join(', ')}. Complete os dados e envie manualmente se necessário.`,
      },
    };
  }

  await sb.from('missions').update({ email_pending_provider: false }).eq('id', missionId);
  const { email: provEmail } = await findProviderEmail(sb, missionData.provider);

  if (!provEmail) {
    const fallback = await loadOperationalFallback(sb);
    const alertMission = { ...missionData, _noEmailAlert: true, _alertEntity: 'Fornecedor', _alertName: missionData.provider };
    const success = await sendMissionEmailToProvider(alertMission, fallback, cargoVehicleLabel, senderName);
    return { status: 200, body: { success, message: success ? `⚠️ Fornecedor "${missionData.provider}" sem e-mail — notificação enviada para operacional.` : 'Falha ao enviar' } };
  }

  const success = await sendMissionEmailToProvider(missionData, provEmail, cargoVehicleLabel, senderName);
  return { status: 200, body: { success, message: success ? 'E-mail de solicitação enviado ao fornecedor!' : 'Falha ao enviar' } };
}
