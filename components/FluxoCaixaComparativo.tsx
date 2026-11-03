import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { isInternalGroupTransfer } from '../lib/financialInternalTransfer';
import {
  cursorDeHoje,
  moverCursor,
  serieFluxoCaixa,
  type CursorFluxo,
  type GranularidadeFluxo,
  type PontoFluxoCaixa,
} from '../lib/financial/fluxoCaixaComparativo';
import type { FinancialCategory, FinancialTransaction } from '../types';

const CHAVE_ABERTO = 'tmseg.fluxoCaixa.aberto';
const CHAVE_GRAO = 'tmseg.fluxoCaixa.granularidade';

const GRAOS: { id: GranularidadeFluxo; label: string }[] = [
  { id: 'ano', label: 'Ano' },
  { id: 'mes', label: 'Mês' },
  { id: 'quinzena', label: 'Quinzena' },
  { id: 'semana', label: 'Semana' },
  { id: 'dia', label: 'Dia' },
];

const VERDE = '#10B981';
const VERMELHO = '#EF4444';

function lerAberto(): boolean {
  try {
    return localStorage.getItem(CHAVE_ABERTO) === '1';
  } catch {
    return false;
  }
}

function lerGrao(): GranularidadeFluxo {
  try {
    const valor = localStorage.getItem(CHAVE_GRAO);
    if (valor === 'ano' || valor === 'mes' || valor === 'quinzena' || valor === 'semana' || valor === 'dia') return valor;
  } catch {
    /* segue o mês */
  }
  return 'mes';
}

