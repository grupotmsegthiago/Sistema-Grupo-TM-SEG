/**
 * Análise analítica: viagens do ano × fornecedores × redução de custo
 * para atingir margem de lucro alvo (padrão 50%).
 *
 * Uso:
 *   npx tsx scripts/analise-margem-fornecedores-50.ts
 *   npx tsx scripts/analise-margem-fornecedores-50.ts --target=50
 *   npx tsx scripts/analise-margem-fornecedores-50.ts --year=2026
 *
 * Fonte de valores: lib/missionFinancialsCanonical (mesma do Cockpit/Relatórios).
 * Redução negociável usa costBase (custo do serviço), sem pedágio pass-through.
 */
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeCanonicalRevenueCost,
  filterMissionsByPeriod,
  type CanonicalRefs,
} from '../lib/missionFinancialsCanonical';
import { MissionStatus } from '../types';
import { formatProviderName } from '../lib/utils';

const cfg = {
  url:
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    'https://ajhmmjuewdsukecaimik.supabase.co',
  anonKey:
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqaG1tanVld2RzdWtlY2FpbWlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNzUxMjEsImV4cCI6MjA3OTc1MTEyMX0.5bXRWTyb1HxLimt3lqJTBfjzDoumux7TXlW4lycXrPk',
};

function argNum(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.split('=')[1]);
  return Number.isFinite(n) ? n : fallback;
}

