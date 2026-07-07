import React, { useState } from 'react';
import { Clock, BarChart3 } from 'lucide-react';
import RhPageHeader from './shared/RhPageHeader';
import TimeClockSystem from '../TimeClockSystem';
import RHPointReport from '../RHPointReport';

const RhTimeclockHub: React.FC = () => {
  const [tab, setTab] = useState<'registro' | 'relatorio'>('registro');

  return (
    <div>
      <RhPageHeader title="Folha de Ponto" subtitle="Registro facial e relatórios de jornada" icon={Clock} />

      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setTab('registro')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase ${tab === 'registro' ? 'bg-black text-white' : 'bg-white border text-gray-600'}`}
        >
          <Clock size={14} /> Registro de ponto
        </button>
        <button
          type="button"
          onClick={() => setTab('relatorio')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase ${tab === 'relatorio' ? 'bg-black text-white' : 'bg-white border text-gray-600'}`}
        >
          <BarChart3 size={14} /> Relatório de ponto
        </button>
      </div>

      {tab === 'registro' ? <TimeClockSystem /> : <RHPointReport />}
    </div>
  );
};

export default RhTimeclockHub;
