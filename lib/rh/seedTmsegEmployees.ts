/** Planilha TM SEGURANÇA — importação inicial RH (jul/2026). */

export interface TmsegEmployeeSeedRow {
  matricula: string;
  full_name: string;
  admission_date: string | null;
  exp45: string | null;
  exp90: string | null;
  position: string;
  contract_type: 'CLT' | 'PJ' | 'FREE';
  cnpj: string | null;
  salary: number;
  /** Número, null (sem premiação) ou 'variável' */
  premio: number | null | 'variável';
}

export const TMSEG_COMPANY = 'TM SEGURANÇA';

export const TMSEG_EMPLOYEE_SEED: TmsegEmployeeSeedRow[] = [
  { matricula: 'RH001', full_name: 'BÁRBARA SGARLATA', admission_date: '2025-01-08', exp45: '2025-02-22', exp90: '2025-04-08', position: 'SUPERVISOR FINANCEIRO', contract_type: 'PJ', cnpj: null, salary: 2000, premio: 3000 },
  { matricula: 'RH002', full_name: 'DANIEL LUIZ LIMA PINTO', admission_date: '2025-07-01', exp45: '2025-08-15', exp90: '2025-09-29', position: 'COORDENADOR OPERACIONAL', contract_type: 'PJ', cnpj: null, salary: 2500, premio: 2500 },
  { matricula: 'RH003', full_name: 'BEATRIZ DE CARVALHO SIMÕES', admission_date: '2026-01-16', exp45: '2026-03-02', exp90: '2026-04-16', position: 'AUXILIAR OPERACIONAL', contract_type: 'CLT', cnpj: null, salary: 4000, premio: null },
  { matricula: 'RH004', full_name: 'MICHELLE CRISTIANE MONTEIRO', admission_date: '2026-01-30', exp45: '2026-03-16', exp90: '2026-04-30', position: 'AUXILIAR OPERACIONAL', contract_type: 'CLT', cnpj: null, salary: 4000, premio: null },
  { matricula: 'RH005', full_name: 'CRISTIANE AURORA DA SILVA', admission_date: '2026-06-29', exp45: '2026-08-13', exp90: '2026-09-27', position: 'AUXILIAR OPERACIONAL', contract_type: 'CLT', cnpj: null, salary: 2000, premio: 1500 },
  { matricula: 'RH006', full_name: 'FABRÍCIO HONORATO', admission_date: '2026-07-06', exp45: '2026-08-20', exp90: '2026-10-04', position: 'AUXILIAR OPERACIONAL', contract_type: 'CLT', cnpj: null, salary: 2000, premio: 1000 },
  { matricula: 'RH007', full_name: 'BEATRIZ ROCHA MACHADO', admission_date: '2026-05-10', exp45: '2026-06-24', exp90: '2026-08-08', position: 'COORDENADOR ADMINISTRATIVO', contract_type: 'PJ', cnpj: '67.802.600/0001-44', salary: 4000, premio: null },
  { matricula: 'RH008', full_name: 'EULANIA APARECIDA MOREIRA SANTOS', admission_date: null, exp45: null, exp90: null, position: 'SUPORTE OPERACIONAL', contract_type: 'PJ', cnpj: null, salary: 1100, premio: null },
  { matricula: 'RH009', full_name: 'PLINIO ALVES PRADOS DOS SANTOS', admission_date: null, exp45: null, exp90: null, position: 'SUPORTE OPERACIONAL', contract_type: 'PJ', cnpj: null, salary: 3000, premio: null },
  { matricula: 'RH010', full_name: 'MIRIAM ALVES DOS SANTOS', admission_date: '2025-07-22', exp45: '2025-09-05', exp90: '2025-10-20', position: 'AUX. DE LIMPEZA', contract_type: 'FREE', cnpj: null, salary: 2000, premio: null },
  { matricula: 'RH011', full_name: 'THIAGO ARRUDA', admission_date: '2026-05-29', exp45: '2026-07-13', exp90: '2026-08-27', position: 'COMERCIAL RJ', contract_type: 'PJ', cnpj: null, salary: 4000, premio: 'variável' },
  { matricula: 'RH012', full_name: 'GIOVANNA MARSILI ANDRÉ', admission_date: '2026-07-20', exp45: '2026-09-03', exp90: '2026-10-18', position: 'SUPERVISOR FINANCEIRO', contract_type: 'PJ', cnpj: null, salary: 5000, premio: null },
];

export function buildEmployeeNotes(row: TmsegEmployeeSeedRow): string | null {
  const parts: string[] = [`Empresa: ${TMSEG_COMPANY}`];
  if (row.contract_type === 'FREE') parts.push('Modalidade contratual: FREE LANCER');
  if (row.cnpj) parts.push(`CNPJ: ${row.cnpj}`);
  if (row.exp45) parts.push(`Experiência 45d: ${row.exp45}`);
  if (row.exp90) parts.push(`Experiência 90d: ${row.exp90}`);
  return parts.length > 1 ? parts.join(' | ') : parts[0];
}

export function mapContractType(row: TmsegEmployeeSeedRow): string {
  if (row.contract_type === 'FREE') return 'PJ';
  return row.contract_type;
}

export function inferStatus(admissionDate: string | null, today = new Date()): string {
  if (!admissionDate) return 'Ativo';
  const adm = new Date(`${admissionDate}T12:00:00`);
  if (adm > today) return 'Experiência';
  return 'Ativo';
}
