import type { SupabaseClient } from '@supabase/supabase-js';
import type { RhCommissionRule } from '../../types/rh';
import { logRhAudit } from './audit';

export interface MissionCommissionInput {
  missionId: string;
  revenueValue?: number;
  clientName?: string;
  serviceType?: string;
  agentNames?: string[];
}

export interface CommissionCalcResult {
  employeeId: string;
  employeeName: string;
  total: number;
  details: { ruleId: string; ruleName: string; amount: number }[];
  inserted: boolean;
  skipped?: string;
}

function normalizeAgentName(name?: string | null): string {
  if (!name || name === '---' || name === 'N/A') return '';
  return name.trim();
}

function namesMatch(agentName: string, fullName: string): boolean {
  const a = agentName.toLowerCase().replace(/\s+/g, ' ').trim();
  const b = fullName.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!a || !b) return false;
  if (a === b) return true;
  const partsA = a.split(' ').filter(Boolean);
  const partsB = b.split(' ').filter(Boolean);
  if (partsA.length >= 2 && partsB.length >= 2) {
    const shortA = `${partsA[0]} ${partsA[partsA.length - 1]}`;
    const shortB = `${partsB[0]} ${partsB[partsB.length - 1]}`;
    if (shortA === shortB) return true;
  }
  return b.includes(a) || a.includes(b);
}

function ruleMatches(rule: RhCommissionRule, clientName?: string, serviceType?: string): boolean {
  if (rule.client_filter && clientName && !clientName.toLowerCase().includes(String(rule.client_filter).toLowerCase())) {
    return false;
  }
  if (rule.service_filter && serviceType && rule.service_filter !== serviceType) {
    return false;
  }
  return true;
}

function calcRuleAmount(rule: RhCommissionRule, revenueValue: number): number {
  if (rule.calc_type === 'percent') {
    const base = revenueValue;
    if (base >= Number(rule.min_threshold || 0)) {
      return base * (Number(rule.percent_value || 0) / 100);
    }
    return 0;
  }
  return Number(rule.fixed_value || 0);
}

export async function resolveEmployeesFromAgents(
  sb: SupabaseClient,
  agentNames: string[],
): Promise<{ id: string; full_name: string }[]> {
  const agents = [...new Set(agentNames.map(normalizeAgentName).filter(Boolean))];
  if (!agents.length) return [];

  const { data: employees } = await sb.from('rh_employees')
    .select('id, full_name')
    .eq('status', 'Ativo')
    .is('deleted_at', null);

  const matched: { id: string; full_name: string }[] = [];
  for (const agent of agents) {
    const emp = (employees || []).find((e) => namesMatch(agent, e.full_name));
    if (emp && !matched.some((m) => m.id === emp.id)) {
      matched.push(emp);
    }
  }
  return matched;
}

export async function calculateCommissionForEmployee(
  sb: SupabaseClient,
  params: {
    missionId: string;
    employeeId: string;
    employeeName?: string;
    revenueValue?: number;
    clientName?: string;
    serviceType?: string;
    skipAudit?: boolean;
  },
): Promise<CommissionCalcResult> {
  const { missionId, employeeId, employeeName, revenueValue = 0, clientName, serviceType, skipAudit } = params;

  const { data: existing } = await sb.from('rh_commissions')
    .select('id')
    .eq('mission_id', missionId)
    .eq('employee_id', employeeId)
    .is('deleted_at', null)
    .limit(1);

  if (existing?.length) {
    return { employeeId, employeeName: employeeName || '', total: 0, details: [], inserted: false, skipped: 'already_exists' };
  }

  const { data: rules } = await sb.from('rh_commission_rules')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('active', true)
    .is('deleted_at', null);

  let total = 0;
  const details: { ruleId: string; ruleName: string; amount: number }[] = [];

  for (const rule of (rules || []) as RhCommissionRule[]) {
    if (!ruleMatches(rule, clientName, serviceType)) continue;
    const amount = calcRuleAmount(rule, Number(revenueValue || 0));
    if (amount > 0) {
      total += amount;
      details.push({ ruleId: rule.id!, ruleName: rule.name, amount });
    }
  }

  if (total <= 0) {
    return { employeeId, employeeName: employeeName || '', total: 0, details, inserted: false, skipped: 'no_matching_rules' };
  }

  const month = new Date().toISOString().slice(0, 7);
  const { error } = await sb.from('rh_commissions').insert([{
    id: crypto.randomUUID(),
    employee_id: employeeId,
    mission_id: missionId,
    reference_month: month,
    description: `Comissão OS ${missionId}`,
    base_amount: revenueValue || 0,
    commission_amount: total,
    status: 'Pendente',
  }]);
  if (error) throw error;

  if (!skipAudit) {
    void logRhAudit('rh_commissions', missionId, 'auto_calculate', null, { employeeId, total, details });
  }

  return { employeeId, employeeName: employeeName || '', total, details, inserted: true };
}

/** Calcula comissões para agentes vinculados a funcionários RH ao concluir uma OS. */
export async function autoCalculateMissionCommissions(
  sb: SupabaseClient,
  input: MissionCommissionInput,
): Promise<{ ok: boolean; results: CommissionCalcResult[] }> {
  const employees = await resolveEmployeesFromAgents(sb, input.agentNames || []);
  if (!employees.length) {
    return { ok: true, results: [] };
  }

  const results: CommissionCalcResult[] = [];
  for (const emp of employees) {
    try {
      const r = await calculateCommissionForEmployee(sb, {
        missionId: input.missionId,
        employeeId: emp.id,
        employeeName: emp.full_name,
        revenueValue: input.revenueValue,
        clientName: input.clientName,
        serviceType: input.serviceType,
      });
      results.push(r);
    } catch (e: any) {
      console.warn(`[RH Commission] Falha para ${emp.full_name}:`, e?.message);
      results.push({
        employeeId: emp.id,
        employeeName: emp.full_name,
        total: 0,
        details: [],
        inserted: false,
        skipped: e?.message || 'error',
      });
    }
  }
  return { ok: true, results };
}
