import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import * as fs from 'fs';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const key =
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  '';

if (!url || !key) {
  console.error('Faltam SUPABASE_URL / SUPABASE_*_KEY no ambiente.');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const TERMS = ['cts', 'padlock', 'morteiro', 'malaga'];

async function main() {
  const { data: providers, error: pErr } = await sb.from('providers').select('name');
  if (pErr) { console.error('Erro providers:', pErr.message); process.exit(1); }
  const provNames = (providers || []).map((p: any) => p.name as string);
  const matchedProviders = provNames.filter(n =>
    TERMS.some(t => (n || '').toLowerCase().includes(t))
  );
  console.log('Fornecedores que casam:', JSON.stringify(matchedProviders));

  const agents: any[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error: aErr } = await sb
      .from('agents')
      .select('*')
      .order('provider')
      .order('name')
      .range(from, from + PAGE - 1);
    if (aErr) { console.error('Erro agents:', aErr.message); process.exit(1); }
    if (!data || data.length === 0) break;
    agents.push(...data);
    if (data.length < PAGE) break;
  }

  const filtered = (agents || []).filter((a: any) => {
    const prov = (a.provider || '').toLowerCase();
    return TERMS.some(t => prov.includes(t));
  });

  console.log('Total agentes encontrados:', filtered.length);
  const byProv: Record<string, number> = {};
  filtered.forEach((a: any) => { byProv[a.provider] = (byProv[a.provider] || 0) + 1; });
  console.log('Por fornecedor:', JSON.stringify(byProv, null, 2));

  const rows = filtered.map((a: any) => ({
    'FORNECEDOR': a.provider || '',
    'NOME': a.name || '',
    'FUNÇÃO': a.role || '',
    'STATUS': a.status || '',
    'CPF': a.cpf || '',
    'RG': a.rg || '',
    'TELEFONE': a.phone || '',
    'CNH': a.cnh || '',
    'VALIDADE CNH': a.cnh_validity || '',
    'CNV': a.cnv || '',
    'VALIDADE CNV': a.cnv_validity || '',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 22 }, { wch: 28 }, { wch: 18 }, { wch: 14 }, { wch: 16 },
    { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Agentes');

  const out = 'dist-reports/agentes-cts-padlock-morteiro-malaga.xlsx';
  fs.mkdirSync('dist-reports', { recursive: true });
  XLSX.writeFile(wb, out);
  console.log('Arquivo gerado:', out);
}

main();
