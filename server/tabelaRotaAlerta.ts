import type { Express, Request, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { conferirTabelaRota, type TabelaConferencia } from '../lib/conferenciaTabelaRota';
import { SMTP_FROM, sendMail } from '../lib/email/smtp';

const ALERTA = 'TABLE_ROUTE_MISMATCH';
const DESTINOS = ['thiago@grupotmseg.com.br', 'operacional@grupotmseg.com.br'];

type MissionRow = {
  id: string;
  client?: string | null;
  provider?: string | null;
  origin?: string | null;
  destination?: string | null;
  total_distance?: number | null;
  start_km?: number | null;
  end_km?: number | null;
};

function kmDaOs(row: MissionRow): number | null {
  const start = Number(row.start_km);
  const end = Number(row.end_km);
  if (Number.isFinite(start) && Number.isFinite(end) && start > 0 && end > start) return Math.round(end - start);
  const total = Number(row.total_distance);
  if (Number.isFinite(total) && total > 0) return Math.round(total);
  return null;
}

function mapTabela(row: { id?: string; operation_type?: string | null; franchise_km?: number | null }): TabelaConferencia {
  return {
    id: String(row.id || ''),
    nome: String(row.operation_type || ''),
    franchiseKm: row.franchise_km,
  };
}

export function registerTabelaRotaAlerta(
  app: Express,
  supabase: SupabaseClient,
  requireAuth: any,
  requireRole: (roles: string) => any,
) {
  app.post('/api/tabela-rota-alerta', requireAuth, requireRole('*'), async (req: Request, res: Response) => {
    try {
      const missionId = String(req.body?.missionId || '').trim();
      const lado = req.body?.lado === 'fornecedor' ? 'fornecedor' : req.body?.lado === 'cliente' ? 'cliente' : '';
      const tableId = String(req.body?.tableId || '').trim();
      if (!missionId || missionId.length > 80 || !lado || !tableId) {
        return res.status(400).json({ error: 'OS, lado e tabela são obrigatórios' });
      }

      const missionQuery = await supabase
        .from('missions')
        .select('id, client, provider, origin, destination, total_distance, start_km, end_km')
        .eq('id', missionId)
        .maybeSingle();
      if (missionQuery.error) throw missionQuery.error;
      const mission = missionQuery.data as MissionRow | null;
      if (!mission) return res.status(404).json({ error: 'OS não encontrada' });

      const tabelaQuery = lado === 'cliente'
        ? await supabase.from('client_price_tables').select('id, operation_type, franchise_km, client').eq('client', mission.client || '').limit(1000)
        : await supabase.from('provider_cost_tables').select('id, operation_type, franchise_km, provider').eq('provider', mission.provider || '').limit(1000);
      if (tabelaQuery.error) throw tabelaQuery.error;
      let tabelas = ((tabelaQuery.data || []) as Array<{ id?: string; operation_type?: string | null; franchise_km?: number | null }>).map(mapTabela);
      if (!tabelas.some((item) => item.id === tableId)) {
        const uma = lado === 'cliente'
          ? await supabase.from('client_price_tables').select('id, operation_type, franchise_km').eq('id', tableId).maybeSingle()
          : await supabase.from('provider_cost_tables').select('id, operation_type, franchise_km').eq('id', tableId).maybeSingle();
        if (uma.error) throw uma.error;
        if (uma.data) tabelas = [...tabelas, mapTabela(uma.data as { id?: string; operation_type?: string | null; franchise_km?: number | null })];
      }
      const atual = tabelas.find((item) => item.id === tableId) || null;
      if (!atual) return res.status(404).json({ error: 'Tabela não encontrada' });

      const resultado = conferirTabelaRota(atual, {
        origem: String(mission.origin || ''),
        destino: String(mission.destination || ''),
        km: kmDaOs(mission),
      }, tabelas);
      if (resultado.status !== 'ERRADA') return res.json({ status: resultado.status, recorded: false, emailed: false });

      const criadorQuery = await supabase
        .from('system_logs')
        .select('user_name, created_at')
        .eq('entity', 'Mission')
        .eq('entity_id', missionId)
        .eq('action_type', 'CREATE')
        .order('created_at', { ascending: true })
        .limit(1);
      if (criadorQuery.error) throw criadorQuery.error;
      const criador = String(criadorQuery.data?.[0]?.user_name || '').trim() || 'não identificado';

      const anteriores = await supabase
        .from('system_logs')
        .select('id, details')
        .eq('action_type', ALERTA)
        .eq('entity', 'Mission')
        .eq('entity_id', missionId)
        .limit(50);
      if (anteriores.error) throw anteriores.error;
      const jaExiste = (anteriores.data || []).some((row) => {
        try {
          const detalhe = JSON.parse(String(row.details || '{}'));
          return detalhe.lado === lado && String(detalhe.tableId) === tableId;
        } catch {
          return false;
        }
      });
      if (jaExiste) return res.json({ status: 'ERRADA', recorded: true, emailed: false, duplicate: true });

      const detalhe = {
        lado,
        tableId,
        tabela: atual.nome,
        criador,
        cliente: mission.client || '',
        fornecedor: mission.provider || '',
        origem: mission.origin || '',
        destino: mission.destination || '',
        km: kmDaOs(mission),
        motivos: resultado.motivos,
        sugestaoId: resultado.sugestaoId,
        sugestaoNome: resultado.sugestaoNome,
      };
      const insert = await supabase.from('system_logs').insert([{
        user_name: criador,
        action_type: ALERTA,
        entity: 'Mission',
        entity_id: missionId,
        details: JSON.stringify(detalhe),
      }]);
      if (insert.error) throw insert.error;

      let emailed = false;
      try {
        const assunto = `Tabela errada na OS ${missionId} — ${criador}`;
        const linhas = [
          `${criador} abriu a OS ${missionId} com a tabela errada.`,
          `Lado: ${lado === 'cliente' ? 'preço do cliente' : 'custo do fornecedor'}`,
          `Tabela aplicada: ${atual.nome}`,
          `Cliente: ${mission.client || '—'}`,
          `Fornecedor: ${mission.provider || '—'}`,
          `Origem: ${mission.origin || '—'}`,
          `Destino: ${mission.destination || '—'}`,
          `KM: ${detalhe.km ?? '—'}`,
          ...resultado.motivos,
          resultado.sugestaoNome ? `Tabela que faz mais sentido: ${resultado.sugestaoNome}` : '',
        ].filter(Boolean);
        await sendMail({
          from: SMTP_FROM,
          to: DESTINOS,
          subject: assunto,
          text: linhas.join('\n'),
        });
        emailed = true;
      } catch (mailErr) {
        console.warn('[tabela-rota] falha ao enviar e-mail:', mailErr instanceof Error ? mailErr.message : mailErr);
      }
      res.json({ status: 'ERRADA', recorded: true, emailed });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao registrar a tabela';
      res.status(500).json({ error: message });
    }
  });
}
