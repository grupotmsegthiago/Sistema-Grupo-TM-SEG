import { useEffect, useRef } from 'react';
import { authFetch } from '../lib/authFetch';

function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
}

function getStableUserKey(): string | null {
    try {
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        // Preferir id ou email (estáveis); cair para name como último recurso
        return userData.id || userData.email || userData.name || null;
    } catch {
        return null;
    }
}

async function subscribeToPush(): Promise<PushSubscription | null> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;

    try {
        const vapidRes = await authFetch('/api/push/vapid-key');
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

        const userId = getStableUserKey() || sub.endpoint;
        await authFetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subscription: sub.toJSON(), userId })
        });

        return sub;
    } catch (err) {
        console.error('[Push] Erro ao se inscrever:', err);
        return null;
    }
}

const PushNotificationManager = () => {
    const subscribedRef = useRef(false);

    useEffect(() => {
        const userKey = getStableUserKey();
        if (!userKey) return;
        if (subscribedRef.current) return;

        if ('Notification' in window && Notification.permission === 'granted') {
            subscribedRef.current = true;
            subscribeToPush().catch(() => { subscribedRef.current = false; });
        }

        // Unsubscribe ao logout (App.tsx dispara este evento)
        const onLogout = async () => {
            try {
                if (!('serviceWorker' in navigator)) return;
                const reg = await navigator.serviceWorker.ready;
                const sub = await reg.pushManager.getSubscription();
                if (sub) {
                    await authFetch('/api/push/unsubscribe', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: userKey, endpoint: sub.endpoint })
                    }).catch(() => {});
                    await sub.unsubscribe().catch(() => {});
                }
            } catch { /* silencioso */ }
            subscribedRef.current = false;
        };
        window.addEventListener('tmseg:logout', onLogout);
        return () => window.removeEventListener('tmseg:logout', onLogout);
    }, []);

    return null;
};

export default PushNotificationManager;
