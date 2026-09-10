import React from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { carregarPainelFaturamento } from '../lib/faturamento/carregarPainelFaturamento';

type Props = {
  onOpenPainel?: () => void;
};

const FaturamentoAlertBanner: React.FC<Props> = ({ onOpenPainel }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['faturamento-painel'],
    queryFn: () => carregarPainelFaturamento(supabase),
    staleTime: 60_000,
  });

  if (isLoading && !data) {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-500">
        <Loader2 size={14} className="animate-spin" /> Conferindo OS × faturamento…
      </div>
    );
  }
  if (!data) return null;

  const k = data.kpis;
  if (data.consultaIncompleta) {
    return (
      <button
        type="button"
        onClick={onOpenPainel}
        className="mb-4 flex w-full items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-left"
        data-testid="banner-faturamento-incompleto"
      >
        <span className="text-xs font-black text-amber-900">CONSULTA INCOMPLETA — não use este número como universo total.</span>
        <span className="text-[10px] font-black uppercase text-amber-800">Abrir painel</span>
      </button>
    );
  }

  if (k.semaforo === 'ok') {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800" data-testid="banner-faturamento-ok">
        <CheckCircle2 size={14} /> Ciclos fechados cobertos · {k.osFaturadasFechado}/{k.osCicloFechado} OS faturadas
      </div>
    );
  }

  const partes: string[] = [];
  if (k.osSemFaturaFechado) partes.push(`${k.osSemFaturaFechado} OS sem fatura`);
  if (k.osSemAprovacaoFechado) partes.push(`${k.osSemAprovacaoFechado} sem APROVADA`);
  if (k.faturasAtrasadas) partes.push(`${k.faturasAtrasadas} fatura(s) atrasada(s)`);
  if (k.osPendentesAberto) partes.push(`${k.osPendentesAberto} para aprovar no ciclo atual`);
  if (k.clientesSemCiclo) partes.push(`${k.clientesSemCiclo} cliente(s) sem ciclo`);

  const critico = k.semaforo === 'critico';
  return (
    <button
      type="button"
      onClick={onOpenPainel}
      className={`mb-4 flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left ${
        critico ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'
      }`}
      data-testid="banner-faturamento-alerta"
    >
      <span className={`flex items-center gap-2 text-xs font-black ${critico ? 'text-red-800' : 'text-amber-900'}`}>
        <AlertTriangle size={14} />
        {partes.join(' · ') || 'Pendências de faturamento'}
      </span>
      <span className={`text-[10px] font-black uppercase ${critico ? 'text-red-700' : 'text-amber-800'}`}>Ver fila</span>
    </button>
  );
};

export default FaturamentoAlertBanner;
