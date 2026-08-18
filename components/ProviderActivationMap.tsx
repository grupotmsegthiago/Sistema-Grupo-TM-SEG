import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, MapPin, Loader2, RefreshCw, Phone, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useRealtimeRefresh } from '../lib/RealtimeProvider';
import { UF_TO_REGION } from '../lib/financialUtils';
import { BRAZIL_MAP_VIEWBOX, BRAZIL_UF_PATHS } from '../lib/brazilUfSvg';
import {
  REGION_ORDER,
  UF_LABEL,
  buildActivationOffers,
  rankByHomeCity,
  rankByUf,
  shortProviderName,
  type CityRankGroup,
  type MacroRegion,
  type RankedActivationRow,
  type RankingProviderInput,
  type RankingTableInput,
} from '../lib/providerActivationRanking';

const REGION_TONE: Record<MacroRegion, { fill: string; fillActive: string; badge: string; border: string; title: string }> = {
  SUDESTE: { fill: '#fecaca', fillActive: '#ef4444', badge: 'bg-red-100 text-red-800', border: 'border-red-200', title: 'text-red-800' },
  SUL: { fill: '#bae6fd', fillActive: '#0284c7', badge: 'bg-sky-100 text-sky-800', border: 'border-sky-200', title: 'text-sky-800' },
  'CENTRO-OESTE': { fill: '#fde68a', fillActive: '#d97706', badge: 'bg-amber-100 text-amber-800', border: 'border-amber-200', title: 'text-amber-800' },
  NORDESTE: { fill: '#fed7aa', fillActive: '#ea580c', badge: 'bg-orange-100 text-orange-800', border: 'border-orange-200', title: 'text-orange-800' },
  NORTE: { fill: '#a7f3d0', fillActive: '#059669', badge: 'bg-emerald-100 text-emerald-800', border: 'border-emerald-200', title: 'text-emerald-800' },
};

async function fetchAllRows<T>(table: string, columns: string): Promise<T[]> {
  const page = 1000;
  let from = 0;
  const all: T[] = [];
  while (true) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + page - 1);
    if (error) throw error;
    const rows = (data || []) as T[];
    all.push(...rows);
    if (rows.length < page) break;
    from += page;
  }
  return all;
}

