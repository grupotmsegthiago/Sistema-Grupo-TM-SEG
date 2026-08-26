import type { Express, Request, Response } from 'express';
import { createSupabaseAdminClient } from './supabaseConfig';
import { calcSalary } from '../lib/rh/payroll';
import { loadEmployeeCostSummary } from '../lib/rh/loadEmployeeCostSummary';
import { calculateCommissionForEmployee } from '../lib/rh/commissionAuto';
import { seedTmsegEmployees } from '../lib/rh/seedTmsegEmployeesRunner';
import { handleRhEmployeeDocumentsRequest } from '../api/rh-employee-documents';
import { handleRhEmployeeBankAccountRequest } from '../api/rh-employee-bank-account';
import type { RhSalaryConfig, RhTaxBracket } from '../types/rh';

function sb() {
  const client = createSupabaseAdminClient();
  if (!client) throw new Error('Supabase admin indisponível');
  return client;
}

async function loadTaxBrackets() {
  const { data } = await sb().from('rh_tax_brackets').select('*').eq('active', true).eq('year', 2026);
  const rows = (data || []) as RhTaxBracket[];
  return {
    inss: rows.filter((r) => r.tax_type === 'INSS'),
    irrf: rows.filter((r) => r.tax_type === 'IRRF'),
  };
}

async function audit(entity: string, entityId: string | null, action: string, req: Request, payload?: unknown) {
  const principal = (req as any).principal;
  await sb().from('rh_audit_logs').insert([{
    entity,
    entity_id: entityId,
    action,
    user_name: principal?.name || 'API',
    user_id: principal?.id || null,
    new_data: payload || null,
  }]);
}

