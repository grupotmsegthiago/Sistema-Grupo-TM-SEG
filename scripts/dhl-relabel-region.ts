import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!,
);
const CLIENT = 'DHL SUPPLY CHAIN (BRAZIL) LTDA';

const STATE_REGION: Record<string, string> = {
  AC: 'NORTE', AM: 'NORTE', AP: 'NORTE', PA: 'NORTE', RO: 'NORTE', RR: 'NORTE', TO: 'NORTE',
  AL: 'NORDESTE', BA: 'NORDESTE', CE: 'NORDESTE', MA: 'NORDESTE', PB: 'NORDESTE',
  PE: 'NORDESTE', PI: 'NORDESTE', RN: 'NORDESTE', SE: 'NORDESTE',
  DF: 'CENTRO-OESTE', GO: 'CENTRO-OESTE', MT: 'CENTRO-OESTE', MS: 'CENTRO-OESTE',
  ES: 'SUDESTE', MG: 'SUDESTE', RJ: 'SUDESTE', SP: 'SUDESTE',
  PR: 'SUL', SC: 'SUL', RS: 'SUL',
};

const CITY_REGION: Record<string, string> = {
  'BARUERI': 'SUDESTE', 'GUARULHOS': 'SUDESTE', 'CAJAMAR': 'SUDESTE', 'ITAPEVI': 'SUDESTE',
  'LOUVEIRA': 'SUDESTE', 'HORTOLÂNDIA': 'SUDESTE', 'HORTOLANDIA': 'SUDESTE',
  'JUNDIAI': 'SUDESTE', 'JUNDIAÍ': 'SUDESTE', 'PAULINIA': 'SUDESTE', 'PAULÍNIA': 'SUDESTE',
  'PIRACICABA': 'SUDESTE', 'SOROCABA': 'SUDESTE', 'COTIA': 'SUDESTE',
  'NOVA ODESSA': 'SUDESTE', 'SÃO BERNARDO DO CAMPO': 'SUDESTE',
  'RIBEIRÃO PRETO': 'SUDESTE', 'RIBEIRAO PRETO': 'SUDESTE',
  'RIO DE JANEIRO': 'SUDESTE', 'RESENDE': 'SUDESTE',
  'EXTREMA': 'SUDESTE', 'POUSO ALEGRE': 'SUDESTE', 'UBERLÂNDIA': 'SUDESTE', 'UBERLANDIA': 'SUDESTE',
  'SÃO JOÃO DE MERITI': 'SUDESTE', 'SAO JOAO DE MERITI': 'SUDESTE',
  'GOIÂNIA': 'CENTRO-OESTE', 'GOIANIA': 'CENTRO-OESTE',
  'ANÁPOLIS': 'CENTRO-OESTE', 'ANAPOLIS': 'CENTRO-OESTE',
  'APARECIDA DE GOIÂNIA': 'CENTRO-OESTE', 'APARECIDA DE GOIANIA': 'CENTRO-OESTE',
  'ALHANDRA': 'NORDESTE', 'BAYEUX': 'NORDESTE',
  'JABOATÃO DOS GUARARAPES': 'NORDESTE', 'JABOATAO DOS GUARARAPES': 'NORDESTE',
  'SÃO JOSÉ DOS PINHAIS': 'SUL', 'SAO JOSE DOS PINHAIS': 'SUL',
  'QUATRO BARRAS': 'SUL', 'ITAPOÁ': 'SUL', 'ITAPOA': 'SUL',
  'NOVA SANTA RITA': 'SUL', 'PORTO ALEGRE': 'SUL', 'CANOAS': 'SUL',
};

function resolveRegion(desc: string): string {
  const d = desc.trim().toUpperCase();
  // genéricos
  if (/CAPITA(I)?S?\s+BRASIL/.test(d) || /CAPITAL\s+BRASIL/.test(d)) return 'BRASIL';
  // RAIO XX / DISTRIBUIÇÃO XX (sigla de estado de 2 letras no final, possivelmente seguido de parêntese)
  const m = d.match(/^(?:RAIO|DISTRIBUI[ÇC][ÃA]O)\s+([A-Z]{2})(?:\s|$|\()/);
  if (m && STATE_REGION[m[1]]) return STATE_REGION[m[1]];
  // rotas Origem-Destino (cidade-cidade)
  const dash = d.match(/^([^-]+?)-/);
  if (dash) {
    const origin = dash[1].trim();
    if (CITY_REGION[origin]) return CITY_REGION[origin];
  }
  return 'BRASIL';
}

function stripOldPrefix(op: string): string {
  return op.replace(/^N[ÍI]VEL\s+BRASIL\s*-\s*/i, '').replace(/^REGI[ÃA]O\s*-\s*[A-ZÀ-Ú\- ]+?\s*-\s*/i, '').trim();
}

function stripTrailingKm(desc: string): string {
  return desc.replace(/\s+\d+\s*KM\s*$/i, '').trim();
}

(async () => {
  const { data, error } = await sb
    .from('client_price_tables')
    .select('id, operation_type, franchise_km')
    .eq('client', CLIENT);
  if (error) { console.error(error); process.exit(1); }
  console.log(`Linhas DHL: ${data!.length}`);

  let updated = 0, unchanged = 0, unmapped = 0;
  for (const row of data!) {
    const oldOp = row.operation_type as string;
    const km = row.franchise_km as number;
    let desc = stripOldPrefix(oldOp);
    desc = stripTrailingKm(desc);
    const region = resolveRegion(desc);
    if (region === 'BRASIL' && !/CAPITA/.test(desc.toUpperCase())) unmapped++;
    const newOp = `REGIÃO - ${region} - ${desc} ${km}KM`;
    if (newOp === oldOp) { unchanged++; continue; }
    const { error: upErr } = await sb
      .from('client_price_tables')
      .update({ operation_type: newOp })
      .eq('id', row.id);
    if (upErr) { console.error(`erro id=${row.id}:`, upErr.message); continue; }
    updated++;
  }
  console.log(`Atualizadas: ${updated} | inalteradas: ${unchanged} | sem mapeamento claro (caíram em BRASIL): ${unmapped}`);

  // amostragem por região
  const { data: sample } = await sb.from('client_price_tables').select('operation_type').eq('client', CLIENT).order('operation_type');
  const byRegion: Record<string, number> = {};
  (sample || []).forEach((r: any) => {
    const m = r.operation_type.match(/^REGI[ÃA]O\s*-\s*([A-ZÀ-Ú\- ]+?)\s*-/);
    const reg = m ? m[1] : 'OUTROS';
    byRegion[reg] = (byRegion[reg] || 0) + 1;
  });
  console.log('Distribuição por região:', byRegion);
})();
