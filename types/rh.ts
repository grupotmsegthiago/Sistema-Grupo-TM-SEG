export type RhEmployeeStatus = 'Ativo' | 'Férias' | 'Afastado' | 'Desligado' | 'Experiência';
export type RhContractType = 'CLT' | 'PJ' | 'Temporário' | 'Estagiário' | 'Aprendiz';
export type RhPaymentStatus = 'Pago' | 'Pendente' | 'Cancelado';

export interface RhDepartment {
  id: string;
  name: string;
  code?: string;
  description?: string;
  manager_employee_id?: string;
  cost_center?: string;
  active: boolean;
}

export interface RhPosition {
  id: string;
  name: string;
  department_id?: string;
  description?: string;
  cbo_code?: string;
  base_salary?: number;
  active: boolean;
}

export interface RhEmployee {
  id: string;
  user_id?: string;
  matricula?: string;
  full_name: string;
  cpf?: string;
  rg?: string;
  cnh?: string;
  cnh_category?: string;
  cnh_expiry?: string;
  birth_date?: string;
  marital_status?: string;
  gender?: string;
  nationality?: string;
  birthplace?: string;
  mother_name?: string;
  father_name?: string;
  photo_url?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  zip_code?: string;
  street?: string;
  address_number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  admission_date?: string;
  contract_type?: RhContractType;
  position_id?: string;
  department_id?: string;
  supervisor_employee_id?: string;
  manager_employee_id?: string;
  cost_center?: string;
  status: RhEmployeeStatus;
  shift_type?: 'diurno' | 'noturno' | string;
  requires_timeclock?: boolean;
  face_photo_url?: string | null;
  face_registered_at?: string | null;
  probation_end_date?: string;
  dismissal_date?: string;
  dismissal_reason?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string;
  rh_positions?: RhPosition;
  rh_departments?: RhDepartment;
}

export interface RhSalaryConfig {
  id?: string;
  employee_id: string;
  base_salary: number;
  night_shift_bonus?: number;
  hazard_pay?: number;
  unhealthy_pay?: number;
  overtime_hours?: number;
  overtime_rate_pct?: number;
  transport_voucher?: number;
  meal_voucher?: number;
  food_voucher?: number;
  health_plan?: number;
  dental_plan?: number;
  other_benefits?: number;
  inss_discount?: number;
  irrf_discount?: number;
  fgts_pct?: number;
  alimony?: number;
  other_discounts?: number;
}

export interface RhPayrollCalc {
  grossSalary: number;
  totalBenefits: number;
  totalDiscounts: number;
  inss: number;
  irrf: number;
  fgts: number;
  netSalary: number;
  overtimeValue: number;
}

export interface RhCommissionRule {
  id?: string;
  employee_id: string;
  name: string;
  rule_type: string;
  calc_type: 'fixed' | 'percent';
  fixed_value?: number;
  percent_value?: number;
  min_threshold?: number;
  client_filter?: string;
  service_filter?: string;
  active?: boolean;
}

export interface RhAward {
  id?: string;
  employee_id: string;
  name: string;
  description?: string;
  amount: number;
  award_date: string;
  reason?: string;
  responsible?: string;
  status: RhPaymentStatus;
}

export interface RhBonus {
  id?: string;
  employee_id: string;
  bonus_type: string;
  description?: string;
  amount: number;
  reference_month?: string;
  status: RhPaymentStatus;
}

export interface RhPayrollItem {
  id?: string;
  employee_id: string;
  employee_name?: string;
  position_name?: string;
  base_salary: number;
  commission: number;
  awards: number;
  bonuses: number;
  overtime: number;
  additions: number;
  benefits: number;
  discounts: number;
  absences: number;
  delays: number;
  dsr: number;
  inss: number;
  irrf: number;
  fgts: number;
  net_salary: number;
  total_pay: number;
}

export interface RhTaxBracket {
  tax_type: 'INSS' | 'IRRF';
  bracket_from: number;
  bracket_to?: number;
  rate_pct: number;
  deduction: number;
}