function reais(valor: number): string {
  return (Number(valor) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function eixo(valor: number): string {
  const n = Number(valor) || 0;
  const abs = Math.abs(n);
  const sinal = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sinal}R$ ${(abs / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1000) return `${sinal}R$ ${Math.round(abs / 1000)}k`;
  return `${sinal}R$ ${abs.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
}

function TooltipFluxo({ active, payload }: { active?: boolean; payload?: Array<{ payload?: PontoFluxoCaixa }> }) {
  const ponto = payload?.[0]?.payload;
  if (!active || !ponto) return null;
  return (
    <div className="rounded-xl bg-gray-900 px-3 py-2 text-xs text-white shadow-lg">
      <p className="font-black">{ponto.rotuloTooltip}</p>
      <p className="mt-1 font-bold text-emerald-300">Receber: {reais(ponto.receber)}</p>
      <p className="font-bold text-red-300">Pagar: {reais(ponto.pagar)}</p>
      <p className="font-bold text-blue-300">Saldo do dia: {reais(ponto.saldo)}</p>
    </div>
  );
}

const FluxoCaixaComparativo: React.FC<{
  lancamentos: FinancialTransaction[];
  categorias: FinancialCategory[];
  carregando?: boolean;
}> = ({ lancamentos, categorias, carregando = false }) => {
  const [aberto, setAberto] = useState(false);
  const [grao, setGrao] = useState<GranularidadeFluxo>('mes');
  const [cursor, setCursor] = useState<CursorFluxo>(() => cursorDeHoje());

  useEffect(() => {
    setAberto(lerAberto());
    setGrao(lerGrao());
  }, []);

  const base = useMemo(() => {
    const investimento = new Set(categorias.filter((c) => c.group === 'INVESTIMENTOS').map((c) => c.id));
    return lancamentos.filter((t) =>
      !investimento.has(t.category_id)
      && !(t.notes || '').startsWith('Atualização de saldo de investimento')
      && !isInternalGroupTransfer(t, categorias),
    );
  }, [lancamentos, categorias]);

  const serie = useMemo(() => serieFluxoCaixa(base, grao, cursor), [base, grao, cursor]);
  const pontosVisiveis = useMemo(
    () => serie.pontos.filter((p) => p.receber !== 0 || p.pagar !== 0),
    [serie.pontos],
  );
  const saldoNegativo = serie.saldo < 0;

  const alternar = () => {
    setAberto((atual) => {
      const proximo = !atual;
      try { localStorage.setItem(CHAVE_ABERTO, proximo ? '1' : '0'); } catch { /* preferência local */ }
      return proximo;
    });
  };

  const escolherGrao = (id: GranularidadeFluxo) => {
    setGrao(id);
    try { localStorage.setItem(CHAVE_GRAO, id); } catch { /* preferência local */ }
  };

  const resumo = carregando && lancamentos.length === 0
    ? 'Lendo lançamentos…'
    : `${serie.periodo} · Receber ${reais(serie.receber)} · Pagar ${reais(serie.pagar)} · Saldo ${reais(serie.saldo)}`;

  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden no-print" data-testid="fluxo-caixa-comparativo">
      <button
        type="button"
        onClick={alternar}
        aria-expanded={aberto}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
        data-testid="fluxo-caixa-cabecalho"
      >
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase tracking-tight text-gray-800">Evolução Financeira: Contas a Receber x Contas a Pagar</p>
          <p className="text-[11px] font-semibold text-gray-500 truncate" data-testid="fluxo-caixa-resumo">{resumo}</p>
        </div>
        <ChevronDown size={18} className={`shrink-0 text-gray-500 transition-transform duration-300 ${aberto ? 'rotate-180' : ''}`} />
      </button>

      <div className={`grid transition-[grid-template-rows] duration-300 ${aberto ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="border-t border-gray-100 px-4 pb-4 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <button type="button" className="h-8 w-8 rounded-lg border border-gray-200 text-sm font-black text-gray-600 hover:bg-gray-50" onClick={() => setCursor((c) => moverCursor(c, grao, -1))} aria-label="Período anterior">‹</button>
                <span className="px-2 text-[11px] font-black uppercase text-gray-700">{serie.periodo}</span>
                <button type="button" className="h-8 w-8 rounded-lg border border-gray-200 text-sm font-black text-gray-600 hover:bg-gray-50" onClick={() => setCursor((c) => moverCursor(c, grao, 1))} aria-label="Próximo período">›</button>
                {grao === 'quinzena' && (
                  <div className="ml-2 flex rounded-lg border border-gray-200 p-0.5">
                    <button type="button" className={`px-2 py-1 text-[10px] font-black uppercase rounded-md ${cursor.quinzena === 1 ? 'bg-gray-900 text-white' : 'text-gray-500'}`} onClick={() => setCursor((c) => ({ ...c, quinzena: 1 }))}>1ª · 01 a 15</button>
                    <button type="button" className={`px-2 py-1 text-[10px] font-black uppercase rounded-md ${cursor.quinzena === 2 ? 'bg-gray-900 text-white' : 'text-gray-500'}`} onClick={() => setCursor((c) => ({ ...c, quinzena: 2 }))}>2ª · 16 ao fim</button>
                  </div>
                )}
              </div>
              <div className="flex rounded-lg border border-gray-200 p-0.5" data-testid="fluxo-caixa-graos">
                {GRAOS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => escolherGrao(item.id)}
                    className={`px-2.5 py-1 text-[10px] font-black uppercase rounded-md ${grao === item.id ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800'}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3" data-testid="fluxo-caixa-cards">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-wide text-emerald-800">Entradas</p>
                <p className="text-sm font-black text-emerald-950">{reais(serie.receber)}</p>
              </div>
              <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-wide text-red-800">Saídas</p>
                <p className="text-sm font-black text-red-950">{reais(serie.pagar)}</p>
              </div>
              <div className={`rounded-xl border px-3 py-2 ${saldoNegativo ? 'border-red-200 bg-red-50' : 'border-slate-800 bg-slate-900'}`}>
                <p className={`text-[10px] font-black uppercase tracking-wide ${saldoNegativo ? 'text-red-800' : 'text-slate-300'}`}>Saldo do período</p>
                <p className={`text-sm font-black ${saldoNegativo ? 'text-red-700' : 'text-emerald-300'}`}>{reais(serie.saldo)}</p>
              </div>
            </div>

            {!aberto ? null : serie.vazio ? (
              <p className="mt-6 mb-2 text-center text-sm font-semibold text-gray-400" data-testid="fluxo-caixa-vazio">
                Nenhum lançamento de receber ou pagar neste período.
              </p>
            ) : (
              <div className="mt-3 h-80 w-full" data-testid="fluxo-caixa-grafico">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={pontosVisiveis} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                    <CartesianGrid stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="rotulo" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} angle={pontosVisiveis.length > 12 ? -40 : 0} textAnchor={pontosVisiveis.length > 12 ? 'end' : 'middle'} height={pontosVisiveis.length > 12 ? 56 : 28} />
                    <YAxis yAxisId="volume" tickFormatter={eixo} tick={{ fontSize: 10, fill: '#64748b' }} width={72} domain={[0, 'auto']} />
                    <YAxis yAxisId="saldo" orientation="right" tickFormatter={eixo} tick={{ fontSize: 10, fill: '#2563EB' }} width={72} />
                    <Tooltip content={<TooltipFluxo />} />
                    <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
                    <Bar yAxisId="volume" dataKey="receber" name="Entradas" fill={VERDE} radius={[4, 4, 0, 0]} maxBarSize={22} />
                    <Bar yAxisId="volume" dataKey="pagar" name="Saídas" fill={VERMELHO} radius={[4, 4, 0, 0]} maxBarSize={22} />
                    <Line yAxisId="saldo" dataKey="saldo" name="Saldo líquido" stroke="#2563EB" strokeWidth={2} dot={{ r: 3, fill: '#2563EB' }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
            <p className="mt-2 text-[10px] font-semibold text-gray-400">
              Colunas no valor do título, pelo vencimento. A linha azul é o saldo do dia e usa a escala da direita. Dias sem movimento ficam de fora. Cancelados, investimento e transferência interna não entram.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FluxoCaixaComparativo;
