import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { authFetch } from '../lib/authFetch';
import type { PatrimonioComplianceResponse } from '../lib/patrimonioSelfServiceTypes';
import type { EquipmentRecord } from '../lib/equipmentRecovery';
import PatrimonioSelfServiceWizard from './PatrimonioSelfServiceWizard';

interface Props {
  userId: string;
  userName: string;
  userRole?: string;
  onComplete: () => void;
}

export default function PatrimonioComplianceGate({ userId, userName, userRole, onComplete }: Props) {
  const [loading, setLoading] = useState(true);
  const [compliance, setCompliance] = useState<PatrimonioComplianceResponse | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const resp = await authFetch('/api/patrimonio/my/compliance');
        const data = await resp.json();
        if (resp.ok) {
          setCompliance(data);
          if (!data.required || data.status === 'completed') {
            onComplete();
            setDismissed(true);
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId, onComplete]);

  if (dismissed) return null;

  if (loading) {
    return (
      <div className="fixed inset-0 z-[9997] bg-slate-950 flex items-center justify-center">
        <Loader2 className="animate-spin text-white" size={32} />
      </div>
    );
  }

  if (!compliance?.required || compliance.status === 'completed') return null;

  const initialEquipments: EquipmentRecord[] =
    compliance.status === 'declared' ? (compliance.equipments || []) : [];

  return (
    <PatrimonioSelfServiceWizard
      userId={userId}
      userName={userName}
      userRole={userRole}
      initialEquipments={initialEquipments}
      onComplete={() => {
        setDismissed(true);
        onComplete();
      }}
    />
  );
}
