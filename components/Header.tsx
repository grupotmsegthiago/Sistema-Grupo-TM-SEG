
import React, { useState, useEffect, useRef } from 'react';
import { Menu, Bell, User, Clock, Settings, LogOut, ChevronDown, Volume2, VolumeX, Eraser, BellRing, Activity } from 'lucide-react';
import { useNotification } from '../lib/NotificationContext';
import SystemDiagnostics from './SystemDiagnostics';
import { formatNowTimeBR } from '../lib/dateUtils';

interface HeaderProps {
  onMenuClick: () => void;
  onProfileSettingsClick: () => void;
  isCevaClient?: boolean;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick, onProfileSettingsClick, isCevaClient = false }) => {
  const [time, setTime] = useState(new Date());
  const [user, setUser] = useState<any>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  
  const { isSoundEnabled, toggleSound, requestPermission, permission, showNotification } = useNotification();

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    const storedUser = localStorage.getItem('userData');
    if (storedUser) {
      try { setUser(JSON.parse(storedUser)); } catch (e) { console.error(e); }
    }
    
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      clearInterval(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const formatUserName = (name: string) => {
    if (!name) return 'Visitante';
    const parts = name.split(' ');
    if (parts.length > 1) {
      return `${parts[0]} ${parts[parts.length - 1]}`;
    }
    return name;
  };

  const handleClearCache = () => {
    if (window.confirm("Isso limpará os dados locais e reiniciará o sistema. Deseja continuar?")) {
      localStorage.clear();
      sessionStorage.clear();
      window.location.reload();
    }
  };

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30 h-16 flex items-center justify-between px-4 lg:px-8">
      <div className="flex items-center gap-4">
        <button onClick={onMenuClick} className="p-2 text-gray-600 rounded-lg lg:hidden hover:bg-gray-100">
          <Menu size={24} />
        </button>
        
        <div className="flex items-center gap-3">
             <img 
                src={isCevaClient ? "/logo_ceva.png" : "/logo.png"} 
                alt={isCevaClient ? "CEVA Logistics" : "Logo TMSEG"} 
                className="h-12 w-auto object-contain"
                onError={(e) => { e.currentTarget.style.display = 'none'; }} 
             />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-gray-50 border rounded-lg text-gray-700">
          <Clock size={16} className="text-red-700" />
          <span className="text-sm font-mono font-bold">
            {formatNowTimeBR(time)}
          </span>
        </div>

        <button 
          onClick={toggleSound}
          className={`p-2 rounded-full transition-colors ${isSoundEnabled ? 'text-gray-500 hover:bg-gray-100' : 'text-red-600 bg-red-50 hover:bg-red-100'}`}
          title={isSoundEnabled ? "Silenciar" : "Ativar Som"}
        >
           {isSoundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
        </button>

        <div className="relative" ref={menuRef}>
          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="flex items-center gap-3 pl-4 border-l cursor-pointer"
          >
            <div className="text-right hidden md:block">
              <p className="text-sm font-bold text-gray-800 uppercase tracking-tight">{formatUserName(user?.name)}</p>
              <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">{user?.role || 'Visitante'}</p>
            </div>
            <div className="h-9 w-9 rounded-xl bg-gray-900 flex items-center justify-center text-white border-2 border-white shadow-sm font-black text-xs">
               {user?.name?.charAt(0).toUpperCase()}
            </div>
            <ChevronDown size={16} className={`text-gray-500 transition-transform ${isMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {isMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden animate-in slide-in-from-top-2 z-40">
              <div className="p-2 space-y-1">
                <button
                  onClick={() => { onProfileSettingsClick(); setIsMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm font-bold text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Settings size={16} className="text-gray-400"/>
                  Minha Conta
                </button>
                <button
                  onClick={() => { setShowDiagnostics(true); setIsMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm font-bold text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  data-testid="button-diagnostics"
                >
                  <Activity size={16} className="text-blue-500"/>
                  Diagnóstico do Sistema
                </button>
                <div className="border-t border-gray-100 my-1"></div>
                <button
                  onClick={handleClearCache}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm font-bold text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                >
                  <Eraser size={16} />
                  Limpar Cache / Reset
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {showDiagnostics && <SystemDiagnostics onClose={() => setShowDiagnostics(false)} />}
    </header>
  );
};

export default Header;
