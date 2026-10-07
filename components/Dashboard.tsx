import React from 'react';
import { Newspaper } from 'lucide-react';
import OperationalInfoPanel from './OperationalInfoPanel';
import TmsegNews from './TmsegNews';
import PendingTollConfirmationBanner from './PendingTollConfirmationBanner';
import ManualOverrideLooseBanner from './ManualOverrideLooseBanner';

interface DashboardProps {
    onOpenMission?: (missionId: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onOpenMission }) => {
  return (
    <div className="space-y-8 animate-in fade-in pb-20">

        <PendingTollConfirmationBanner onOpenMission={onOpenMission} />

        <ManualOverrideLooseBanner />

        <TmsegNews />

        <div>
            <div className="flex items-center gap-3 mb-4 px-2">
                <div className="p-2 bg-white rounded-lg shadow-sm border border-gray-200 text-gray-700">
                    <Newspaper size={20} />
                </div>
                <h2 className="text-xl font-bold text-gray-800">Informações da operação</h2>
            </div>
            <OperationalInfoPanel />
        </div>

    </div>
  );
};

export default Dashboard;