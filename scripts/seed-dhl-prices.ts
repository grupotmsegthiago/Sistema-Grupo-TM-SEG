/**
 * Seed das tabelas de preço do contrato DHL.
 * - Adiciona coluna price_per_preservation_hour (idempotente)
 * - Apaga todas as tabelas de preço de clientes contendo "DHL" no nome
 * - Insere ~270 entradas do contrato (genéricas por estado + rotas específicas)
 *
 * Uso: npx tsx scripts/seed-dhl-prices.ts
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const SB_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SB_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  '';

if (!SB_URL || !SB_KEY) {
  console.error('[Seed DHL] SUPABASE_URL / KEY ausentes no ambiente.');
  process.exit(1);
}

const sb = createClient(SB_URL, SB_KEY);

const CLIENT_NAME = 'DHL SUPPLY CHAIN (BRAZIL) LTDA';
const REGION = 'NÍVEL BRASIL';
const TXT_PATH = path.join(
  'attached_assets',
  'Pasted-ORIGEM-DESTINO-FRANQUIA-KM-FRANQUIA-H-VALOR-FRANQUIA-VA_1779149774569.txt'
);

function parseBrl(s: string): number {
  let clean = (s || '').replace(/\s/g, '');
  if (clean.includes(',') && clean.includes('.')) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else {
    clean = clean.replace(',', '.');
  }
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}
function hmsToHours(s: string): number {
  const [h, m, sec] = s.split(':').map((x) => parseInt(x, 10) || 0);
  return h + m / 60 + sec / 3600;
}

interface Row {
  client: string;
  operation_type: string;
  activation_fee: number;
  franchise_hours: number;
  franchise_km: number;
  price_per_extra_km: number;
  price_per_extra_hour: number;
  price_per_preservation_hour: number;
}

function parseFile(): Row[] {
  const raw = fs.readFileSync(TXT_PATH, 'utf8');
  const lines = raw.split(/\r?\n/);
  const skip = /^(\s*$|Docusign Envelope|Instrumento previamente|DHL LEGAL|ORIGEM\/DESTINO|ORIGEM DESTINO)/i;

  // Costura linhas que se quebraram no meio (ex.: "R$ 145,00 R$\n152,25")
  const stitched: string[] = [];
  let buf = '';
  for (const ln of lines) {
    if (skip.test(ln)) continue;
    const piece = ln.trim();
    if (!piece) continue;
    buf = buf ? buf + ' ' + piece : piece;
    const rs = (buf.match(/R\$/g) || []).length;
    // uma entrada completa tem 3 ocorrências de R$
    if (rs >= 3 && /R\$\s*[\d.,]+\s*$/.test(buf)) {
      stitched.push(buf);
      buf = '';
    }
  }
  if (buf.trim()) stitched.push(buf);

  const re =
    /^(.+?)\s+(\d+)\s*KM\s+(\d+:\d{2}:\d{2})\s+R\$\s*([\d.,]+)\s+R\$\s*([\d.,]+)\s+R\$\s*([\d.,]+)\s*$/i;

  const rows: Row[] = [];
  const seen = new Set<string>();
  for (const ln of stitched) {
    const m = ln.match(re);
    if (!m) {
      console.warn('[Seed DHL] linha ignorada:', ln);
      continue;
    }
    const desc = m[1].replace(/\s+/g, ' ').trim().toUpperCase();
    const km = parseInt(m[2], 10);
    const hh = hmsToHours(m[3]);
    const franquia = parseBrl(m[4]);
    const hora = parseBrl(m[5]);
    const preserv = parseBrl(m[6]);
    const opType = `${REGION} - ${desc}`;
    const key = opType + '|' + km;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      client: CLIENT_NAME,
      operation_type: opType,
      activation_fee: franquia,
      franchise_hours: hh,
      franchise_km: km,
      price_per_extra_km: 0,
      price_per_extra_hour: hora,
      price_per_preservation_hour: preserv,
    });
  }
  return rows;
}

async function ensureColumn() {
  const sqls = [
    `ALTER TABLE client_price_tables ADD COLUMN IF NOT EXISTS price_per_preservation_hour NUMERIC DEFAULT 0;`,
    `NOTIFY pgrst, 'reload schema';`,
  ];
  for (const sql of sqls) {
    const { error } = await sb.rpc('exec_sql' as any, { sql } as any);
    if (error) {
      console.warn(`[Seed DHL] exec_sql aviso (${sql.substring(0, 50)}...):`, error.message);
    }
  }
}

async function main() {
  console.log('[Seed DHL] Iniciando...');
  const rows = parseFile();
  console.log(`[Seed DHL] ${rows.length} entradas analisadas.`);
  if (rows.length === 0) {
    console.error('[Seed DHL] Nenhuma linha parseada — abortando.');
    process.exit(1);
  }

  await ensureColumn();
  // pequena pausa para o schema cache do PostgREST recarregar
  await new Promise((r) => setTimeout(r, 1500));

  // 1) Apagar todas as tabelas de preço do DHL existentes
  const { data: existing, error: selErr } = await sb
    .from('client_price_tables')
    .select('id, client')
    .ilike('client', '%DHL%');
  if (selErr) {
    console.error('[Seed DHL] erro ao listar DHL atuais:', selErr.message);
    process.exit(1);
  }
  console.log(`[Seed DHL] Tabelas DHL existentes: ${existing?.length || 0}`);
  if (existing && existing.length > 0) {
    const { error: delErr } = await sb
      .from('client_price_tables')
      .delete()
      .ilike('client', '%DHL%');
    if (delErr) {
      console.error('[Seed DHL] erro ao apagar:', delErr.message);
      process.exit(1);
    }
    console.log('[Seed DHL] DHL antigas apagadas.');
  }

  // 2) Inserir em lotes
  const batchSize = 100;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await sb.from('client_price_tables').insert(batch);
    if (error) {
      console.error('[Seed DHL] erro inserindo lote:', error.message);
      // se for coluna desconhecida, fallback: insere sem a coluna nova
      if (/price_per_preservation_hour/i.test(error.message)) {
        const fallback = batch.map(({ price_per_preservation_hour, ...rest }) => rest);
        const { error: e2 } = await sb.from('client_price_tables').insert(fallback);
        if (e2) {
          console.error('[Seed DHL] fallback também falhou:', e2.message);
          process.exit(1);
        }
        console.warn('[Seed DHL] lote inserido SEM a coluna preservacao.');
      } else {
        process.exit(1);
      }
    }
    inserted += batch.length;
    console.log(`[Seed DHL] ${inserted}/${rows.length}...`);
  }

  console.log(`[Seed DHL] ✓ Concluído: ${rows.length} tabelas DHL cadastradas.`);
  process.exit(0);
}

main().catch((e) => {
  console.error('[Seed DHL] Falha:', e);
  process.exit(1);
});
