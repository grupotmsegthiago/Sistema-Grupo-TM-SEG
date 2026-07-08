import React from 'react';
import RhDashboard from './RhDashboard';
import RhEmployeeList from './RhEmployeeList';
import RhEmployeeWorkspace from './RhEmployeeWorkspace';
import RhTimeclockHub from './RhTimeclockHub';

interface RhModuleProps {
  screen: string;
  selectedId: string | null;
  onNavigate: (screen: string) => void;
  onEdit: (screen: string, id: string) => void;
}

const RhModule: React.FC<RhModuleProps> = ({ screen, selectedId, onNavigate, onEdit }) => {
  const openWorkspace = (id?: string) => {
    if (id) onEdit('rh-employee-workspace', id);
    else onNavigate('rh-employee-workspace');
  };

  switch (screen) {
    case 'rh-dashboard':
      return <RhDashboard />;

    case 'rh-employees':
      return (
        <RhEmployeeList
          onAdd={() => openWorkspace()}
          onOpen={(id) => openWorkspace(id)}
        />
      );

    case 'rh-employee-workspace':
      return (
        <RhEmployeeWorkspace
          id={selectedId}
          onBack={() => onNavigate('rh-employees')}
          onSaved={(id) => onEdit('rh-employee-workspace', id)}
        />
      );

    case 'rh-timeclock':
    case 'rh-point-report':
      return <RhTimeclockHub />;

    // Compatibilidade com permissões / links antigos
    case 'rh-employee-form':
    case 'rh-employee-profile':
      return (
        <RhEmployeeWorkspace
          id={selectedId}
          onBack={() => onNavigate('rh-employees')}
          onSaved={(id) => onEdit('rh-employee-workspace', id)}
        />
      );

    default:
      if (screen.startsWith('rh-')) return <RhDashboard />;
      return <RhDashboard />;
  }
};

export default RhModule;
