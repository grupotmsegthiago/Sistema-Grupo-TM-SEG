import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Bell, BellRing, X, AlertTriangle } from 'lucide-react';

type DiagStatus = 'idle' | 'sent' | 'denied' | 'no-api' | 'error';

const PushNotificationManager = () => {
    const permissionGranted = useRef(false);
    const channelRef = useRef<any>(null);
    const [showTestBtn, setShowTestBtn] = useState(false);
    const [testStatus, setTestStatus] = useState<DiagStatus>('idle');
    const [diagMsg, setDiagMsg] = useState('');
    const [showDiagPanel, setShowDiagPanel] = useState(false);

    const getDiagnostics = () => {
        const lines: string[] = [];
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
        lines.push(`PWA instalado: ${isStandalone ? 'SIM ✅' : 'NÃO ❌ (abra pelo ícone na tela inicial)'}`);
        lines.push(`API Notification: ${'Notification' in window ? 'SIM ✅' : 'NÃO ❌'}`);
        if ('Notification' in window) {
            lines.push(`Permissão: ${Notification.permission}`);
        }
        lines.push(`Service Worker: ${'serviceWorker' in navigator ? 'SIM ✅' : 'NÃO ❌'}`);
        const ua = navigator.userAgent;
        const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        lines.push(`iOS: ${isIOS ? 'SIM' : 'NÃO'}`);
        lines.push(`User Agent: ${ua.substring(0, 80)}...`);
        return lines;
    };

    const sendTestNotification = async () => {
        setDiagMsg('');

        if (!('Notification' in window)) {
            setTestStatus('no-api');
            const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
            if (!isStandalone) {
                setDiagMsg('O app precisa ser instalado na tela inicial para notificações funcionarem no iPhone.');
            } else {
                setDiagMsg('Seu navegador não suporta notificações push.');
            }
            setTimeout(() => setTestStatus('idle'), 5000);
            return;
        }

        let permission = Notification.permission;

        if (permission === 'default') {
            try {
                permission = await Notification.requestPermission();
                permissionGranted.current = permission === 'granted';
            } catch {
                setTestStatus('error');
                setDiagMsg('Erro ao pedir permissão.');
                setTimeout(() => setTestStatus('idle'), 5000);
                return;
            }
        }

        if (permission === 'denied') {
            setTestStatus('denied');
            setDiagMsg('Permissão negada. No iPhone: Ajustes > TMSEG > Notificações > Permitir. Depois feche e reabra o app.');
            setTimeout(() => setTestStatus('idle'), 8000);
            return;
        }

        if (permission !== 'granted') {
            setTestStatus('denied');
            setDiagMsg(`Estado da permissão: "${permission}". Tente fechar e reabrir o app.`);
            setTimeout(() => setTestStatus('idle'), 5000);
            return;
        }

        const title = '🔔 Teste TMSEG';
        const body = 'Notificação push funcionando!\nCliente: TESTE\nOrigem: São Paulo - SP\nDestino: Campinas - SP';
        const tag = `test-${Date.now()}`;

        try {
            if ('serviceWorker' in navigator) {
                const reg = await navigator.serviceWorker.ready;
                await reg.showNotification(title, {
                    body,
                    icon: '/favicon.png',
                    badge: '/favicon.png',
                    tag,
                    vibrate: [200, 100, 200],
                    renotify: true
                });
                setTestStatus('sent');
                setDiagMsg('Notificação enviada! Verifique a central de notificações do iPhone.');
            } else {
                new Notification(title, { body, icon: '/favicon.png', tag });
                setTestStatus('sent');
                setDiagMsg('Notificação enviada via API direta.');
            }
        } catch (err: any) {
            setTestStatus('error');
            setDiagMsg(`Erro: ${err?.message || String(err)}`);
        }
        setTimeout(() => setTestStatus('idle'), 5000);
    };

    useEffect(() => {
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        if (!userData.name) return;

        setShowTestBtn(true);

        const isClientUser = userData.clientId || (userData.permissions || []).some((p: string) => p.startsWith('client_view:'));
        if (isClientUser) return;

        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().then(p => {
                permissionGranted.current = p === 'granted';
            });
        } else if ('Notification' in window && Notification.permission === 'granted') {
            permissionGranted.current = true;
        }

        const channel = supabase
            .channel('new-missions')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'missions'
            }, (payload: any) => {
                const mission = payload.new;
                if (!mission) return;

                const isAccident = (mission.current_location || '').includes('ACIDENTE');
                const title = isAccident
                    ? `🚨 ACIDENTE - Nova OS ${mission.id}`
                    : `📋 Nova OS Criada: ${mission.id}`;
                const body = `Cliente: ${mission.client || 'N/A'}\nOrigem: ${mission.origin || 'N/A'}\nDestino: ${mission.destination || 'N/A'}`;

                if (permissionGranted.current && navigator.serviceWorker?.controller) {
                    navigator.serviceWorker.controller.postMessage({
                        type: 'SHOW_NOTIFICATION',
                        title,
                        body,
                        tag: `mission-${mission.id}`
                    });
                } else if (permissionGranted.current) {
                    try {
                        new Notification(title, {
                            body,
                            icon: '/favicon.png',
                            tag: `mission-${mission.id}`,
                            requireInteraction: true
                        });
                    } catch {}
                }

                if (isAccident) {
                    try {
                        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgkKuumoFdT1qFpq6ij2BJSV+Cn6yljmRGR1uBnKujkWZMSVt/mqqhkWlQTVl8lqiekm1UUld4k6WckXBYVlVzj6GZkXNcWlNviqCXknZgXlBqhp2UkXljYU5mgo+TjnpmZUxig4yOinhqaEtffoiKdnJwaUlceoSGcXRzaktYdoCDbnZ3b0pTcn2Bcnh5cUxPbnp+cHt7c09Oa3d7cH18dVBMaHR5cYB+eFJKZXF2c4OBe1RIYm5zcYaCfVZGX2twcoiEgFhEXGhtc4qGg1pCWWVqc4yIhV0/VmJoc46KiF9AVGBmdI+LiWE+UF5kdJCNi2M8TV1jdJGOjGU7Slpic5KPjWc5R1hgcpOQj2k3RVZecJSRkGs1QlRcb5WSkW0zP1Fab5aTk281PVBYbZeVlHA7OlFXa5iWlXI5N09VapmXl3Q3NE1TaJqYmHY1Mk1SZpuZmXgzMEtQZZyamns0LklOZJ2bm308K0dNYp6cnX47KUZMYp+dnoBEJkVLYJ+eoIJDJERKX6CeoYRCI0JJXqGfo4ZBIUNIX6KgpIhAIEJHXaOhpYo/HkBGXKSippE+HUBFX6SipZM9HT9EXaWhpZQ9HD5DXKagppc8Gz1CW6ahp5g8GzxBWqehqJk7GjtAWaihqZs6GTo/WKmiqps5GTk+V6mjq506GDg9VqqkrJ43Fzc8Vaqlrp82Fjc7VKumr6A1FTY6U6ynr6E0FTU5UqsmsKIzFDQ5UawnseIyEzM4UKsoseMxEjI3T6sotOQwETI2TqsptecvEDE1TasqtugvDzA0TKsrtu0uDy8zS6sstewuDi4ySquttvAsDi4xSaqut/IrDS0wSKqvuPMqDSwvR6mwufQpDCsuRqmxuvYoDCotRamyuvgmCyksRKmzuvomCygrQ6m0u/wlCicqQqm1vP4kCiYpQam2vf8kCSUnP6m3vgAkCCQmPqq4vwIjByMlPaq5wAMjBiIkO6q6wQQiACEjOqq7wgYfACAhOaq8wwcfAB4gN6q9xAkdABwfNau+xAodABseNKy/xgsaABodM6zA');
                        audio.play().catch(() => {});
                    } catch {}
                }
            })
            .subscribe();

        channelRef.current = channel;

        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
            }
        };
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
                        <><Bell size={16} /> Negada - veja instrução</>
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