const ProviderActivationMap: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [hoveredUf, setHoveredUf] = useState<string | null>(null);
  const [pinnedUf, setPinnedUf] = useState<string | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['provider-activation-map'],
    queryFn: async () => {
      const [providers, tables] = await Promise.all([
        fetchAllRows<RankingProviderInput>(
          'providers',
          'id, name, trading_name, city, state, status, phone, contact_name, auto_calc_enabled, auto_base_value, auto_base_km, auto_region, operating_coverage',
        ).catch(async (err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          if (!/operating_coverage/i.test(msg)) throw err;
          return fetchAllRows<RankingProviderInput>(
            'providers',
            'id, name, trading_name, city, state, status, phone, contact_name, auto_calc_enabled, auto_base_value, auto_base_km, auto_region',
          );
        }),
        fetchAllRows<RankingTableInput>(
          'provider_cost_tables',
          'provider, operation_type, activation_cost, franchise_km',
        ),
      ]);
      return { providers, tables };
    },
  });

  useRealtimeRefresh(['providers', 'provider_cost_tables'], () => {
    void refetch();
  });

  const offers = useMemo(
    () => buildActivationOffers(data?.providers || [], data?.tables || []),
    [data],
  );
  const byUf = useMemo(() => rankByUf(offers), [offers]);
  const cityGroups = useMemo(() => rankByHomeCity(offers), [offers]);

  const search = searchTerm.trim().toLowerCase();
  const activeUf = pinnedUf || hoveredUf;

  const matchesSearch = (row: RankedActivationRow) => {
    if (!search) return true;
    const blob = `${row.provider} ${row.tradingName || ''} ${row.city} ${row.marketUf} ${UF_LABEL[row.marketUf] || ''} ${row.region}`.toLowerCase();
    return blob.includes(search);
  };

  const filteredCityGroups = useMemo(() => {
    if (!search) return cityGroups;
    return cityGroups
      .map((group) => ({ ...group, rows: group.rows.filter(matchesSearch) }))
      .filter((group) => group.rows.length > 0);
  }, [cityGroups, search]);

  const matchingUfs = useMemo(() => {
    const set = new Set<string>();
    for (const row of offers) {
      if (matchesSearch(row)) set.add(row.marketUf);
    }
    return set;
  }, [offers, search]);

  const panelRows = activeUf ? (byUf[activeUf] || []).filter(matchesSearch) : [];
  const groupedByRegion = useMemo(() => {
    const map = new Map<MacroRegion, CityRankGroup[]>();
    for (const region of REGION_ORDER) map.set(region, []);
    for (const group of filteredCityGroups) {
      const region = (group.region || 'SUDESTE') as MacroRegion;
      (map.get(region) || map.get('SUDESTE'))?.push(group);
    }
    return map;
  }, [filteredCityGroups]);

  return (
    <div className="p-4 lg:p-6 max-w-[1600px] mx-auto" data-testid="page-provider-activation-map">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-5">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-600">Monitoramento · Fornecedor</p>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Mapa de acionamento 100 km</h1>
          <p className="text-sm text-slate-500 mt-1">
            Passe o mouse no estado para ver a ordem de acionamento. Prioridade 0 = mais em conta; em seguida 1, 2, 3…
          </p>
        </div>
        <div className="flex items-center gap-2 w-full lg:w-auto">
          <div className="relative flex-1 lg:w-80">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar fornecedor, cidade ou UF..."
              className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
              data-testid="input-provider-activation-search"
            />
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            title="Atualizar"
            data-testid="button-provider-activation-refresh"
          >
            {isFetching ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          </button>
        </div>
      </div>

      {isError && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle size={16} /> Não foi possível carregar fornecedores e tabelas 100 km.
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 mb-6">
        <div className="xl:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm p-3 sm:p-4">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
              <MapPin size={12} /> Mapa do Brasil
            </span>
            <span className="text-[10px] font-bold text-slate-400">
              {offers.length} fornecedor(es) com tabela 100 km
            </span>
          </div>
          {isLoading ? (
            <div className="h-[420px] flex items-center justify-center text-slate-400">
              <Loader2 className="animate-spin mr-2" size={20} /> Carregando mapa...
            </div>
          ) : (
            <svg
              viewBox={BRAZIL_MAP_VIEWBOX}
              className="w-full h-auto max-h-[560px]"
              role="img"
              aria-label="Mapa do Brasil com fornecedores por estado"
              data-testid="svg-brazil-activation-map"
            >
              {BRAZIL_UF_PATHS.map((state) => {
                const region = (UF_TO_REGION[state.uf] || 'SUDESTE') as MacroRegion;
                const tone = REGION_TONE[region];
                const hasData = (byUf[state.uf] || []).length > 0;
                const isHot = activeUf === state.uf;
                const isMatch = !search || matchingUfs.has(state.uf);
                const fill = !hasData
                  ? '#e2e8f0'
                  : isHot
                    ? tone.fillActive
                    : isMatch
                      ? tone.fill
                      : '#f1f5f9';
                return (
                  <g key={state.uf}>
                    <path
                      d={state.d}
                      fill={fill}
                      stroke={isHot ? '#7f1d1d' : '#ffffff'}
                      strokeWidth={isHot ? 2.4 : 1.1}
                      className="cursor-pointer transition-colors duration-150"
                      data-testid={`uf-${state.uf}`}
                      onMouseEnter={() => setHoveredUf(state.uf)}
                      onMouseLeave={() => setHoveredUf(null)}
                      onClick={() => setPinnedUf((prev) => (prev === state.uf ? null : state.uf))}
                    >
                      <title>{`${state.uf} — ${UF_LABEL[state.uf] || state.uf}`}</title>
                    </path>
                    <text
                      x={state.cx}
                      y={state.cy}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="pointer-events-none select-none"
                      fontSize={state.uf === 'DF' ? 7 : 9}
                      fontWeight={700}
                      fill={isHot ? '#fff' : '#334155'}
                    >
                      {state.uf}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
          <div className="mt-3 flex flex-wrap gap-2 px-1">
            {REGION_ORDER.map((region) => (
              <span key={region} className={`text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-full ${REGION_TONE[region].badge}`}>
                {region}
              </span>
            ))}
          </div>
        </div>

        <div className="xl:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 min-h-[420px]" data-testid="panel-activation-order">
          {!activeUf && (
            <div className="h-full min-h-[380px] flex flex-col items-center justify-center text-center text-slate-400 px-6">
              <MapPin size={28} className="mb-3 text-red-400" />
              <p className="font-bold text-slate-600">Passe o mouse no estado</p>
              <p className="text-sm mt-1">A ordem de acionamento dos fornecedores ativos aparece aqui. Clique para fixar o estado.</p>
            </div>
          )}
          {activeUf && (
            <div>
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{UF_TO_REGION[activeUf]}</p>
                  <h2 className="text-xl font-black text-slate-900">
                    {activeUf} · {UF_LABEL[activeUf] || activeUf}
                  </h2>
                </div>
                {pinnedUf === activeUf && (
                  <button type="button" onClick={() => setPinnedUf(null)} className="text-[10px] font-bold uppercase text-red-600 hover:underline">
                    Desafixar
                  </button>
                )}
              </div>
              {panelRows.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum fornecedor ativo com tabela 100 km neste estado.</p>
              ) : (
                <ol className="space-y-2">
                  {panelRows.map((row) => (
                    <li
                      key={`${row.provider}-${row.priority}`}
                      className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5"
                    >
                      <span className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-xs font-black ${row.priority === 0 ? 'bg-red-600 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}>
                        {row.priority}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900 truncate">{row.provider}</p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {row.city || '—'}{row.fromCoverage ? ` · ${row.source}` : ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-black uppercase tracking-wide text-slate-700">
                          Prioridade {row.priority}
                        </p>
                        {row.priority === 0 && (
                          <p className="text-[10px] font-bold text-red-600">Mais em conta</p>
                        )}
                        {row.phone && (
                          <p className="text-[10px] text-slate-500 flex items-center justify-end gap-1 mt-0.5">
                            <Phone size={10} /> {row.phone}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3" data-testid="region-columns">
        {REGION_ORDER.map((region) => {
          const groups = groupedByRegion.get(region) || [];
          const tone = REGION_TONE[region];
          return (
            <section key={region} className={`bg-white rounded-2xl border ${tone.border} shadow-sm p-3`}>
              <h3 className={`text-xs font-black uppercase tracking-widest mb-3 ${tone.title}`}>{region}</h3>
              {groups.length === 0 ? (
                <p className="text-[11px] text-slate-400">Sem fornecedor 100 km nesta região.</p>
              ) : (
                <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                  {groups.map((group) => (
                    <div key={`${group.uf}-${group.city}`}>
                      <button
                        type="button"
                        onClick={() => setPinnedUf(group.uf)}
                        className="text-[11px] font-black uppercase tracking-wide text-slate-500 hover:text-red-700"
                      >
                        {group.city} ({group.uf})
                      </button>
                      <ul className="mt-1 space-y-1">
                        {group.rows.map((row) => (
                          <li key={`${group.city}-${row.provider}`} className="text-[12px] text-slate-700 flex items-baseline gap-1.5">
                            <span className={`font-black ${row.priority === 0 ? 'text-red-600' : 'text-slate-400'}`}>{row.priority}</span>
                            <span className="truncate" title={row.provider}>{shortProviderName(row.provider)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default ProviderActivationMap;
