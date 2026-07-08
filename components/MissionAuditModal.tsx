import React from 'react';
import { X, ShieldCheck, AlertTriangle } from 'lucide-react';
import type { MissionBillingAuditResult } from '../lib/missionBillingAudit';

interface MissionAuditModalProps {
  missionId: string;
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

const SideBlock: React.FC<{
  title: string;
  audit: MissionBillingAuditResult['client'];
  paymentLabel: string;
}> = ({ title, audit, paymentLabel }) => (
  <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
    <div className="flex items-center justify-between border-b border-gray-100 pb-2">
      <h3 className="text-sm font-black uppercase text-gray-800">{title}</h3>
      <span className={`text-[10px] font-black px-2 py-0.5 rounded ${audit.status === 'validado' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
        {audit.status === 'validado' ? 'VALIDADO' : 'ERRO'}
      </span>
    </div>
    {audit.tableName && (
      <p className="text-[10px] text-gray-500 font-bold">Tabela: {audit.tableName}</p>
    )}
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
      <Row label="Acionamento" value={fmtMoney(audit.activation)} />
      <Row label="Franquia KM" value={`${audit.franchiseKm} km`} />
      <Row label="KM Rodado" value={`${audit.kmRodado} km`} />
      <Row label="KM Excedente" value={`${audit.kmExcedente} km`} />
      <Row label="Valor KM" value={fmtMoney(audit.valorKmUnit)} />
      <Row label="Subtotal KM" value={fmtMoney(audit.subtotalKm)} />
      <Row label="Franquia Hora" value={fmtHours(audit.franchiseHours)} />
      <Row label="Tempo Executado" value={fmtHours(audit.tempoExecutadoHours)} />
      <Row label="Hora Excedente" value={fmtHours(audit.horaExcedente)} />
      <Row label="Valor Hora" value={fmtMoney(audit.valorHoraUnit)} />
      <Row label="Subtotal Hora" value={fmtMoney(audit.subtotalHora)} />
    </div>
    <div className="border-t border-gray-100 pt-3 grid grid-cols-1 gap-2 text-xs font-bold">
      <Row label="Receita Esperada" value={fmtMoney(audit.esperado)} highlight="green" />
      <Row label={paymentLabel} value={fmtMoney(audit.lancado)} />
      <Row
        label="Diferença"
        value={fmtMoney(audit.diferenca)}
        highlight={Math.abs(audit.diferenca) < 0.005 ? 'green' : 'red'}
      />
    </div>
    {audit.motivos.length > 0 && (
      <div className="bg-red-50 border border-red-100 rounded-lg p-2">
        <p className="text-[10px] font-black text-red-700 uppercase mb-1">Motivo</p>
        <ul className="text-xs text-red-800 space-y-0.5">
          {audit.motivos.map((m) => (
            <li key={m}>• {m}</li>
          ))}
        </ul>
      </div>
    )}
  </div>
);

const Row: React.FC<{ label: string; value: string; highlight?: 'green' | 'red' }> = ({
  label,
  value,
  highlight,
}) => (
  <div className="flex justify-between gap-2">
    <span className="text-gray-500 font-medium">{label}</span>
    <span
      className={`font-bold ${
        highlight === 'green' ? 'text-emerald-700' : highlight === 'red' ? 'text-red-700' : 'text-gray-900'
      }`}
    >
      {value}
    </span>
  </div>
);

const MissionAuditModal: React.FC<MissionAuditModalProps> = ({ missionId, audit, onClose }) => {
  const headerColor =
    audit.overallStatus === 'validado'
      ? 'from-emerald-800 to-emerald-900'
      : audit.overallStatus === 'atencao'
        ? 'from-amber-700 to-amber-900'
        : 'from-red-800 to-red-900';

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-gray-50 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col border border-gray-300">
        <div className={`bg-gradient-to-r ${headerColor} text-white p-5 flex justify-between items-start shrink-0`}>
          <div>
            <h2 className="text-lg font-black flex items-center gap-2">
              {audit.overallStatus === 'validado' ? (
                <ShieldCheck size={20} />
              ) : (
                <AlertTriangle size={20} />
              )}
              Auditoria Financeira — {missionId}
            </h2>
            <p className="text-sm mt-1 opacity-90">
              {audit.overallIcon} {audit.overallLabel}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {audit.skipped ? (
            <div className="bg-white border border-gray-200 rounded-xl p-6 text-center text-gray-600">
              <p className="font-bold">Auditoria indisponível para esta OS.</p>
              <p className="text-sm mt-1">{audit.skipReason}</p>
            </div>
          ) : (
            <>
              <SideBlock title="Cliente" audit={audit.client} paymentLabel="Receita Lançada" />
              <SideBlock title="Fornecedor" audit={audit.provider} paymentLabel="Pagamento Lançado" />
            </>
          )}

          <div
            className={`rounded-xl p-4 text-center font-black text-sm uppercase ${
              audit.resultadoFinal === 'VALIDADO'
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                : 'bg-red-100 text-red-800 border border-red-200'
            }`}
          >
            Resultado Final: {audit.resultadoFinal}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MissionAuditModal;
