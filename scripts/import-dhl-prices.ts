import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
if (!url || !key) { console.error('Faltam SUPABASE_URL/KEY'); process.exit(1); }
const sb = createClient(url, key);

const PDF_TXT = '/tmp/dhl_prices.txt';

function parseMoney(s: string): number {
    return parseFloat(s.replace(/[R$\s.]/g, '').replace(',', '.'));
}
function parseKm(s: string): number {
    const m = s.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
}
function parseHours(s: string): number {
    const m = s.match(/(\d+):(\d+)/);
    if (!m) return 0;
    return parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
}

interface Row {
    operation_type: string;
    franchise_km: number;
    franchise_hours: number;
    activation_fee: number;
    price_per_extra_km: number;
    price_per_extra_hour: number;
}

function parsePdfText(): Row[] {
    const raw = readFileSync(PDF_TXT, 'utf8');
    const lines = raw.split('\n');
    const rows: Row[] = [];

    const lineRegex = /^\s{4,}([A-ZÀ-Ú0-9][A-Za-zÀ-Úà-ú0-9\s\-\(\)\/\.]+?)\s{2,}(\d+\s*KM)\s+(\d{1,2}:\d{2}:\d{2})\s+(R\$\s*[\d.,]+)\s+(R\$\s*[\d.,]+)\s+(R\$\s*[\d.,]+)/;

    for (const line of lines) {
        const m = line.match(lineRegex);
        if (!m) continue;
        const [, name, kmStr, hStr, franqStr, horaAdStr, preservStr] = m;
        const cleanName = name.trim().replace(/\s+/g, ' ');
        rows.push({
            operation_type: cleanName,
            franchise_km: parseKm(kmStr),
            franchise_hours: parseHours(hStr),
            activation_fee: parseMoney(franqStr),
            price_per_extra_km: 0,
            price_per_extra_hour: parseMoney(horaAdStr),
        });
    }
    return rows;
}

async function main() {
    const dryRun = process.argv.includes('--dry');
    const rows = parsePdfText();
    console.log(`Linhas extraídas do PDF: ${rows.length}\n`);

    if (rows.length === 0) {
        console.error('Nenhuma linha extraída — verifique o regex.');
        process.exit(1);
    }

    console.log('Primeiras 5 linhas (preview):');
    rows.slice(0, 5).forEach(r => console.log(`  ${r.operation_type} | ${r.franchise_km}km | ${r.franchise_hours.toFixed(2)}h | R$${r.activation_fee.toFixed(2)} | hora+R$${r.price_per_extra_hour.toFixed(2)}`));
    console.log('\nÚltimas 5 linhas (preview):');
    rows.slice(-5).forEach(r => console.log(`  ${r.operation_type} | ${r.franchise_km}km | ${r.franchise_hours.toFixed(2)}h | R$${r.activation_fee.toFixed(2)} | hora+R$${r.price_per_extra_hour.toFixed(2)}`));

    const { data: clients } = await sb.from('clients').select('id, name').ilike('name', '%DHL%');
    console.log('\nClientes DHL encontrados no sistema:');
    (clients || []).forEach(c => console.log(`  - "${c.name}"`));

    const target = (clients || []).find(c => /SUPPLY\s*CHAIN/i.test(c.name)) || (clients || [])[0];
    if (!target) { console.error('Nenhum cliente DHL encontrado.'); process.exit(1); }
    console.log(`\nCliente-alvo: "${target.name}"`);

    const { data: existing } = await sb.from('client_price_tables').select('id, operation_type').eq('client', target.name);
    console.log(`Tabelas existentes para ${target.name}: ${existing?.length || 0}`);

    const prefix = 'MALHA DHL — ';
    const rowsToInsert = rows.map(r => ({
        client: target.name,
        operation_type: `${prefix}${r.operation_type} (${r.franchise_km}km)`,
        franchise_km: r.franchise_km,
        franchise_hours: r.franchise_hours,
        activation_fee: r.activation_fee,
        price_per_extra_km: r.price_per_extra_km,
        price_per_extra_hour: r.price_per_extra_hour,
    }));

    const existingNames = new Set((existing || []).map(e => e.operation_type));
    const toInsert = rowsToInsert.filter(r => !existingNames.has(r.operation_type));
    const skipped = rowsToInsert.length - toInsert.length;

    console.log(`\nNovas para inserir: ${toInsert.length}  |  Já existentes (puladas): ${skipped}\n`);

    if (dryRun) {
        console.log('DRY RUN — nada foi inserido. Re-execute sem --dry para aplicar.');
        return;
    }

    const chunkSize = 50;
    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += chunkSize) {
        const chunk = toInsert.slice(i, i + chunkSize);
        const { error, data } = await sb.from('client_price_tables').insert(chunk).select('id');
        if (error) {
            console.error(`Erro no chunk ${i / chunkSize + 1}:`, error.message);
            process.exit(1);
        }
        inserted += (data || []).length;
        console.log(`Chunk ${i / chunkSize + 1}: +${data?.length || 0} (total: ${inserted})`);
    }
    console.log(`\nTotal inserido: ${inserted}`);
}

main().catch(e => { console.error(e); process.exit(1); });
