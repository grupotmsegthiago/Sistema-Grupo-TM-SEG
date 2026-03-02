
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { X, CheckCircle2, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { supabase } from './supabase';

type NotificationType = 'success' | 'error' | 'warning' | 'info';

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
}

interface NotificationContextData {
  showNotification: (title: string, message: string, type?: NotificationType) => void;
  isSoundEnabled: boolean;
  toggleSound: () => void;
  requestPermission: () => Promise<void>;
  permission: NotificationPermission;
}

const NotificationContext = createContext<NotificationContextData>({} as NotificationContextData);

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? (Notification.permission as NotificationPermission) : 'default'
  );
  
  const [audio] = useState(new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'));

  useEffect(() => {
      const storedSound = localStorage.getItem('notificationSound');
      if (storedSound !== null) {
          setIsSoundEnabled(storedSound === 'true');
      }
  }, []);

  const toggleSound = useCallback(() => {
      setIsSoundEnabled(prev => {
          const newVal = !prev;
          localStorage.setItem('notificationSound', String(newVal));
          return newVal;
      });
  }, []);

  const requestPermission = useCallback(async () => {
      if (!('Notification' in window)) return;
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === 'granted') {
          showNotification('Notificações Ativadas', 'Você receberá alertas operacionais em tempo real.', 'success');
      }
  }, []);

  const sendBrowserNotification = useCallback((title: string, body: string) => {
      if (permission === 'granted' && 'Notification' in window) {
          try {
              new Notification(title, {
                  body,
                  icon: '/logo.png',
                  silent: !isSoundEnabled
              });
          } catch (e) {
              console.error("Erro ao enviar notificação nativa", e);
          }
      }
  }, [permission, isSoundEnabled]);

  const showNotification = useCallback((title: string, message: string, type: NotificationType = 'info') => {
    const id = Math.random().toString(36).substring(2);
    const newNotification = { id, type, title, message };

    setNotifications((prev) => [...prev, newNotification]);

    if (isSoundEnabled) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
    }

    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 6000);
  }, [isSoundEnabled, audio]);

  // ESCUTADOR GLOBAL DE LOGS DO SISTEMA (REALTIME)
  useEffect(() => {
    const channel = supabase
      .channel('global-system-broadcast')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'system_logs'
        },
        (payload) => {
          const log = payload.new;
          if (!log) return;

          // Ignora logs silenciosos para não poluir
          if (['HEARTBEAT', 'LOGIN', 'LOGOUT', 'OTHER'].includes(log.action_type)) return;

          let title = 'Atualização do Sistema';
          let type: NotificationType = 'info';

          // Personalização baseada no tipo de dado
          switch (log.entity) {
              case 'Mission': title = 'Movimentação de OS'; type = 'info'; break;
              case 'Client': title = 'Cadastro de Clientes'; type = 'success'; break;
              case 'Provider': title = 'Gestão de Fornecedores'; type = 'warning'; break;
              case 'FinancialTransaction': title = 'Movimento Financeiro'; type = 'success'; break;
              case 'Vehicle': title = 'Frota / Viaturas'; type = 'warning'; break;
              case 'User': title = 'Controle de Acesso'; type = 'error'; break;
          }

          if (log.action_type === 'DELETE') type = 'error';

          const userName = log.user_name?.toUpperCase() || 'SISTEMA';
          const message = `${userName}: ${log.details}`;
          
          // 1. Toast interno
          showNotification(title, message, type);

          // 2. Notificação Push (apenas se a aba não estiver visível ou for OS)
          if (document.hidden || log.entity === 'Mission') {
              sendBrowserNotification(title, message);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [showNotification, sendBrowserNotification]);

  return (
    <NotificationContext.Provider value={{ showNotification, isSoundEnabled, toggleSound, requestPermission, permission }}>
      {children}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 w-full max-w-md pointer-events-none p-4">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className={`
              pointer-events-auto flex items-start gap-3 p-4 rounded-xl shadow-2xl border-l-4 transition-all duration-500 animate-in slide-in-from-right relative overflow-hidden
              ${notification.type === 'info' ? 'bg-gray-900 border-l-red-500 text-white' : 'bg-white border-l-green-500 text-gray-800'}
              ${notification.type === 'error' ? 'border-l-red-600' : ''}
              ${notification.type === 'warning' ? 'border-l-amber-500' : ''}
            `}
          >
            <div className="mt-0.5 shrink-0">
               {notification.type === 'success' && <CheckCircle2 size={22} className="text-green-600" />}
               {notification.type === 'warning' && <AlertTriangle size={22} className="text-amber-500" />}
               {notification.type === 'error' && <AlertCircle size={22} className="text-red-600" />}
               {notification.type === 'info' && <Info size={22} className="text-red-500" />}
            </div>
            <div className="flex-1 min-w-0">
               <h4 className="text-sm font-black leading-tight mb-1 uppercase tracking-tight">{notification.title}</h4>
               <p className={`text-xs leading-relaxed font-medium ${notification.type === 'info' ? 'text-gray-300' : 'text-gray-600'}`}>{notification.message}</p>
            </div>
            <button 
              onClick={() => setNotifications(prev => prev.filter(n => n.id !== notification.id))}
              className="text-gray-400 hover:text-red-500 transition-colors"
            >
              <X size={18} />
            </button>
            <div className="absolute bottom-0 left-0 h-1 w-full bg-black/10">
                <div className="h-full bg-red-600 animate-shrink origin-left" style={{ animationDuration: '6000ms' }}></div>
            </div>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes shrink { from { transform: scaleX(1); } to { transform: scaleX(0); } }
        .animate-shrink { animation-name: shrink; animation-timing-function: linear; animation-fill-mode: forwards; }
      `}</style>
    </NotificationContext.Provider>
  );
};
