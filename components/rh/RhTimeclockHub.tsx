import React, { useState } from 'react';
import { Clock, BarChart3, History, Activity } from 'lucide-react';
import RhPageHeader from './shared/RhPageHeader';
import TimeClockSystem from '../TimeClockSystem';
import RHPointReport from '../RHPointReport';
import RhTimeclockHistory from './RhTimeclockHistory';
import RhPresenceReport from './RhPresenceReport';

const RhTimeclockHub: React.FC = () => {
  const [tab, setTab] = useState<'registro' | 'historico' | 'relatorio' | 'presenca'>('registro');

  const tabBtn = (id: typeof tab, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase ${tab === id ? 'bg-black text-white' : 'bg-white border text-gray-600'}`}
    >
      {icon} {label}
    </button>
  );

  return (
    <div>
      <RhPageHeader title="Folha de Ponto" subtitle="Registro facial, histórico e relatórios de jornada" icon={Clock} />

      <div className="flex flex-wrap gap-2 mb-4">
        {tabBtn('registro', 'Registro', <Clock size={14} />)}
        {tabBtn('historico', 'Histórico', <History size={14} />)}
        {tabBtn('presenca', 'Presença ao vivo', <Activity size={14} />)}
        {tabBtn('relatorio', 'Relatório folha', <BarChart3 size={14} />)}
      </div>

      {tab === 'registro' && <TimeClockSystem />}
      {tab === 'historico' && <RhTimeclockHistory />}
      {tab === 'presenca' && <RhPresenceReport />}
      {tab === 'relatorio' && <RHPointReport />}
    </div>
  );
};

export default RhTimeclockHub;
