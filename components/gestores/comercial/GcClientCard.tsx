import React, { useMemo } from 'react';
import { Building2 } from 'lucide-react';
import GcPageHeader from './shared/GcPageHeader';
import GcStatCard from './shared/GcStatCard';
import { formatBrl, formatPct } from './shared/format';
import { useGcData } from '../../../lib/gestores/comercial/useGcData';
import { Wallet, Gauge, Truck, Route } from 'lucide-react';

interface Props {
  clientId: string | null;
  onBack: () => void;
}

const GcClientCard: React.FC<Props> = ({ clientId, onBack }) => {
  const { health, hideStrategic, loading } = useGcData();
  const card = useMemo(
    () => health.find((h) => h.clientId === clientId) || null,
    [health, clientId],
  );

  if (loading) {
    return <div className="p-8 animate-pulse h-64 bg-slate-100 rounded-2xl m-4" />;
  }

  if (!card) {
    return (
      <div className="p-8">
        <GcPageHeader title="Ficha do Cliente" onBack={onBack} icon={Building2} />
        <p className="text-slate-500">Cliente não encontrado no escopo atual.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <GcPageHeader
        title={card.clientName}
        subtitle={`Status ${card.status} · Saúde ${card.healthScore} · Tendência ${card.trend}`}
        icon={Building2}
        onBack={onBack}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <GcStatCard title="Faturamento mensal" value={formatBrl(card.monthlyRevenue)} icon={Wallet} />
        <GcStatCard title="Faturamento anual" value={formatBrl(card.yearlyRevenue)} icon={Wallet} tone="accent" />
        <GcStatCard title="Ticket médio" value={formatBrl(card.avgTicket)} icon={Gauge} />
        {!hideStrategic && (
          <>
            <GcStatCard title="Lucro bruto" value={formatBrl(card.grossProfit)} icon={Wallet} tone="good" />
            <GcStatCard title="Impostos" value={formatBrl(card.taxAmount)} icon={Wallet} subtitle="Parametrizável pela Diretoria" />
            <GcStatCard title="Lucro líquido" value={formatBrl(card.netProfit)} icon={Wallet} />
            <GcStatCard title="Margem" value={formatPct(card.marginPct)} icon={Gauge} />
            <GcStatCard title="Custo" value={formatBrl(card.cost)} icon={Wallet} />
          </>
        )}
        <GcStatCard title="Operações" value={card.operations} icon={Truck} />
        <GcStatCard title="Escoltas" value={card.escoltas} icon={Truck} />
        <GcStatCard title="Prontas respostas" value={card.prontasRespostas} icon={Truck} />
        <GcStatCard title="Moto acompanhamento" value={card.motoAcompanhamento} icon={Truck} />
        <GcStatCard title="Viagens curtas" value={card.tripsShort} icon={Route} />
        <GcStatCard title="Viagens médias" value={card.tripsMedium} icon={Route} />
        <GcStatCard title="Viagens longas" value={card.tripsLong} icon={Route} />
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-2 text-sm">
        <p><span className="font-bold text-slate-500">Último contato:</span> {card.lastContactAt ? new Date(card.lastContactAt).toLocaleString('pt-BR') : '—'}</p>
        <p><span className="font-bold text-slate-500">Próximo contato:</span> {card.nextContactAt ? new Date(card.nextContactAt).toLocaleString('pt-BR') : 'Não agendado'}</p>
        <p><span className="font-bold text-slate-500">Tempo sem faturar:</span> {card.daysWithoutRevenue === 999 ? 'Sem histórico' : `${card.daysWithoutRevenue} dias`}</p>
        <p><span className="font-bold text-slate-500">Tendência:</span> {formatPct(card.trendPct)} ({card.trend})</p>
        {card.ownedBy && <p><span className="font-bold text-slate-500">Carteira / created_by:</span> {card.ownedBy}</p>}
      </div>
    </div>
  );
};

export default GcClientCard;
