import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const sb = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!,
);
const CLIENT = 'DHL SUPPLY CHAIN (BRAZIL) LTDA';
const REGION = 'NÍVEL BRASIL';
const TXT_PATH = path.join(
  process.cwd(),
  'attached_assets/Pasted-ORIGEM-DESTINO-FRANQUIA-KM-FRANQUIA-H-VALOR-FRANQUIA-VA_1779149774569.txt',
);

function parseBrl(s: string) {
  let c = s.replace(/[^\d.,-]/g, '');
  if (c.includes(',')) c = c.replace(/\./g, '').replace(',', '.');
  return parseFloat(c) || 0;
}
function hmsToHours(s: string) {
  const [h, m] = s.split(':').map((x) => parseInt(x, 10) || 0);
  return h + m / 60;
}

interface Row {
  operation_type: string;
  activation_fee: number;
  franchise_hours: number;
  franchise_km: number;
  price_per_extra_hour: number;
  price_per_preservation_hour: number;
}

function parseFile(): Row[] {
  const raw = fs.readFileSync(TXT_PATH, 'utf8');
  const lines = raw.split(/\r?\n/);
  const skip = /^(\s*$|Docusign Envelope|Instrumento previamente|DHL LEGAL|ORIGEM\/DESTINO|ORIGEM DESTINO|ADICIONAL PRESERVAÇÃO)/i;
  const stitched: string[] = [];
  let buf = '';
  for (const ln of lines) {
    if (skip.test(ln)) continue;
    const p = ln.trim();
    if (!p) continue;
    buf = buf ? buf + ' ' + p : p;
    const rs = (buf.match(/R\$/g) || []).length;
    if (rs >= 3 && /R\$\s*[\d.,]+\s*$/.test(buf)) {
      stitched.push(buf);
      buf = '';
    }
  }
  if (buf.trim()) stitched.push(buf);

  const re = /^(.+?)\s+(\d+)\s*KM\s+(\d+:\d{2}:\d{2})\s+R\$\s*([\d.,]+)\s+R\$\s*([\d.,]+)\s+R\$\s*([\d.,]+)\s*$/i;
  const rows: Row[] = [];
  const seen = new Set<string>();
  for (const ln of stitched) {
    const m = ln.match(re);
    if (!m) continue;
    const desc = m[1].replace(/\s+/g, ' ').trim().toUpperCase();
    const km = parseInt(m[2], 10);
    const opType = `${REGION} - ${desc}`;
    const key = opType + '|' + km;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      operation_type: opType,
      activation_fee: parseBrl(m[4]),
      franchise_hours: hmsToHours(m[3]),
      franchise_km: km,
      price_per_extra_hour: parseBrl(m[5]),
      price_per_preservation_hour: parseBrl(m[6]),
    });
  }
  return rows;
}

(async () => {
  const rows = parseFile();
  console.log(`Parsed: ${rows.length} linhas`);

  const { data: existing } = await sb
    .from('client_price_tables')
    .select('operation_type, franchise_km')
    .eq('client', CLIENT);
  const existKey = new Set((existing || []).map((r: any) => `${r.operation_type}|${r.franchise_km}`));
  console.log(`Já no DB: ${existKey.size}`);

  let hasPresColumn = true;
  let ins = 0, skip = 0, fail = 0;
  for (const r of rows) {
    const k = `${r.operation_type}|${r.franchise_km}`;
    if (existKey.has(k)) { skip++; continue; }
    const payload: any = {
      client: CLIENT,
      operation_type: r.operation_type,
      activation_fee: r.activation_fee,
      franchise_hours: r.franchise_hours,
      franchise_km: r.franchise_km,
      price_per_extra_km: 0,
      price_per_extra_hour: r.price_per_extra_hour,
    };
    if (hasPresColumn) payload.price_per_preservation_hour = r.price_per_preservation_hour;
    let { error } = await sb.from('client_price_tables').insert(payload);
    if (error && /price_per_preservation_hour/i.test(error.message)) {
      hasPresColumn = false;
      delete payload.price_per_preservation_hour;
      ({ error } = await sb.from('client_price_tables').insert(payload));
    }
    if (error) { fail++; console.error(`erro ${r.operation_type} ${r.franchise_km}:`, error.message); continue; }
    ins++;
  }
  const { count } = await sb.from('client_price_tables').select('id', { count: 'exact', head: true }).eq('client', CLIENT);
  console.log(`Inseridas: ${ins} | já existiam: ${skip} | falhas: ${fail} | total DHL agora: ${count}`);
  if (!hasPresColumn) console.log('AVISO: coluna price_per_preservation_hour ainda não existe no banco — rode o ALTER manualmente.');
})();
