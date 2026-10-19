/**
 * Empresas emissoras já cadastradas no sistema (cliente e NF).
 * Espelha a lista de components/ClientForm.tsx e lib/nfInvoiceControlApi.ts.
 * Não é tabela nova. CNPJ vazio não cai numa empresa por padrão.
 */

export interface EmpresaFiscal {
  key: string;
  nome: string;
  cnpj: string;
}

export const EMPRESAS_TMSEG: EmpresaFiscal[] = [
  { key: 'TM GESTAO', nome: 'TM GESTÃO', cnpj: '60485843000157' },
  { key: 'TM SEGURANCA', nome: 'TM SEGURANÇA', cnpj: '28804378000167' },
  { key: 'TM SECURITY', nome: 'TM SECURITY', cnpj: '60508931000127' },
];

export const EMPRESA_LABORATORIO: EmpresaFiscal = {
  key: 'LABORATORIO',
  nome: 'EMPRESA FICTÍCIA — LABORATÓRIO',
  cnpj: '00000000000191',
};

export type EmpresaClassificada = string | 'SEM_EMISSORA';

export function classificarEmpresa(nome: string | null | undefined): EmpresaClassificada {
  const u = String(nome || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (!u) return 'SEM_EMISSORA';
  if (u === 'LABORATORIO' || u.includes('FICTIC')) return EMPRESA_LABORATORIO.key;
  if (u.includes('SECURITY')) return 'TM SECURITY';
  if (u.includes('SEGURANCA')) return 'TM SEGURANCA';
  if (u.includes('GESTAO')) return 'TM GESTAO';
  return 'SEM_EMISSORA';
}

export function empresaPorChave(key: string): EmpresaFiscal | null {
  if (key === EMPRESA_LABORATORIO.key) return EMPRESA_LABORATORIO;
  return EMPRESAS_TMSEG.find((e) => e.key === key) || null;
}

export function formatarCnpj(cnpj: string): string {
  const d = String(cnpj || '').replace(/\D/g, '');
  if (d.length !== 14) return cnpj || '—';
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
