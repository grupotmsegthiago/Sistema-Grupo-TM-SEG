import React from 'react';
import GcDashboard from './comercial/GcDashboard';
import GcIntelligence from './comercial/GcIntelligence';
import GcGoals from './comercial/GcGoals';
import GcCommissions from './comercial/GcCommissions';
import GcRanking from './comercial/GcRanking';
import GcClientHealth from './comercial/GcClientHealth';
import GcClientCard from './comercial/GcClientCard';
import GcPipeline from './comercial/GcPipeline';
import GcAgenda from './comercial/GcAgenda';
import GcMeetings from './comercial/GcMeetings';
import GcReps from './comercial/GcReps';
import GcSettings from './comercial/GcSettings';
import GcPermissions from './comercial/GcPermissions';

interface GcModuleProps {
  screen: string;
  selectedId: string | null;
  onNavigate: (screen: string) => void;
  onEdit: (screen: string, id: string) => void;
}

/**
 * Shell do framework de Gestores — hoje só Comercial.
 * Futuros gestores (Operacional, Financeiro…) entram como novos cases/prefixos.
 */
const GcModule: React.FC<GcModuleProps> = ({ screen, selectedId, onNavigate, onEdit }) => {
  const go = (next: string, id?: string) => {
    if (id) onEdit(next, id);
    else onNavigate(next);
  };

  switch (screen) {
    case 'gc-dashboard':
      return <GcDashboard onNavigate={go} />;
    case 'gc-intelligence':
      return <GcIntelligence onNavigate={go} />;
    case 'gc-goals':
      return <GcGoals />;
    case 'gc-commissions':
      return <GcCommissions />;
    case 'gc-ranking':
      return <GcRanking />;
    case 'gc-client-health':
      return <GcClientHealth onNavigate={go} />;
    case 'gc-client-card':
      return <GcClientCard clientId={selectedId} onBack={() => onNavigate('gc-client-health')} />;
    case 'gc-pipeline':
      return <GcPipeline />;
    case 'gc-agenda':
      return <GcAgenda />;
    case 'gc-meetings':
      return <GcMeetings />;
    case 'gc-reps':
      return <GcReps />;
    case 'gc-settings':
      return <GcSettings />;
    case 'gc-permissions':
      return <GcPermissions onNavigate={onNavigate} />;
    default:
      return <GcDashboard onNavigate={go} />;
  }
};

export default GcModule;
