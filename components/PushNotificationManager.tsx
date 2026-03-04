import { useEffect, useRef, useState } from 'react';
import { Bell, BellRing, X, AlertTriangle } from 'lucide-react';

type DiagStatus = 'idle' | 'sent' | 'denied' | 'no-api' | 'error';

function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

const PushNotificationManager = () => {
    const [showTestBtn, setShowTestBtn] = useState(false);
    const [testStatus, setTestStatus] = useState<DiagStatus>('idle');
    const [diagMsg, setDiagMsg] = useState('');
    const [showDiagPanel, setShowDiagPanel] = useState(false);
    const subscriptionRef = useRef<PushSubscription | null>(null);
    const subscribedRef = useRef(false);

    const getDiagnostics = () => {
        const lines: string[] = [];
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
        lines.push(`PWA instalado: ${isStandalone ? 'SIM ✅' : 'NÃO ❌'}`);
        lines.push(`API Notification: ${'Notification' in window ? 'SIM ✅' : 'NÃO ❌'}`);
        if ('Notification' in window) {
            lines.push(`Permissão: ${Notification.permission}`);
        }
        lines.push(`Service Worker: ${'serviceWorker' in navigator ? 'SIM ✅' : 'NÃO ❌'}`);
        lines.push(`PushManager: ${('PushManager' in window) ? 'SIM ✅' : 'NÃO ❌'}`);
        lines.push(`Subscription ativa: ${subscriptionRef.current ? 'SIM ✅' : 'NÃO ❌'}`);
        const ua = navigator.userAgent;
        const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        lines.push(`iOS: ${isIOS ? 'SIM' : 'NÃO'}`);
        lines.push(`User Agent: ${ua.substring(0, 80)}...`);
        return lines;
    };

    const subscribeToPush = async () => {
        if (subscribedRef.current) return subscriptionRef.current;
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;

        try {
            const vapidRes = await fetch('/api/push/vapid-key');
            const { publicKey } = await vapidRes.json();
            if (!publicKey) return null;

            const reg = await navigator.serviceWorker.ready;
            let sub = await reg.pushManager.getSubscription();

            if (!sub) {
                sub = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(publicKey)
                });
            }

            const userData = JSON.parse(localStorage.getItem('userData') || '{}');
            await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subscription: sub.toJSON(), userId: userData.name || sub.endpoint })
            });

            subscriptionRef.current = sub;
            subscribedRef.current = true;
            return sub;
        } catch (err) {
            console.error('[Push] Erro ao se inscrever:', err);
            return null;
        }
    };

    const sendTestNotification = async () => {
        setDiagMsg('');

        if (!('Notification' in window)) {
            setTestStatus('no-api');
            const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
            setDiagMsg(isStandalone
                ? 'Seu navegador não suporta notificações push.'
                : 'Instale o app na tela inicial para notificações funcionarem no iPhone.');
            setTimeout(() => setTestStatus('idle'), 5000);
            return;
        }

        let permission = Notification.permission;
        if (permission === 'default') {
            try {
                permission = await Notification.requestPermission();
            } catch {
                setTestStatus('error');
                setDiagMsg('Erro ao pedir permissão.');
                setTimeout(() => setTestStatus('idle'), 5000);
                return;
            }
        }

        if (permission !== 'granted') {
            setTestStatus('denied');
            setDiagMsg('Permissão negada. No iPhone: Ajustes > TMSEG > Notificações > Permitir. Feche e reabra o app.');
            setTimeout(() => setTestStatus('idle'), 8000);
            return;
        }

        setDiagMsg('Inscrevendo no push...');

        const sub = await subscribeToPush();
        if (!sub) {
            setTestStatus('error');
            setDiagMsg('❌ Não foi possível se inscrever no push. Verifique se está usando a PWA instalada.');
            setTimeout(() => setTestStatus('idle'), 5000);
            return;
        }

        setDiagMsg('Enviando notificação pelo servidor...');

        try {
            const res = await fetch('/api/push/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subscription: sub.toJSON() })
            });
            const data = await res.json();

            if (data.success) {
                setTestStatus('sent');
                setDiagMsg('✅ Notificação enviada pelo servidor! Verifique a tela de bloqueio / central de notificações.');
            } else {
                setTestStatus('error');
                setDiagMsg(`❌ Erro do servidor: ${data.error || 'desconhecido'}`);
            }
        } catch (err: any) {
            setTestStatus('error');
            setDiagMsg(`❌ Erro na requisição: ${err?.message || err}`);
        }

        setTimeout(() => setTestStatus('idle'), 8000);
    };

    useEffect(() => {
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        if (!userData.name) return;

        setShowTestBtn(true);

        if ('Notification' in window && Notification.permission === 'granted') {
            subscribeToPush();
        }
    }, []);

    if (!showTestBtn) return null;

    const btnBg = testStatus === 'sent' ? '#16a34a' : testStatus === 'denied' || testStatus === 'no-api' ? '#dc2626' : testStatus === 'error' ? '#d97706' : '#1e40af';

    return (
        <div className="fixed bottom-4 right-4 z-[9999] flex flex-col items-end gap-2" style={{ maxWidth: '90vw' }}>
            {diagMsg && (
                <div className="bg-gray-900 text-white text-[11px] p-3 rounded-lg shadow-xl max-w-[280px] leading-relaxed">
                    {diagMsg}
                </div>
            )}

            {showDiagPanel && (
                <div className="bg-gray-900 text-white text-[10px] p-3 rounded-lg shadow-xl max-w-[300px] leading-relaxed">
                    <div className="flex justify-between items-center mb-2">
                        <span className="font-bold text-xs">Diagnóstico Push</span>
                        <button onClick={() => setShowDiagPanel(false)}><X size={14} /></button>
                    </div>
                    {getDiagnostics().map((line, i) => (
                        <div key={i} className="py-0.5 border-b border-gray-700 last:border-0">{line}</div>
                    ))}
                </div>
            )}

            <div className="flex items-center gap-2">
                <button
                    onClick={() => setShowDiagPanel(!showDiagPanel)}
                    className="p-2.5 rounded-full shadow-lg bg-gray-700 text-white active:scale-95 transition-all"
                    data-testid="button-push-diag"
                >
                    <AlertTriangle size={14} />
                </button>
                <button
                    onClick={sendTestNotification}
                    data-testid="button-test-push"
                    className="flex items-center gap-2 px-4 py-3 rounded-full shadow-lg text-white text-xs font-bold transition-all active:scale-95"
                    style={{ background: btnBg }}
                >
                    {testStatus === 'sent' ? (
                        <><BellRing size={16} className="animate-bounce" /> Enviada!</>
                    ) : testStatus === 'denied' ? (
                        <><Bell size={16} /> Negada</>
                    ) : testStatus === 'no-api' ? (
                        <><Bell size={16} /> Não suportado</>
                    ) : testStatus === 'error' ? (
                        <><Bell size={16} /> Erro</>
                    ) : (
                        <><Bell size={16} /> Testar Push</>
                    )}
                </button>
            </div>
        </div>
    );
};

export default PushNotificationManager;