async function fetchAll<T>(
  sb: ReturnType<typeof createClient>,
  table: string,
  select = '*',
  filter?: (q: any) => any,
): Promise<T[]> {
  let all: T[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    let q = sb.from(table).select(select);
    if (filter) q = filter(q);
    const { data, error } = await q.range(from, from + pageSize - 1);
    if (error) throw error;
    if (data) all = all.concat(data as T[]);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v: number) => `${v.toFixed(2)}%`;

type ProviderAgg = {
  providerRaw: string;
  provider: string;
  trips: number;
  rev: number;
  cost: number;
  costBase: number;
  tollCost: number;
  dispCost: number;
  profit: number;
  marginPct: number;
};

/**
 * Distribui a redução necessária de forma justa:
 * - base proporcional ao costBase (quem fatura mais custo contribui mais em R$)
 * - leve ajuste por margem do fornecedor (margem baixa → % um pouco maior)
 * - teto e piso para ninguém levar corte absurdo
 */
function allocateFairCuts(
  rows: ProviderAgg[],
  reductionNeeded: number,
  opts: { minPct: number; maxPct: number; overallMargin: number },
): Map<string, { cutBrl: number; cutPct: number }> {
  const out = new Map<string, { cutBrl: number; cutPct: number }>();
  const eligible = rows.filter((r) => r.costBase > 0);
  if (!eligible.length || reductionNeeded <= 0) {
    for (const r of rows) out.set(r.provider, { cutBrl: 0, cutPct: 0 });
    return out;
  }

  // Score = costBase * fator margem (0.85..1.25)
  const scores = eligible.map((r) => {
    const marginGap = opts.overallMargin - r.marginPct; // positivo se abaixo da média
    const factor = Math.min(1.25, Math.max(0.85, 1 + marginGap / 100));
    return { provider: r.provider, costBase: r.costBase, score: r.costBase * factor };
  });
  const totalScore = scores.reduce((s, x) => s + x.score, 0);

  // 1ª alocação
  let allocated = 0;
  const draft = scores.map((s) => {
    let cutBrl = (s.score / totalScore) * reductionNeeded;
    let cutPct = (cutBrl / s.costBase) * 100;
    if (cutPct > opts.maxPct) {
      cutBrl = (opts.maxPct / 100) * s.costBase;
      cutPct = opts.maxPct;
    }
    if (cutPct < opts.minPct && reductionNeeded > 0) {
      // piso só se couber no costBase
      const floorBrl = (opts.minPct / 100) * s.costBase;
      if (floorBrl <= s.costBase) {
        cutBrl = Math.max(cutBrl, floorBrl);
        cutPct = (cutBrl / s.costBase) * 100;
      }
    }
    allocated += cutBrl;
    return { ...s, cutBrl, cutPct };
  });

  // Redistribui residual (falta ou excesso) nos que ainda têm folga até o teto
  let residual = reductionNeeded - allocated;
  if (Math.abs(residual) > 0.5) {
    const room = draft
      .map((d) => {
        const maxBrl = (opts.maxPct / 100) * d.costBase;
        return { ...d, room: Math.max(0, maxBrl - d.cutBrl) };
      })
      .filter((d) => d.room > 0.01);
    const roomTotal = room.reduce((s, d) => s + d.room, 0);
    if (roomTotal > 0 && residual > 0) {
      for (const d of room) {
        const add = Math.min(d.room, (d.room / roomTotal) * residual);
        d.cutBrl += add;
        d.cutPct = (d.cutBrl / d.costBase) * 100;
        const target = draft.find((x) => x.provider === d.provider)!;
        target.cutBrl = d.cutBrl;
        target.cutPct = d.cutPct;
      }
    } else if (residual < 0) {
      // cortou demais: reduz proporcionalmente
      const scale = reductionNeeded / allocated;
      for (const d of draft) {
        d.cutBrl *= scale;
        d.cutPct = (d.cutBrl / d.costBase) * 100;
      }
    }
  }

  for (const r of rows) {
    const d = draft.find((x) => x.provider === r.provider);
    out.set(r.provider, d ? { cutBrl: d.cutBrl, cutPct: d.cutPct } : { cutBrl: 0, cutPct: 0 });
  }
  return out;
}

async function main() {
  const targetMargin = argNum('target', 50);
  const year = argNum('year', new Date().getFullYear());
  const now = new Date();
  const start = new Date(year, 0, 1, 0, 0, 0, 0);
  const end =
    now.getFullYear() === year
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
      : new Date(year, 11, 31, 23, 59, 59, 999);

  const sb = createClient(cfg.url, cfg.anonKey);
  console.log(`▶ Período: ${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)}`);
  console.log(`▶ Meta de margem: ${targetMargin}%`);
  console.log('▶ Carregando missões e tabelas...');

  const startIso = `${year}-01-01T00:00:00`;
  const endIso = end.toISOString().slice(0, 19);
  const rangeOr = `and(start_time.gte.${startIso},start_time.lte.${endIso}),and(start_time.is.null,created_at.gte.${startIso},created_at.lte.${endIso})`;

  const [missions, clientTables, providerTables, clients, providers] = await Promise.all([
    fetchAll<any>(sb, 'missions', '*', (q) => q.or(rangeOr)),
    fetchAll(sb, 'client_price_tables'),
    fetchAll(sb, 'provider_cost_tables'),
    fetchAll(sb, 'clients'),
    fetchAll<any>(sb, 'providers', 'id, name, trading_name, status'),
  ]);

  const refs: CanonicalRefs = {
    clientTables: clientTables as any,
    providerTables: providerTables as any,
    clientsData: clients as any,
  };

  const inPeriod = filterMissionsByPeriod(missions, start, end);
  const tradingByName = new Map<string, string>();
  for (const p of providers) {
    if (p?.name) tradingByName.set(String(p.name).trim().toUpperCase(), p.trading_name || '');
  }

  const byProvider = new Map<string, ProviderAgg>();
  let totals = {
    trips: 0,
    rev: 0,
    cost: 0,
    costBase: 0,
    tollCost: 0,
    dispCost: 0,
    profit: 0,
    refused: 0,
  };

  for (const m of inPeriod) {
    if (m.status === MissionStatus.REFUSED || m.status === 'Recusada') {
      totals.refused++;
      continue;
    }
    const fin = computeCanonicalRevenueCost(m, refs, now);
    const raw = (m.provider || 'SEM FORNECEDOR').toString().trim() || 'SEM FORNECEDOR';
    const trading = tradingByName.get(raw.toUpperCase());
    const label = formatProviderName(raw, trading) || raw;
    const key = label.toUpperCase();

    const agg =
      byProvider.get(key) ||
      ({
        providerRaw: raw,
        provider: label,
        trips: 0,
        rev: 0,
        cost: 0,
        costBase: 0,
        tollCost: 0,
        dispCost: 0,
        profit: 0,
        marginPct: 0,
      } satisfies ProviderAgg);

    agg.trips += 1;
    agg.rev += fin.rev;
    agg.cost += fin.cost;
    agg.costBase += fin.costBase;
    agg.tollCost += fin.tollCost;
    agg.dispCost += fin.dispCost;
    agg.profit += fin.profit;
    byProvider.set(key, agg);

    totals.trips += 1;
    totals.rev += fin.rev;
    totals.cost += fin.cost;
    totals.costBase += fin.costBase;
    totals.tollCost += fin.tollCost;
    totals.dispCost += fin.dispCost;
    totals.profit += fin.profit;
  }

  const rows = [...byProvider.values()]
    .map((r) => ({
      ...r,
      marginPct: r.rev > 0 ? (r.profit / r.rev) * 100 : 0,
    }))
    .sort((a, b) => b.costBase - a.costBase);

  const currentMargin = totals.rev > 0 ? (totals.profit / totals.rev) * 100 : 0;
  const targetCostTotal = totals.rev * (1 - targetMargin / 100);
  // Meta de custo negociável: mantém pedágio+desloc. e reduz só costBase
  const fixedPassThrough = totals.tollCost + totals.dispCost;
  const targetCostBase = Math.max(0, targetCostTotal - fixedPassThrough);
  const reductionNeededOnBase = Math.max(0, totals.costBase - targetCostBase);
  const uniformPct =
    totals.costBase > 0 ? (reductionNeededOnBase / totals.costBase) * 100 : 0;

  // Piso/teto: espalha o corte — se uniforme for 8%, usa min 40% e max 160% do uniforme
  const minPct = Math.max(0.5, uniformPct * 0.4);
  const maxPct = Math.min(25, Math.max(uniformPct * 1.6, uniformPct + 3));

  const fair = allocateFairCuts(rows, reductionNeededOnBase, {
    minPct,
    maxPct,
    overallMargin: currentMargin,
  });

  const detail = rows.map((r) => {
    const cut = fair.get(r.provider) || { cutBrl: 0, cutPct: 0 };
    const newCostBase = Math.max(0, r.costBase - cut.cutBrl);
    const newCost = newCostBase + r.tollCost + r.dispCost;
    const newProfit = r.rev - newCost;
    const newMargin = r.rev > 0 ? (newProfit / r.rev) * 100 : 0;
    return {
      fornecedor: r.provider,
      viagens: r.trips,
      receita: r.rev,
      custoTotal: r.cost,
      custoBase: r.costBase,
      pedagioFornecedor: r.tollCost,
      lucro: r.profit,
      margemAtualPct: r.marginPct,
      reducaoSugeridaPct: cut.cutPct,
      reducaoSugeridaBrl: cut.cutBrl,
      reducaoUniformePct: uniformPct,
      custoBaseApos: newCostBase,
      margemProjetadaPct: newMargin,
      shareCustoBasePct: totals.costBase > 0 ? (r.costBase / totals.costBase) * 100 : 0,
    };
  });

  const projectedCostBase = detail.reduce((s, d) => s + d.custoBaseApos, 0);
  const projectedCost = projectedCostBase + fixedPassThrough;
  const projectedProfit = totals.rev - projectedCost;
  const projectedMargin = totals.rev > 0 ? (projectedProfit / totals.rev) * 100 : 0;
  const totalCut = detail.reduce((s, d) => s + d.reducaoSugeridaBrl, 0);

  const summary = {
    periodo: {
      inicio: start.toISOString().slice(0, 10),
      fim: end.toISOString().slice(0, 10),
      ano: year,
    },
    metaMargemPct: targetMargin,
    totais: {
      viagens: totals.trips,
      recusadasIgnoradas: totals.refused,
      fornecedoresComViagem: rows.length,
      receita: totals.rev,
      custoTotal: totals.cost,
      custoBaseNegociavel: totals.costBase,
      pedagioFornecedor: totals.tollCost,
      deslocamentoFornecedor: totals.dispCost,
      lucro: totals.profit,
      margemAtualPct: currentMargin,
    },
    gap: {
      custoAlvoTotal: targetCostTotal,
      custoBaseAlvo: targetCostBase,
      reducaoNecessariaNoCustoBase: reductionNeededOnBase,
      reducaoUniformePct: uniformPct,
      jaAtingiuMeta: reductionNeededOnBase <= 0.01,
    },
    cenarioJusto: {
      descricao:
        'Corte no custo base (sem pedágio), proporcional ao volume, com leve ajuste para fornecedores de margem abaixo da média. Piso/teto evitam cortes extremos.',
      minPct,
      maxPct,
      reducaoTotalBrl: totalCut,
      margemProjetadaPct: projectedMargin,
      lucroProjetado: projectedProfit,
      custoProjetado: projectedCost,
    },
    topFornecedores: detail.slice(0, 25),
    todosFornecedores: detail,
  };

  // Markdown legível
  const md: string[] = [];
  md.push(`# Estimativa de margem — viagens ${year} × fornecedores`);
  md.push('');
  md.push(`**Período:** ${summary.periodo.inicio} → ${summary.periodo.fim} (ano civil até hoje)`);
  md.push(`**Meta:** margem de lucro **${targetMargin}%** sobre a receita das OS`);
  md.push(`**Método:** valores canônicos do sistema (\`missionFinancialsCanonical\`); corte só no **custo base** do fornecedor (pedágio/deslocamento fora da negociação).`);
  md.push('');
  md.push('## 1. Panorama do ano');
  md.push('');
  md.push(`| Indicador | Valor |`);
  md.push(`|---|---|`);
  md.push(`| Viagens (OS) | ${totals.trips.toLocaleString('pt-BR')} |`);
  md.push(`| Fornecedores com viagem | ${rows.length} |`);
  md.push(`| Receita | ${brl(totals.rev)} |`);
  md.push(`| Custo total | ${brl(totals.cost)} |`);
  md.push(`| — custo base (negociável) | ${brl(totals.costBase)} |`);
  md.push(`| — pedágio fornecedor | ${brl(totals.tollCost)} |`);
  md.push(`| — deslocamento fornecedor | ${brl(totals.dispCost)} |`);
  md.push(`| Lucro | ${brl(totals.profit)} |`);
  md.push(`| Margem atual | **${pct(currentMargin)}** |`);
  md.push('');

  if (summary.gap.jaAtingiuMeta) {
    md.push(`> Meta de ${targetMargin}% já atingida ou superada neste recorte. Não há redução necessária.`);
  } else {
    md.push('## 2. Quanto falta para a meta');
    md.push('');
    md.push(`Para margem ${targetMargin}%, o custo total deveria ser ~${brl(targetCostTotal)}.`);
    md.push(`Mantendo pedágio/deslocamento (${brl(fixedPassThrough)}), o **custo base** precisa cair de ${brl(totals.costBase)} para ${brl(targetCostBase)}.`);
    md.push('');
    md.push(`- **Redução necessária no custo base:** ${brl(reductionNeededOnBase)}`);
    md.push(`- **Se cortar igual em todos:** **${pct(uniformPct)}** em cada fornecedor`);
    md.push('');
    md.push('## 3. Cenário justo (não cortar muito de ninguém)');
    md.push('');
    md.push(`Distribuição com piso ~${pct(minPct)} e teto ~${pct(maxPct)}, ajustando um pouco quem está com margem abaixo da média.`);
    md.push('');
    md.push(`| Resultado projetado | Valor |`);
    md.push(`|---|---|`);
    md.push(`| Economia total no custo base | ${brl(totalCut)} |`);
    md.push(`| Custo projetado | ${brl(projectedCost)} |`);
    md.push(`| Lucro projetado | ${brl(projectedProfit)} |`);
    md.push(`| Margem projetada | **${pct(projectedMargin)}** |`);
    md.push('');
    md.push('## 4. Redução sugerida por fornecedor (ordenado por custo base)');
    md.push('');
    md.push('| Fornecedor | Viagens | Receita | Custo base | Margem atual | ↓ % sugerido | ↓ R$ | Margem projetada |');
    md.push('|---|---:|---:|---:|---:|---:|---:|---:|');
    for (const d of detail) {
      if (d.custoBase < 1 && d.viagens === 0) continue;
      md.push(
        `| ${d.fornecedor} | ${d.viagens} | ${brl(d.receita)} | ${brl(d.custoBase)} | ${pct(d.margemAtualPct)} | **${pct(d.reducaoSugeridaPct)}** | ${brl(d.reducaoSugeridaBrl)} | ${pct(d.margemProjetadaPct)} |`,
      );
    }
  }

  md.push('');
  md.push('## 5. Observações');
  md.push('');
  md.push('- OS **Recusadas** não entram no faturamento.');
  md.push('- Pedágio e deslocamento não entram no % de negociação (pass-through / aditivo).');
  md.push('- É estimativa analítica para apoio à negociação — não altera tabelas nem OS automaticamente.');
  md.push('- Para reaplicar o % nas tabelas de custo, use o reajuste de fornecedor no sistema (com sinal invertido / redução).');
  md.push('');

  const outDir = join(process.cwd(), 'artifacts');
  mkdirSync(outDir, { recursive: true });
  const stamp = end.toISOString().slice(0, 10);
  const jsonPath = join(outDir, `analise-margem-fornecedores-${year}-${stamp}.json`);
  const mdPath = join(outDir, `analise-margem-fornecedores-${year}-${stamp}.md`);
  writeFileSync(jsonPath, JSON.stringify(summary, null, 2), 'utf8');
  writeFileSync(mdPath, md.join('\n'), 'utf8');

  console.log('');
  console.log(md.join('\n'));
  console.log('');
  console.log(`✔ JSON: ${jsonPath}`);
  console.log(`✔ MD:   ${mdPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
