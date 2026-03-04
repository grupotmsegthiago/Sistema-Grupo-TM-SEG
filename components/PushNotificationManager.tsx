import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

const PushNotificationManager = () => {
    const permissionGranted = useRef(false);
    const channelRef = useRef<any>(null);

    useEffect(() => {
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        if (!userData.name) return;

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

    return null;
};

export default PushNotificationManager;
