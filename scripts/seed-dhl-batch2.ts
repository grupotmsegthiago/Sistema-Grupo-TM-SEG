import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!);
const CLIENT='DHL SUPPLY CHAIN (BRAZIL) LTDA', REGION='NÍVEL BRASIL', HORA=145, PRES=152.25;

const STD_DIST: [string, number] = ['DISTRIBUIÇÃO', 690];
const STD_RAIO: number[] = [1380, 2070, 2760, 3450]; // 200/300/400/500
const RS_DIST_VAL = 735;
const RS_RAIO: number[] = [1470, 2205, 2940, 3675];
const MG_RAIO: number[] = [1460, 2190, 2920, 3650];

const kmHrs: [number, number][] = [[200,5],[300,7],[400,9],[500,11]];

type Row = { desc: string, km: number, hrs: number, val: number };
const rows: Row[] = [];

// RAIO MT 300/400/500 (complementar)
[1,2,3].forEach(i => rows.push({ desc:'RAIO MT', km:kmHrs[i][0], hrs:kmHrs[i][1], val:STD_RAIO[i] }));

const standardUFs = ['BA','CE','ES','GO','PE','PR','RJ'];
for (const uf of standardUFs) {
  rows.push({ desc:`DISTRIBUIÇÃO ${uf}`, km:100, hrs:3, val:690 });
  kmHrs.forEach((kh,i)=>rows.push({ desc:`RAIO ${uf}`, km:kh[0], hrs:kh[1], val:STD_RAIO[i] }));
}
// MG (raio com valores diferentes)
rows.push({ desc:'DISTRIBUIÇÃO MG', km:100, hrs:3, val:690 });
kmHrs.forEach((kh,i)=>rows.push({ desc:'RAIO MG', km:kh[0], hrs:kh[1], val:MG_RAIO[i] }));
// RS (distribuição e raio diferentes)
rows.push({ desc:'DISTRIBUIÇÃO RS', km:100, hrs:3, val:RS_DIST_VAL });
kmHrs.forEach((kh,i)=>rows.push({ desc:'RAIO RS', km:kh[0], hrs:kh[1], val:RS_RAIO[i] }));
// SC distribuição (final visível na imagem)
rows.push({ desc:'DISTRIBUIÇÃO SC', km:100, hrs:3, val:RS_DIST_VAL });

(async()=>{
  let ins=0, skip=0;
  for (const r of rows) {
    const opType = `${REGION} - ${r.desc}`;
    const { data: existing } = await sb.from('client_price_tables').select('id').eq('client',CLIENT).eq('operation_type',opType).eq('franchise_km',r.km).limit(1);
    if (existing && existing.length>0) { skip++; continue; }
    const row: any = { client:CLIENT, operation_type:opType, activation_fee:r.val, franchise_hours:r.hrs, franchise_km:r.km, price_per_extra_km:0, price_per_extra_hour:HORA };
    let { error } = await sb.from('client_price_tables').insert(row);
    if (error && /price_per_preservation_hour/i.test(error.message)) {
      row.price_per_preservation_hour = PRES;
      ({ error } = await sb.from('client_price_tables').insert(row));
    } else {
      // tenta gravar a preservacao se a coluna existir
      await sb.from('client_price_tables').update({ price_per_preservation_hour: PRES } as any).eq('client',CLIENT).eq('operation_type',opType).eq('franchise_km',r.km);
    }
    if (error) { console.error(`erro ${r.desc} ${r.km}:`, error.message); continue; }
    ins++; console.log(`+ ${opType} ${r.km}km R$${r.val}`);
  }
  const { count } = await sb.from('client_price_tables').select('id',{count:'exact',head:true}).ilike('client','%DHL%');
  console.log(`Inseridas: ${ins}, já existiam: ${skip}, total DHL agora: ${count}`);
})();
