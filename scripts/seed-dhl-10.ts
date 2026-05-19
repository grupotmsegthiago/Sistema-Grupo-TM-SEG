import { createClient } from '@supabase/supabase-js';
const sb = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!
);

const CLIENT = 'DHL SUPPLY CHAIN (BRAZIL) LTDA';
const REGION = 'NÍVEL BRASIL';
const HORA = 145;
const PRES = 152.25;

// [descrição, km, horas (decimal), valor_franquia]
const data: [string, number, number, number][] = [
  ['DISTRIBUIÇÃO CAPITAIS BRASIL (GENERICO)', 100, 3, 690],
  ['RAIO CAPITAL BRASIL (GENERICO)', 200, 5, 1380],
  ['RAIO CAPITAL BRASIL (GENERICO)', 300, 7, 2070],
  ['RAIO CAPITAL BRASIL (GENERICO)', 400, 9, 2760],
  ['RAIO CAPITAL BRASIL (GENERICO)', 500, 11, 3450],
  ['DISTRIBUIÇÃO DF', 100, 3, 690],
  ['RAIO DF', 200, 5, 1380],
  ['RAIO DF', 300, 7, 2070],
  ['DISTRIBUIÇÃO MT', 100, 3, 690],
  ['RAIO MT', 200, 5, 1380],
];

(async () => {
  const { count: before } = await sb
    .from('client_price_tables')
    .select('id', { count: 'exact', head: true })
    .ilike('client', '%DHL%');
  console.log(`[seed-10] Linhas DHL antes: ${before}`);

  let inserted = 0, skipped = 0;
  for (const [desc, km, hrs, val] of data) {
    const opType = `${REGION} - ${desc}`;
    const { data: existing } = await sb
      .from('client_price_tables')
      .select('id')
      .eq('client', CLIENT)
      .eq('operation_type', opType)
      .eq('franchise_km', km)
      .limit(1);
    if (existing && existing.length > 0) { skipped++; continue; }

    const row: any = {
      client: CLIENT,
      operation_type: opType,
      activation_fee: val,
      franchise_hours: hrs,
      franchise_km: km,
      price_per_extra_km: 0,
      price_per_extra_hour: HORA,
    };
    let { error } = await sb.from('client_price_tables').insert(row);
    if (error && /price_per_preservation_hour/i.test(error.message)) {
      // coluna pode existir; tenta com ela
      row.price_per_preservation_hour = PRES;
      ({ error } = await sb.from('client_price_tables').insert(row));
    } else {
      // tenta também atualizar preservacao se a coluna existir
      const { error: updErr } = await sb
        .from('client_price_tables')
        .update({ price_per_preservation_hour: PRES } as any)
        .eq('client', CLIENT).eq('operation_type', opType).eq('franchise_km', km);
      if (updErr && !/price_per_preservation_hour/i.test(updErr.message)) {
        console.warn('[seed-10] update preservacao falhou:', updErr.message);
      }
    }
    if (error) { console.error(`[seed-10] erro ${desc} ${km}km:`, error.message); continue; }
    inserted++;
    console.log(`[seed-10] + ${opType} ${km}km`);
  }

  const { count: after } = await sb
    .from('client_price_tables')
    .select('id', { count: 'exact', head: true })
    .ilike('client', '%DHL%');
  console.log(`[seed-10] Inseridas: ${inserted}, já existiam: ${skipped}`);
  console.log(`[seed-10] Linhas DHL depois: ${after}`);
  process.exit(0);
})();
