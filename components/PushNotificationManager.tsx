import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Bell, BellRing } from 'lucide-react';

const PushNotificationManager = () => {
    const permissionGranted = useRef(false);
    const channelRef = useRef<any>(null);
    const [showTestBtn, setShowTestBtn] = useState(false);
    const [testStatus, setTestStatus] = useState<'idle' | 'sent' | 'denied' | 'no-sw'>('idle');

    const sendTestNotification = () => {
        const title = '🔔 Teste TMSEG';
        const body = 'Notificação push funcionando!\nCliente: TESTE\nOrigem: São Paulo - SP\nDestino: Campinas - SP';
        const tag = `test-${Date.now()}`;

        if (!('Notification' in window)) {
            setTestStatus('denied');
            setTimeout(() => setTestStatus('idle'), 3000);
            return;
        }

        if (Notification.permission === 'default') {
            Notification.requestPermission().then(p => {
                if (p === 'granted') {
                    permissionGranted.current = true;
                    doSend(title, body, tag);
                } else {
                    setTestStatus('denied');
                    setTimeout(() => setTestStatus('idle'), 3000);
                }
            });
            return;
        }

        if (Notification.permission !== 'granted') {
            setTestStatus('denied');
            setTimeout(() => setTestStatus('idle'), 3000);
            return;
        }

        doSend(title, body, tag);
    };

    const doSend = (title: string, body: string, tag: string) => {
        if (navigator.serviceWorker?.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'SHOW_NOTIFICATION',
                title,
                body,
                tag
            });
            setTestStatus('sent');
        } else if (navigator.serviceWorker) {
            navigator.serviceWorker.ready.then(reg => {
                reg.showNotification(title, {
                    body,
                    icon: '/favicon.png',
                    badge: '/favicon.png',
                    tag,
                    vibrate: [200, 100, 200],
                    requireInteraction: true,
                    renotify: true
                });
                setTestStatus('sent');
            }).catch(() => {
                try {
                    new Notification(title, { body, icon: '/favicon.png', tag });
                    setTestStatus('sent');
                } catch {
                    setTestStatus('no-sw');
                }
            });
        } else {
            try {
                new Notification(title, { body, icon: '/favicon.png', tag });
                setTestStatus('sent');
            } catch {
                setTestStatus('no-sw');
            }
        }
        setTimeout(() => setTestStatus('idle'), 3000);
    };

    useEffect(() => {
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        if (!userData.name) return;

        const isAdmin = (userData.role || '').toLowerCase() === 'administrador' || (userData.role || '').toLowerCase() === 'diretoria';
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

    return (
        <div className="fixed bottom-4 right-4 z-[9999]">
            <button
                onClick={sendTestNotification}
                data-testid="button-test-push"
                className="flex items-center gap-2 px-4 py-3 rounded-full shadow-lg text-white text-xs font-bold transition-all active:scale-95"
                style={{
                    background: testStatus === 'sent' ? '#16a34a' : testStatus === 'denied' ? '#dc2626' : '#1e40af',
                }}
            >
                {testStatus === 'sent' ? (
                    <><BellRing size={16} className="animate-bounce" /> Enviada!</>
                ) : testStatus === 'denied' ? (
                    <><Bell size={16} /> Permissão negada</>
                ) : testStatus === 'no-sw' ? (
                    <><Bell size={16} /> Instale como PWA</>
                ) : (
                    <><Bell size={16} /> Testar Push</>
                )}
            </button>
        </div>
    );
};

export default PushNotificationManager;
