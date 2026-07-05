import React from 'react';
import {
  ArrowRight,
  Briefcase,
  Clock,
  Gauge,
  History,
  MapPin,
  Phone,
  Shield,
  Sparkles,
  Truck,
  User,
  Users,
  Zap,
} from 'lucide-react';
import type { AuditSummaryDisplay } from '../lib/auditSummaryBuilder';

const formatCurrency = (val?: number) => {
  if (val == null || Number.isNaN(val)) return '—';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const statusBadgeClass = (status: string): string => {
  const s = status.toLowerCase();
  if (s.includes('conclu')) return 'bg-emerald-100 text-emerald-800 border-emerald-300';
  if (s.includes('cancel')) return 'bg-red-100 text-red-800 border-red-300';
  if (s.includes('pend')) return 'bg-amber-100 text-amber-800 border-amber-300';
  if (s.includes('viagem') || s.includes('andamento')) return 'bg-blue-100 text-blue-800 border-blue-300';
  return 'bg-slate-100 text-slate-700 border-slate-300';
};

const InfoCard: React.FC<{
  label: string;
  value: string;
  sub?: string;
  tone?: 'slate' | 'blue' | 'indigo' | 'emerald' | 'amber';
  icon?: React.ReactNode;
}> = ({ label, value, sub, tone = 'slate', icon }) => {
  const tones: Record<string, string> = {
    slate: 'bg-white border-gray-200',
    blue: 'bg-blue-50 border-blue-200',
    indigo: 'bg-indigo-50 border-indigo-200',
    emerald: 'bg-emerald-50 border-emerald-200',
    amber: 'bg-amber-50 border-amber-200',
  };
  return (
    <div className={`p-3 rounded-xl border ${tones[tone]}`}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">{label}</p>
      </div>
      <p className="text-[11px] font-black text-gray-900 leading-snug break-words">{value || '—'}</p>
      {sub && <p className="text-[8px] text-gray-500 font-bold mt-1">{sub}</p>}
    </div>
  );
};

const TimelineStep: React.FC<{
  label: string;
  value: string;
  isLast?: boolean;
  highlight?: boolean;
}> = ({ label, value, isLast, highlight }) => (
  <div className="flex gap-3">
    <div className="flex flex-col items-center">
      <div
        className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1 ${
          highlight ? 'bg-emerald-500 ring-4 ring-emerald-100' : 'bg-slate-300'
        }`}
      />
      {!isLast && <div className="w-px flex-1 bg-slate-200 my-1 min-h-[24px]" />}
    </div>
    <div className={`pb-4 ${isLast ? 'pb-0' : ''}`}>
      <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">{label}</p>
      <p className="text-[11px] font-bold text-gray-800 mt-0.5">{value || '—'}</p>
    </div>
  </div>
);

interface Props {
  data: AuditSummaryDisplay;
}

const AuditSummaryPanel: React.FC<Props> = ({ data }) => {
  const director = data.director;

  return (
    <div className="space-y-4" data-testid="text-audit-summary">
      {/* Cabeçalho OS */}
      <div className="bg-gradient-to-br from-[#0f172a] to-slate-800 rounded-2xl p-4 text-white shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">
              Ordem de Serviço
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-black tracking-tight">{data.osId}</h3>
              {data.seNumber && (
                <span className="px-2 py-0.5 rounded-lg bg-white/10 border border-white/20 text-[10px] font-black uppercase">
                  SE {data.seNumber}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-300 font-bold mt-1 flex items-center gap-1.5">
              <Briefcase size={12} className="text-emerald-400" />
              {data.clientLabel}
            </p>
          </div>
          <span
            className={`px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase ${statusBadgeClass(data.status)}`}
          >
            {data.status}
          </span>
        </div>
        {data.finalizeMessage && (
          <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-2 text-emerald-300">
            <Zap size={14} />
            <p className="text-[10px] font-bold">{data.finalizeMessage}</p>
          </div>
        )}
      </div>

      {/* Equipe e viatura */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-slate-900 rounded-lg">
            <Users size={12} className="text-white" />
          </div>
          <span className="text-[10px] font-black text-gray-700 uppercase tracking-widest">
            Equipe e Viatura
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <InfoCard
            label="Viatura"
            value={data.viaturaPlate}
            sub={data.providerTradingName !== '—' ? data.providerTradingName : undefined}
            tone="indigo"
            icon={<Truck size={10} className="text-indigo-500" />}
          />
          <InfoCard label="Agente 1" value={data.agent1} icon={<User size={10} className="text-gray-400" />} />
          <InfoCard label="Agente 2" value={data.agent2} icon={<User size={10} className="text-gray-400" />} />
          <InfoCard
            label="Motorista"
            value={data.driverName}
            sub={data.driverPhone !== '—' ? data.driverPhone : undefined}
            tone="blue"
            icon={<Phone size={10} className="text-blue-500" />}
          />
        </div>
      </div>

      {/* Rota */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 bg-red-600 rounded-lg">
            <MapPin size={12} className="text-white" />
          </div>
          <span className="text-[10px] font-black text-gray-700 uppercase tracking-widest">Rota</span>
        </div>
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex-1 p-3 rounded-xl bg-green-50 border border-green-200">
            <p className="text-[8px] font-black text-green-700 uppercase tracking-widest mb-1">Origem</p>
            <p className="text-[11px] font-black text-gray-800 leading-snug">{data.origin}</p>
          </div>
          <div className="hidden md:flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 border border-gray-200 shrink-0">
            <ArrowRight size={14} className="text-gray-500" />
          </div>
          <div className="flex-1 p-3 rounded-xl bg-red-50 border border-red-200">
            <p className="text-[8px] font-black text-red-700 uppercase tracking-widest mb-1">Destino</p>
            <p className="text-[11px] font-black text-gray-800 leading-snug">{data.destination}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-gray-100">
          <InfoCard label="Cavalo" value={data.cavaloPlate} tone="slate" />
          <InfoCard label="Carreta" value={data.carretaPlate} tone="slate" />
        </div>
      </div>

      {/* Cronograma + KM */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-600 rounded-lg">
                <Clock size={12} className="text-white" />
              </div>
              <span className="text-[10px] font-black text-gray-700 uppercase tracking-widest">
                Cronograma
              </span>
            </div>
            <span className="px-2 py-1 rounded-lg bg-blue-50 border border-blue-200 text-[9px] font-black text-blue-700 uppercase">
              Total {data.totalDuration}
            </span>
          </div>
          <TimelineStep label="Início Previsto" value={data.scheduledStart} />
          <TimelineStep label="Chegada na Origem" value={data.originArrival} />
          <TimelineStep label="Início da Operação" value={data.operationStart} />
          <TimelineStep label="Fim da Operação" value={data.operationEnd} isLast highlight />
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 bg-emerald-600 rounded-lg">
              <Gauge size={12} className="text-white" />
            </div>
            <span className="text-[10px] font-black text-gray-700 uppercase tracking-widest">
              Quilometragem
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-center">
              <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Inicial</p>
              <p className="text-lg font-black text-gray-800 mt-1">{data.startKm}</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-center">
              <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Final</p>
              <p className="text-lg font-black text-gray-800 mt-1">{data.endKm}</p>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
              <p className="text-[8px] font-black text-emerald-700 uppercase tracking-widest">Total</p>
              <p className="text-lg font-black text-emerald-800 mt-1">{data.totalKm}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Bloco diretoria */}
      {director && (
        <div className="rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 overflow-hidden shadow-sm">
          <div className="px-4 py-3 bg-amber-100/80 border-b border-amber-200 flex items-center gap-2">
            <Shield size={16} className="text-amber-700" />
            <div>
              <p className="text-[10px] font-black text-amber-900 uppercase tracking-widest">
                Acesso Diretoria
              </p>
              <p className="text-[9px] text-amber-700 font-bold">Trilha de auditoria e resumo inteligente</p>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {(director.revenueTotal != null || director.costTotal != null) && (
              <div className="grid grid-cols-3 gap-2">
                <div className="p-3 rounded-xl bg-white border border-green-200 text-center">
                  <p className="text-[8px] font-black text-green-700 uppercase tracking-widest">Receita</p>
                  <p className="text-sm font-black text-green-700 font-mono mt-1">
                    {formatCurrency(director.revenueTotal)}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-white border border-red-200 text-center">
                  <p className="text-[8px] font-black text-red-700 uppercase tracking-widest">Custo</p>
                  <p className="text-sm font-black text-red-700 font-mono mt-1">
                    {formatCurrency(director.costTotal)}
                  </p>
                </div>
                <div
                  className={`p-3 rounded-xl bg-white border text-center ${
                    (director.marginPct ?? 0) >= 0 ? 'border-emerald-200' : 'border-red-200'
                  }`}
                >
                  <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Margem</p>
                  <p
                    className={`text-sm font-black font-mono mt-1 ${
                      (director.marginPct ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {director.marginPct != null ? `${director.marginPct.toFixed(1)}%` : '—'}
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <InfoCard label="Quem abriu a OS" value={director.openedBy} tone="amber" />
              <InfoCard label="Tabelas / inclusão" value={director.tablesBy} tone="amber" />
            </div>

            {director.statusEntries.length > 0 && (
              <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
                <div className="px-3 py-2 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
                  <History size={12} className="text-amber-700" />
                  <p className="text-[9px] font-black text-amber-900 uppercase tracking-widest">
                    Histórico de Status
                  </p>
                </div>
                <div className="divide-y divide-amber-50 max-h-40 overflow-auto">
                  {director.statusEntries.map((entry, i) => (
                    <div key={i} className="px-3 py-2 flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-lg border text-[9px] font-black uppercase ${statusBadgeClass(entry.status)}`}
                      >
                        {entry.status}
                      </span>
                      <span className="text-[9px] font-bold text-gray-600">{entry.by}</span>
                      <span className="text-[9px] text-gray-400 font-mono ml-auto">{entry.at}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {director.kmEntries.length > 0 && (
              <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
                <div className="px-3 py-2 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
                  <Gauge size={12} className="text-amber-700" />
                  <p className="text-[9px] font-black text-amber-900 uppercase tracking-widest">
                    Alterações de KM / Horário
                  </p>
                </div>
                <div className="divide-y divide-amber-50 max-h-36 overflow-auto">
                  {director.kmEntries.map((entry, i) => (
                    <div key={i} className="px-3 py-2 flex flex-wrap items-center gap-2 text-[9px]">
                      <span className="font-black text-gray-800 uppercase">{entry.fieldLabel}</span>
                      <span className="font-mono font-bold text-emerald-700">{entry.value}</span>
                      <span className="text-gray-500 font-bold">{entry.by}</span>
                      <span className="text-gray-400 font-mono ml-auto">{entry.at}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {director.aiSummary && (
              <div className="p-4 rounded-xl bg-indigo-950 text-white border border-indigo-800">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={14} className="text-indigo-300" />
                  <p className="text-[9px] font-black uppercase tracking-widest text-indigo-200">
                    Resumo IA — Objetivo
                  </p>
                </div>
                <p className="text-[12px] leading-relaxed text-indigo-50 font-medium">{director.aiSummary}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditSummaryPanel;
