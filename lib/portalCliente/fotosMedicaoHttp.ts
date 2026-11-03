import { fotoOrigemDosLogs, montarFotosEvento, type FotoEvento } from './fotosMedicao.js';

type ClientePortal = { name?: string | null; trading_name?: string | null };

export async function lerFotosEvento(input: {
  sb: { from: (tabela: string) => any };
  os: string;
  cliente: ClientePortal | null;
}): Promise<{ status: number; corpo: { error?: string; fotos?: FotoEvento[] } }> {
  const os = String(input.os || '').replace(/\D/g, '');
  if (!/^\d+$/.test(os)) return { status: 400, corpo: { error: 'OS inválida.' } };
  const nomes = [input.cliente?.name, input.cliente?.trading_name]
    .map((nome) => String(nome || '').trim().toUpperCase())
    .filter(Boolean);
  if (!nomes.length) return { status: 503, corpo: { error: 'Cliente do portal não encontrado.' } };

  const missionId = `GTM-${os}`;
  const { data: mission, error } = await input.sb
    .from('missions')
    .select('id, client, end_trip_evidence_url, end_km_evidence_url')
    .eq('id', missionId)
    .maybeSingle();
  if (error) return { status: 500, corpo: { error: 'Não foi possível conferir a OS.' } };
  const dono = String(mission?.client || '').trim().toUpperCase();
  if (!mission || !nomes.includes(dono)) return { status: 404, corpo: { error: 'OS não encontrada neste portal.' } };

  let origem: string | null = null;
  const logs = await input.sb
    .from('system_logs')
    .select('details, created_at')
    .eq('entity', 'MissionEvidence')
    .eq('entity_id', missionId)
    .eq('action_type', 'evidence_upload')
    .order('created_at', { ascending: false })
    .limit(20);
  if (!logs.error) origem = fotoOrigemDosLogs(logs.data || []);

  return {
    status: 200,
    corpo: {
      fotos: montarFotosEvento({
        origem,
        fim: mission.end_trip_evidence_url,
        kmFinal: mission.end_km_evidence_url,
      }),
    },
  };
}
