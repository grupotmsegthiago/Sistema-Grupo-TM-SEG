
import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { X, CheckCircle2, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { supabase } from './supabase';

type NotificationType = 'success' | 'error' | 'warning' | 'info';

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  dedupKey?: string;
}

interface NotificationContextData {
  showNotification: (title: string, message: string, type?: NotificationType, dedupKey?: string) => void;
  isSoundEnabled: boolean;
  toggleSound: () => void;
  requestPermission: () => Promise<void>;
  permission: NotificationPermission;
}

const MAX_VISIBLE_TOASTS = 5;
const TOAST_TTL_MS = 6000;

const NotificationContext = createContext<NotificationContextData>({} as NotificationContextData);

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

// Beep sintético via WebAudio (não depende de URL externa nem de arquivo de áudio).
// iOS exige interação prévia para áudio — falhamos silenciosamente quando bloqueado.
let audioCtx: AudioContext | null = null;
function playBeep() {
  try {
    if (typeof window === 'undefined') return;
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.12);
  } catch { /* silencioso */ }
}

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? (Notification.permission as NotificationPermission) : 'default'
  );

  // Dedup: guarda chaves recentes por 8s para evitar toasts duplicados
  // (Realtime do Supabase pode reentregar a mesma linha em reconnect/retry).
  const recentKeysRef = useRef<Map<string, number>>(new Map());
  const isSoundEnabledRef = useRef(isSoundEnabled);
  isSoundEnabledRef.current = isSoundEnabled;

  useEffect(() => {
    const storedSound = localStorage.getItem('notificationSound');
    if (storedSound !== null) setIsSoundEnabled(storedSound === 'true');
  }, []);

  const toggleSound = useCallback(() => {
    setIsSoundEnabled(prev => {
      const newVal = !prev;
      localStorage.setItem('notificationSound', String(newVal));
      return newVal;
    });
  }, []);

  const showNotification = useCallback(
    (title: string, message: string, type: NotificationType = 'info', dedupKey?: string) => {
      // Dedup
      if (dedupKey) {
        const map = recentKeysRef.current;
        const now = Date.now();
        // GC: remove chaves antigas
        for (const [k, t] of map.entries()) {
          if (now - t > 8000) map.delete(k);
        }
        if (map.has(dedupKey)) return;
        map.set(dedupKey, now);
      }

      const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      setNotifications((prev) => {
        const next = [...prev, { id, type, title, message, dedupKey }];
        // Limita a fila a MAX_VISIBLE_TOASTS removendo os mais antigos
        return next.length > MAX_VISIBLE_TOASTS ? next.slice(next.length - MAX_VISIBLE_TOASTS) : next;
      });

      if (isSoundEnabledRef.current) playBeep();

      setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
      }, TOAST_TTL_MS);
    },
    []
  );

  const showNotificationRef = useRef(showNotification);
  showNotificationRef.current = showNotification;

  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') {
      showNotification('Notificações Ativadas', 'Você receberá alertas operacionais em tempo real.', 'success');
    }
  }, [showNotification]);

  // ESCUTADOR GLOBAL DE LOGS DO SISTEMA (REALTIME)
  // Único subscribe; reconexão automática feita pelo próprio supabase-js.
  useEffect(() => {
    const channel = supabase
      .channel('global-system-broadcast')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'system_logs' },
        (payload) => {
          const log: any = payload.new;
          if (!log) return;

          // Ignora logs silenciosos para não poluir
          if (['HEARTBEAT', 'LOGIN', 'LOGOUT', 'OTHER'].includes(log.action_type)) return;

          let title = 'Atualização do Sistema';
          let type: NotificationType = 'info';

          switch (log.entity) {
            case 'Mission': title = 'Movimentação de OS'; type = 'info'; break;
            case 'Client': title = 'Cadastro de Clientes'; type = 'success'; break;
            case 'Provider': title = 'Gestão de Fornecedores'; type = 'warning'; break;
            case 'FinancialTransaction': title = 'Movimento Financeiro'; type = 'success'; break;
            case 'Vehicle': title = 'Frota / Viaturas'; type = 'warning'; break;
            case 'User': title = 'Controle de Acesso'; type = 'error'; break;
          }
          if (log.action_type === 'DELETE') type = 'error';

          const userName = (log.user_name || '').toString().toUpperCase() || 'SISTEMA';
          const message = `${userName}: ${log.details ?? ''}`;

          // Dedup pelo id do log para evitar repetição em reconnect
          const dedupKey = log.id ? `log-${log.id}` : `${log.action_type}-${log.entity}-${log.created_at}`;
          showNotificationRef.current(title, message, type, dedupKey);
        }
      )
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Realtime] Canal global-system-broadcast conectado.');
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`[Realtime] global-system-broadcast: ${status} (supabase-js fará retry automaticamente)`);
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <NotificationContext.Provider value={{ showNotification, isSoundEnabled, toggleSound, requestPermission, permission }}>
      {children}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 w-full max-w-md pointer-events-none p-4">
        {notifications.map((notification) => {
          const isInfo = notification.type === 'info';
          const isSuccess = notification.type === 'success';
          const isError = notification.type === 'error';
          const isWarning = notification.type === 'warning';
          const borderColor = isError ? 'border-l-red-600' : isWarning ? 'border-l-amber-500' : isSuccess ? 'border-l-green-500' : 'border-l-red-500';
          const bg = isInfo ? 'bg-gray-900 text-white' : 'bg-white text-gray-800';
          const msgColor = isInfo ? 'text-gray-300' : 'text-gray-600';
          return (
            <div
              key={notification.id}
              data-testid={`toast-${notification.type}-${notification.id}`}
              className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl shadow-2xl border-l-4 transition-all duration-500 animate-in slide-in-from-right relative overflow-hidden ${bg} ${borderColor}`}
            >
              <div className="mt-0.5 shrink-0">
                {isSuccess && <CheckCircle2 size={22} className="text-green-600" />}
                {isWarning && <AlertTriangle size={22} className="text-amber-500" />}
                {isError && <AlertCircle size={22} className="text-red-600" />}
                {isInfo && <Info size={22} className="text-red-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-black leading-tight mb-1 uppercase tracking-tight">{notification.title}</h4>
                <p className={`text-xs leading-relaxed font-medium ${msgColor}`}>{notification.message}</p>
              </div>
              <button
                onClick={() => setNotifications(prev => prev.filter(n => n.id !== notification.id))}
                className="text-gray-400 hover:text-red-500 transition-colors"
                data-testid={`button-close-toast-${notification.id}`}
                aria-label="Fechar notificação"
              >
                <X size={18} />
              </button>
              <div className="absolute bottom-0 left-0 h-1 w-full bg-black/10">
                <div className="h-full bg-red-600 animate-shrink origin-left" style={{ animationDuration: `${TOAST_TTL_MS}ms` }}></div>
              </div>
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes shrink { from { transform: scaleX(1); } to { transform: scaleX(0); } }
        .animate-shrink { animation-name: shrink; animation-timing-function: linear; animation-fill-mode: forwards; }
      `}</style>
    </NotificationContext.Provider>
  );
};