export function registerRhRoutes(
  app: Express,
  requireAuth: (req: Request, res: Response, next: Function) => void,
  requireRole: (...roles: string[]) => (req: Request, res: Response, next: Function) => void,
) {
  const rhAuth = [requireAuth, requireRole('diretoria', 'rh')];

  app.get('/api/rh/health', requireAuth, (_req, res) => {
    res.json({ ok: true, module: 'rh' });
  });

  app.get('/api/rh/employees', ...rhAuth, async (_req: Request, res: Response) => {
    try {
      const { data, error } = await sb()
        .from('rh_employees')
        .select('*, rh_positions(name), rh_departments(name)')
        .is('deleted_at', null)
        .order('full_name');
      if (error) throw error;
      res.json({ ok: true, employees: data || [], total: data?.length || 0 });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.all(
    '/api/rh/employees/documents',
    requireAuth,
    async (req: Request, res: Response) => {
      await handleRhEmployeeDocumentsRequest(req, res);
    },
  );

  app.all(
    '/api/rh/employees/bank-account',
    requireAuth,
    async (req: Request, res: Response) => {
      await handleRhEmployeeBankAccountRequest(req, res);
    },
  );

  app.get('/api/rh/employees/cost-summary', ...rhAuth, async (req: Request, res: Response) => {
    try {
      const month = String(req.query.month || new Date().toISOString().slice(0, 7));
      const result = await loadEmployeeCostSummary(sb(), month);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || 'Falha ao calcular custos' });
    }
  });

  app.post('/api/rh/seed-employees', ...rhAuth, async (_req: Request, res: Response) => {
    try {
      const result = await seedTmsegEmployees(sb());
      res.status(result.ok ? 200 : 207).json(result);
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post('/api/rh/payroll/calculate', ...rhAuth, async (req: Request, res: Response) => {
    try {
      const { employeeId, referenceMonth } = req.body || {};
      if (!employeeId) return res.status(400).json({ error: 'employeeId obrigatório' });

      const { data: salary } = await sb().from('rh_salary_configs')
        .select('*').eq('employee_id', employeeId).is('deleted_at', null)
        .order('effective_from', { ascending: false }).limit(1).maybeSingle();

      if (!salary) return res.status(404).json({ error: 'Configuração salarial não encontrada' });

      const month = referenceMonth || new Date().toISOString().slice(0, 7);
      const [{ data: commissions }, { data: awards }, { data: bonuses }] = await Promise.all([
        sb().from('rh_commissions').select('commission_amount').eq('employee_id', employeeId).eq('reference_month', month).is('deleted_at', null),
        sb().from('rh_awards').select('amount').eq('employee_id', employeeId).is('deleted_at', null),
        sb().from('rh_bonuses').select('amount').eq('employee_id', employeeId).eq('reference_month', month).is('deleted_at', null),
      ]);

      const taxBrackets = await loadTaxBrackets();
      const calc = calcSalary(salary as RhSalaryConfig, taxBrackets);
      const commissionTotal = (commissions || []).reduce((s, c) => s + Number(c.commission_amount || 0), 0);
      const awardsTotal = (awards || []).reduce((s, a) => s + Number(a.amount || 0), 0);
      const bonusesTotal = (bonuses || []).reduce((s, b) => s + Number(b.amount || 0), 0);
      const totalPay = calc.netSalary + commissionTotal + awardsTotal + bonusesTotal;

      res.json({
        ok: true,
        calc,
        commissionTotal,
        awardsTotal,
        bonusesTotal,
        totalPay,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/rh/payroll/generate', ...rhAuth, async (req: Request, res: Response) => {
    try {
      const { referenceMonth } = req.body || {};
      const month = referenceMonth || new Date().toISOString().slice(0, 7);
      const taxBrackets = await loadTaxBrackets();

      const { data: employees } = await sb().from('rh_employees')
        .select('id, full_name, position_id, rh_positions(name)')
        .eq('status', 'Ativo').is('deleted_at', null);

      const { data: run, error: runErr } = await sb().from('rh_payroll_runs').insert([{
        reference_month: month,
        status: 'Gerada',
      }]).select().single();
      if (runErr) throw runErr;

      const items: any[] = [];
      let totalGross = 0;
      let totalNet = 0;

      for (const emp of employees || []) {
        const { data: salary } = await sb().from('rh_salary_configs')
          .select('*').eq('employee_id', emp.id).is('deleted_at', null)
          .order('effective_from', { ascending: false }).limit(1).maybeSingle();
        if (!salary) continue;

        const calc = calcSalary(salary as RhSalaryConfig, taxBrackets);
        const [{ data: commissions }, { data: awards }, { data: bonuses }] = await Promise.all([
          sb().from('rh_commissions').select('commission_amount').eq('employee_id', emp.id).eq('reference_month', month).is('deleted_at', null),
          sb().from('rh_awards').select('amount').eq('employee_id', emp.id).is('deleted_at', null),
          sb().from('rh_bonuses').select('amount').eq('employee_id', emp.id).eq('reference_month', month).is('deleted_at', null),
        ]);

        const commission = (commissions || []).reduce((s, c) => s + Number(c.commission_amount || 0), 0);
        const awardsSum = (awards || []).reduce((s, a) => s + Number(a.amount || 0), 0);
        const bonusesSum = (bonuses || []).reduce((s, b) => s + Number(b.amount || 0), 0);
        const totalPay = calc.netSalary + commission + awardsSum + bonusesSum;

        items.push({
          payroll_run_id: run.id,
          employee_id: emp.id,
          base_salary: salary.base_salary,
          commission,
          awards: awardsSum,
          bonuses: bonusesSum,
          overtime: calc.overtimeValue,
          additions: (salary.night_shift_bonus || 0) + (salary.hazard_pay || 0) + (salary.unhealthy_pay || 0),
          benefits: calc.totalBenefits,
          discounts: calc.totalDiscounts,
          inss: calc.inss,
          irrf: calc.irrf,
          fgts: calc.fgts,
          net_salary: calc.netSalary,
          total_pay: totalPay,
          details_json: { employee_name: emp.full_name, position: (emp as any).rh_positions?.name },
        });

        totalGross += calc.grossSalary + commission + awardsSum + bonusesSum;
        totalNet += totalPay;
      }

      if (items.length) {
        await sb().from('rh_payroll_items').insert(items);
      }
      await sb().from('rh_payroll_runs').update({ total_gross: totalGross, total_net: totalNet }).eq('id', run.id);
      await audit('rh_payroll_runs', run.id, 'generate', req, { month, items: items.length });

      res.json({ ok: true, runId: run.id, items: items.length, totalGross, totalNet });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/rh/commissions/calculate-mission', ...rhAuth, async (req: Request, res: Response) => {
    try {
      const { missionId, employeeId, revenueValue, clientName, serviceType } = req.body || {};
      if (!missionId || !employeeId) return res.status(400).json({ error: 'missionId e employeeId obrigatórios' });

      const result = await calculateCommissionForEmployee(sb(), {
        missionId,
        employeeId,
        revenueValue,
        clientName,
        serviceType,
        skipAudit: true,
      });
      if (result.inserted) {
        await audit('rh_commissions', missionId, 'auto_calculate', req, result.details);
      }

      res.json({ ok: true, total: result.total, details: result.details, inserted: result.inserted, skipped: result.skipped });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/rh/dashboard', requireAuth, async (_req: Request, res: Response) => {
    try {
      const now = new Date();
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const [{ count: total }, { data: byStatus }, { data: byDept }] = await Promise.all([
        sb().from('rh_employees').select('*', { count: 'exact', head: true }).is('deleted_at', null),
        sb().from('rh_employees').select('status').is('deleted_at', null),
        sb().from('rh_employees').select('department_id, rh_departments(name)').is('deleted_at', null),
      ]);

      const statusCount: Record<string, number> = {};
      (byStatus || []).forEach((e: any) => { statusCount[e.status] = (statusCount[e.status] || 0) + 1; });

      const deptCount: Record<string, number> = {};
      (byDept || []).forEach((e: any) => {
        const name = e.rh_departments?.name || 'Sem departamento';
        deptCount[name] = (deptCount[name] || 0) + 1;
      });

      const { data: admissions } = await sb().from('rh_employees')
        .select('id').gte('admission_date', monthStart).is('deleted_at', null);

      res.json({
        ok: true,
        totalEmployees: total || 0,
        activeEmployees: statusCount['Ativo'] || 0,
        onLeave: statusCount['Afastado'] || 0,
        onVacation: statusCount['Férias'] || 0,
        admissionsThisMonth: admissions?.length || 0,
        dismissalsThisMonth: statusCount['Desligado'] || 0,
        byDepartment: deptCount,
        byStatus: statusCount,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/rh/timeclock/punch', requireAuth, async (req: Request, res: Response) => {
    try {
      const { handleTimeclockPunch } = await import('./timeclockPunch');
      await handleTimeclockPunch(req, res);
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post('/api/rh/timeclock/adjust', ...rhAuth, async (req: Request, res: Response) => {
    try {
      const { handleTimeclockAdjust } = await import('./timeclockAdjust');
      await handleTimeclockAdjust(req, res);
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });
}
