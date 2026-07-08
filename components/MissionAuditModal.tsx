import React from 'react';
import { X, ShieldCheck, AlertTriangle, MapPin, Clock, Route, CheckCircle2, XCircle } from 'lucide-react';
import type { MissionBillingAuditResult } from '../lib/missionBillingAudit';
import type { Mission } from '../types';

interface MissionAuditModalProps {
  mission: Mission;
  audit: MissionBillingAuditResult;
  onClose: () => void;
}

const fmtMoney = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtHours = (h: number) => {
  const totalMin = Math.round(h * 60);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return `${hours}h${mins.toString().padStart(2, '0')}`;
};

const fmtDateTime = (iso?: string | null) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
};

const shortRoute = (origin?: string, destination?: string) => {
  const cut = (s: string) => s.split(',')[0].split('-')[0].trim();
  const o = origin ? cut(origin) : '—';
  const d = destination ? cut(destination) : '—';
  return `${o} → ${d}`;
};

const SideStatusCard: React.FC<{
  title: string;
  side: MissionBillingAuditResult['client'];
  paymentLabel: string;
}> = ({ title, side, paymentLabel }) => {
  const ok = Math.abs(side.diferenca) < 0.005;
  return (
    <div className={`rounded-xl border-2 p-4 ${ok ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/40'}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-black uppercase text-gray-900">{title}</h3>
        <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-full ${ok ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
          {ok ? 'OK' : 'DIVERGENTE'}
        </span>
      </div>

      {side.tableName && (
        <p className="text-[10px] font-bold text-gray-600 mb-3 bg-white/80 px-2 py-1 rounded border border-gray-200">
          Tabela: {side.tableName}
        </p>
      )}

      <div className="grid grid-cols-3 gap-2 mb-3 text-center">
        <div className="bg-white rounded-lg p-2 border border-gray-200">
          <p className="text-[9px] font-bold text-gray-500 uppercase">Esperado</p>
          <p className="text-sm font-black text-gray-900">{fmtMoney(side.esperado)}</p>
        </div>
        <div className="bg-white rounded-lg p-2 border border-gray-200">
          <p className="text-[9px] font-bold text-gray-500 uppercase">{paymentLabel}</p>
          <p className="text-sm font-black text-gray-900">{fmtMoney(side.lancado)}</p>
        </div>
        <div className={`rounded-lg p-2 border ${ok ? 'bg-emerald-100 border-emerald-300' : 'bg-red-100 border-red-300'}`}>
          <p className="text-[9px] font-bold uppercase text-gray-600">Diferença</p>
          <p className={`text-sm font-black ${ok ? 'text-emerald-800' : 'text-red-800'}`}>{fmtMoney(side.diferenca)}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-3 text-[11px] space-y-1">
        <CalcLine label="Acionamento" value={fmtMoney(side.activation)} />
        <CalcLine label={`KM excedente (${side.kmExcedente} km × ${fmtMoney(side.valorKmUnit)})`} value={fmtMoney(side.subtotalKm)} />
        <CalcLine label={`Hora excedente (${fmtHours(side.horaExcedente)} × ${fmtMoney(side.valorHoraUnit)})`} value={fmtMoney(side.subtotalHora)} />
        <div className="border-t border-gray-100 pt-1 mt-1 flex justify-between font-black text-gray-900">
          <span>Total calculado</span>
          <span>{fmtMoney(side.esperado)}</span>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-gray-600">
        <span>KM rodado: <b>{side.kmRodado} km</b></span>
        <span>Franquia: <b>{side.franchiseKm} km / {fmtHours(side.franchiseHours)}</b></span>
        <span>Tempo: <b>{fmtHours(side.tempoExecutadoHours)}</b></span>
      </div>

      {side.motivos.length > 0 && (
        <div className="mt-3 bg-red-100 border border-red-200 rounded-lg p-2.5">
          <p className="text-[10px] font-black text-red-800 uppercase mb-1">Motivo da divergência</p>
          <ul className="text-xs text-red-900 space-y-1">
            {side.motivos.map((m) => (
              <li key={m} className="flex gap-1.5"><span>•</span><span>{m}</span></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const CalcLine: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex justify-between gap-2">
    <span className="text-gray-600">{label}</span>
    <span className="font-bold text-gray-800">{value}</span>
  </div>
);

const MissionAuditModal: React.FC<MissionAuditModalProps> = ({ mission, audit, onClose }) => {
  const headerColor =
    audit.overallStatus === 'validado'
      ? 'from-emerald-800 to-emerald-900'
      : audit.overallStatus === 'atencao'
        ? 'from-amber-700 to-amber-900'
        : 'from-red-800 to-red-900';

  const snap = (mission as any).snapshot_data;
  const startKm = (mission as any).start_km ?? mission.startKm;
  const endKm = (mission as any).end_km ?? mission.endKm;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-gray-50 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[94vh] overflow-hidden flex flex-col border border-gray-300 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-modal-title"
      >
        <div className={`bg-gradient-to-r ${headerColor} text-white p-5 shrink-0`}>
          <div className="flex justify-between items-start gap-4">
            <div className="min-w-0">
              <h2 id="audit-modal-title" className="text-lg font-black flex items-center gap-2">
                {audit.overallStatus === 'validado' ? <ShieldCheck size={20} /> : <AlertTriangle size={20} />}
                Resumo da Auditoria — {mission.id}
              </h2>
              <p className="text-sm mt-1 opacity-90 font-bold">
                {audit.overallIcon} {audit.overallLabel}
              </p>
              <p className="text-xs mt-2 opacity-80 truncate">{mission.client} · {mission.provider}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-full transition-colors shrink-0"
              aria-label="Fechar"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Operação */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="flex items-start gap-2">
              <Route size={14} className="text-gray-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-black text-gray-500 uppercase text-[9px]">Rota</p>
                <p className="font-bold text-gray-900">{shortRoute(mission.origin, mission.destination)}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <MapPin size={14} className="text-gray-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-black text-gray-500 uppercase text-[9px]">Medição</p>
                <p className="font-bold text-gray-900">{audit.resumo.operacao.kmRodado} km rodados</p>
                {startKm != null && endKm != null && (
                  <p className="text-gray-500 text-[10px]">{startKm} → {endKm}</p>
                )}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Clock size={14} className="text-gray-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-black text-gray-500 uppercase text-[9px]">Tempo</p>
                <p className="font-bold text-gray-900">{fmtHours(audit.resumo.operacao.duracaoHoras)}</p>
                <p className="text-gray-500 text-[10px]">
                  {fmtDateTime((mission as any).start_time || mission.startTime)} → {fmtDateTime((mission as any).end_time || mission.endTime)}
                </p>
              </div>
            </div>
          </div>

          {/* Resumo executivo */}
          <div
            className={`rounded-xl p-4 border-l-4 ${
              audit.overallStatus === 'validado'
                ? 'bg-emerald-50 border-emerald-600'
                : audit.overallStatus === 'atencao'
                  ? 'bg-amber-50 border-amber-600'
                  : 'bg-red-50 border-red-600'
            }`}
          >
            <p className="text-sm font-black text-gray-900 mb-2">Conclusão</p>
            <p className="text-sm text-gray-800 leading-relaxed">{audit.resumo.conclusao}</p>
            {audit.resumo.pontos.length > 0 && (
              <ul className="mt-3 space-y-1.5 text-sm text-gray-800">
                {audit.resumo.pontos.map((p) => (
                  <li key={p} className="flex gap-2">
                    <span className="text-gray-400 shrink-0">•</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {audit.skipped ? (
            <div className="bg-white border border-gray-200 rounded-xl p-6 text-center text-gray-600">
              <p className="font-bold">Auditoria indisponível</p>
              <p className="text-sm mt-1">{audit.skipReason}</p>
            </div>
          ) : (
            <>
              <SideStatusCard title="Cliente" side={audit.client} paymentLabel="Receita lançada" />
              <SideStatusCard title="Fornecedor" side={audit.provider} paymentLabel="Pagamento lançado" />
            </>
          )}

          {(snap || (mission as any).billing_verified_by) && (
            <div className="bg-slate-100 border border-slate-200 rounded-xl p-3 text-[10px] text-slate-700 space-y-1">
              {(mission as any).billing_verified_by && (
                <p><b>Conferido por:</b> {(mission as any).billing_verified_by}</p>
              )}
              {snap?.tableName && <p><b>Tabela cliente (snapshot):</b> {String(snap.tableName)}</p>}
              {(mission as any).revenue_edit_reason && (
                <p className="text-slate-600 truncate" title={(mission as any).revenue_edit_reason}>
                  <b>Histórico receita:</b> {(mission as any).revenue_edit_reason}
                </p>
              )}
              {(mission as any).cost_edit_reason && (
                <p className="text-slate-600 truncate" title={(mission as any).cost_edit_reason}>
                  <b>Histórico custo:</b> {(mission as any).cost_edit_reason}
                </p>
              )}
            </div>
          )}

          <div
            className={`rounded-xl p-4 text-center font-black text-sm uppercase ${
              audit.resultadoFinal === 'VALIDADO'
                ? 'bg-emerald-600 text-white'
                : 'bg-red-600 text-white'
            }`}
          >
            Resultado final: {audit.resultadoFinal}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MissionAuditModal;
