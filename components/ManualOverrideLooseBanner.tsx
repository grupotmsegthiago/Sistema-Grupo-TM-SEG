import React, { useEffect, useState } from 'react';
import { AlertTriangle, ChevronRight } from 'lucide-react';

type Settings = {
    threshold: number;
    windowDays: number;
    cooldownHours: number;
};

const ALLOWED_ROLES = ['financeiro', 'diretoria', 'administrador'];

const isAllowedRole = (): boolean => {
    try {
        const u = JSON.parse(localStorage.getItem('userData') || '{}');
        const r = String(u.role || '').toLowerCase().trim();
        return ALLOWED_ROLES.includes(r);
    } catch {
        return false;
    }
};

const ManualOverrideLooseBanner: React.FC = () => {
    const [settings, setSettings] = useState<Settings | null>(null);
    const [allowed] = useState<boolean>(() => isAllowedRole());

    useEffect(() => {
        if (!allowed) return;
        let aborted = false;
        (async () => {
            try {
                const token = localStorage.getItem('authToken');
                const res = await fetch('/api/admin/manual-override-settings', {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                if (!res.ok) return;
                const json = await res.json();
                if (aborted || !json?.ok || !json?.settings) return;
                setSettings({
                    threshold: Number(json.settings.threshold),
                    windowDays: Number(json.settings.windowDays),
                    cooldownHours: Number(json.settings.cooldownHours),
                });
            } catch { /* silencioso */ }
        })();
        return () => { aborted = true; };
    }, [allowed]);

    if (!allowed || !settings) return null;

    const isLoose = settings.threshold > 50 || settings.windowDays > 30 || settings.cooldownHours > 72;
    if (!isLoose) return null;

    const goToSettings = () => {
        try {
            window.dispatchEvent(new CustomEvent('tmseg:navigate', { detail: 'manual-override-settings' }));
        } catch { /* ignore */ }
    };

    return (
        <div
            className="bg-gradient-to-r from-yellow-50 to-amber-50 border-2 border-yellow-300 rounded-2xl p-5 shadow-sm"
            data-testid="banner-dashboard-manual-override-loose"
        >
            <div className="flex items-start gap-3">
                <div className="p-2 bg-yellow-500 text-white rounded-lg flex-shrink-0">
                    <AlertTriangle size={18} />
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-black uppercase tracking-tight text-yellow-900">
                        Alerta de Edições Manuais com Configuração Frouxa
                    </h3>
                    <p className="text-[11px] text-yellow-800 mt-0.5 leading-relaxed">
                        O alerta está praticamente desligado e pode estar deixando passar edições suspeitas. Ajuste para o piso recomendado: limite ≤ 50, janela ≤ 30 dias e cooldown ≤ 72 h.
                    </p>
                    <p className="text-[11px] text-yellow-900 mt-2">
                        Configuração atual: limite{' '}
                        <strong data-testid="text-dashboard-override-threshold">{settings.threshold}</strong> edições · janela{' '}
                        <strong data-testid="text-dashboard-override-window">{settings.windowDays}</strong> dia(s) · cooldown{' '}
                        <strong data-testid="text-dashboard-override-cooldown">{settings.cooldownHours}</strong> h.
                    </p>
                </div>
                <button
                    onClick={goToSettings}
                    className="flex items-center gap-1 bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-bold px-3 py-2 rounded-lg whitespace-nowrap"
                    data-testid="button-dashboard-open-manual-override-settings"
                >
                    Ajustar agora
                    <ChevronRight size={14} />
                </button>
            </div>
        </div>
    );
};

export default ManualOverrideLooseBanner;
