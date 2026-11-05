import { digitosCnpj, cnpjValido14 } from './cnpj';
import type { PartnerProspectInput, PartnerPfStatus } from './types';

export type CsvImportRow = PartnerProspectInput & { linha: number; erro?: string };

const HEADER_MAP: Record<string, keyof PartnerProspectInput> = {
  cnpj: 'cnpj',
  company_name: 'company_name',
  razao_social: 'company_name',
  razaosocial: 'company_name',
  trade_name: 'trade_name',
  nome_fantasia: 'trade_name',
  nomefantasia: 'trade_name',
  state_uf: 'state_uf',
  uf: 'state_uf',
  estado: 'state_uf',
  city: 'city',
  cidade: 'city',
  email: 'email',
  phone: 'phone',
  telefone: 'phone',
  website: 'website',
  site: 'website',
  contact_name: 'contact_name',
  contato: 'contact_name',
  responsavel: 'contact_name',
  pf_authorization_number: 'pf_authorization_number',
  portaria_pf: 'pf_authorization_number',
  alvara_pf: 'pf_authorization_number',
  pf_status: 'pf_status',
  status_pf: 'pf_status',
  notes: 'notes',
  observacoes: 'notes',
};

/**
 * Parseia CSV (vírgula ou ponto-e-vírgula). Primeira linha = cabeçalho.
 * Linhas inválidas entram com `erro` e não são graváveis.
 */
export function parseProspectCsv(raw: string): CsvImportRow[] {
  const lines = String(raw || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const sep = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
  const headers = splitCsvLine(lines[0], sep).map((h) =>
    h
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, ''),
  );

  const out: CsvImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], sep);
    const row: PartnerProspectInput = { cnpj: '', company_name: '', source: 'csv' };
    headers.forEach((h, idx) => {
      const key = HEADER_MAP[h];
      if (!key) return;
      const val = (cells[idx] || '').trim();
      if (!val) return;
      if (key === 'pf_status') {
        row.pf_status = normalizarPfStatus(val);
      } else if (key === 'state_uf') {
        row.state_uf = val.slice(0, 2).toUpperCase();
      } else if (key === 'cnpj') {
        row.cnpj = digitosCnpj(val);
      } else {
        (row as any)[key] = val;
      }
    });
    row.source = 'csv';
    const linha = i + 1;
    if (!cnpjValido14(row.cnpj)) {
      out.push({ ...row, linha, erro: 'CNPJ inválido (precisa de 14 dígitos)' });
      continue;
    }
    if (!row.company_name?.trim()) {
      out.push({ ...row, linha, erro: 'Razão social obrigatória' });
      continue;
    }
    out.push({ ...row, linha });
  }
  return out;
}

function normalizarPfStatus(v: string): PartnerPfStatus {
  const s = v.toLowerCase().trim();
  if (s === 'regular' || s === 'ok' || s === 'ativa') return 'regular';
  if (s === 'pendente' || s === 'irregular') return 'pendente';
  return 'nao_verificado';
}

function splitCsvLine(line: string, sep: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === sep && !inQuotes) {
      result.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  result.push(cur.trim());
  return result;
}
