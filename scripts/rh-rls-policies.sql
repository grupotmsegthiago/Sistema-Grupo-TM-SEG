-- Script operacional legado neutralizado após a migração dos consumidores RH.
-- Mantém somente RLS habilitado nas tabelas existentes.
-- Não cria, remove ou restaura policies. Lockdowns e rollbacks devem usar
-- migrations novas, exclusivas e revisadas para cada tabela.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'rh_departments','rh_positions','rh_employees','rh_employee_bank_accounts',
    'rh_employee_documents','rh_employee_dependents','rh_salary_configs',
    'rh_commissions','rh_awards','rh_bonuses','rh_vacation_requests',
    'rh_leave_records','rh_warnings','rh_medical_exams','rh_timeclock',
    'rh_payroll_runs','rh_payroll_items','rh_holidays','rh_benefit_types',
    'rh_employee_benefits','rh_tax_brackets','rh_audit_logs','rh_settings'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;
