import React, { useState } from 'react';
import { Clock, BarChart3 } from 'lucide-react';
import RhPageHeader from './shared/RhPageHeader';
import TimeClockSystem from '../TimeClockSystem';
import RHPointReport from '../RHPointReport';
import { canViewTimeclockReport, getRhUser } from '../../lib/rh/permissions';

const RhTimeclockHub: React.FC = () => {
  const rhUser = getRhUser();
  const showReport = canViewTimeclockReport(rhUser);
  const [tab, setTab] = useState<'registro' | 'relatorio'>(showReport ? 'relatorio' : 'registro');

  return (
    <div>
      <RhPageHeader title="Folha de Ponto" subtitle={showReport ? 'Auditoria RH e registros de jornada' : 'Registro de jornada'} icon={Clock} />

      {showReport && (
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setTab('relatorio')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase ${tab === 'relatorio' ? 'bg-black text-white' : 'bg-white border text-gray-600'}`}
          >
            <BarChart3 size={14} /> Relatório de ponto
          </button>
          <button
            type="button"
            onClick={() => setTab('registro')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase ${tab === 'registro' ? 'bg-black text-white' : 'bg-white border text-gray-600'}`}
          >
            <Clock size={14} /> Registro manual
          </button>
        </div>
      )}

      {showReport && tab === 'relatorio' ? <RHPointReport /> : <TimeClockSystem />}
    </div>
  );
};

export default RhTimeclockHub;
