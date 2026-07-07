
import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, MapPin, Truck, Users, FileBarChart, Settings, 
  Briefcase, UserCog, ChevronDown, ChevronRight, Circle, LogOut, DollarSign, Bot, Wallet, Map, MessageCircle, Scale, RefreshCw
} from 'lucide-react';
import { NAV_ITEMS, APP_VERSION } from '../constants';
import { NavItem } from '../constants'; // Explicit import to avoid TS error if NAV_ITEMS interface isn't exported correctly
import { logAction } from '../lib/logger';

interface SidebarProps {
  isOpen: boolean;
  activeScreen: string;
  onNavigate: (screen: string) => void;
  onLogout: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, activeScreen, onNavigate, onLogout }) => {
  const [expandedMenus, setExpandedMenus] = useState<string[]>(['monitoring-group', 'finance-group', 'commercial-group', 'clients-group', 'providers-group']);
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Carregar permissões do usuário ao montar
  useEffect(() => {
    const storedUser = localStorage.getItem('userData');
    if (storedUser) {
        try {
            const user = JSON.parse(storedUser);
            setCurrentUser(user);
            // Se tiver '*', é admin total. Caso contrário, usa a lista de IDs
            if (user.permissions && user.permissions.includes('*')) {
                setIsAdmin(true);
            } else {
                setUserPermissions(user.permissions || []);
            }
        } catch (e) {
            console.error(e);
        }
    }
  }, []);

  const handleHardReset = async () => {
    const ok = window.confirm(
      'LIMPEZA TOTAL\n\n' +
      'Isto vai:\n' +
      '• Desregistrar Service Workers\n' +
      '• Apagar todos os caches do navegador\n' +
      '• Limpar dados temporários (sessionStorage / IndexedDB)\n' +
      '• Recarregar o app na versão mais nova do servidor\n\n' +
      'Seu login será mantido. Continuar?'
    );
    if (!ok) return;

    try {
      const keepKeys = ['authToken', 'auth_token', 'userData', 'tmseg-token'];
      const preserved: Record<string, string> = {};
      for (const k of keepKeys) {
        const v = localStorage.getItem(k);
        if (v !== null) preserved[k] = v;
      }
      try { sessionStorage.clear(); } catch {}
      try {
        localStorage.clear();
        for (const [k, v] of Object.entries(preserved)) localStorage.setItem(k, v);
      } catch {}

      if ('serviceWorker' in navigator) {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(r => r.unregister().catch(() => false)));
        } catch (e) { console.warn('[HardReset] SW unregister falhou', e); }
      }

      if ('caches' in window) {
        try {
          const names = await caches.keys();
          await Promise.all(names.map(n => caches.delete(n).catch(() => false)));
        } catch (e) { console.warn('[HardReset] Cache API falhou', e); }
      }

      if ('indexedDB' in window && (indexedDB as any).databases) {
        try {
          const dbs: Array<{ name?: string }> = await (indexedDB as any).databases();
          await Promise.all(
            dbs.filter(d => d.name).map(d => new Promise<void>(resolve => {
              const req = indexedDB.deleteDatabase(d.name as string);
              req.onsuccess = req.onerror = req.onblocked = () => resolve();
            }))
          );
        } catch (e) { console.warn('[HardReset] IndexedDB falhou', e); }
      }

      try {
        if (currentUser) {
          await logAction('OTHER', 'HardReset', currentUser.id || 'unknown', `Limpeza total de cache solicitada por ${currentUser.name || currentUser.email || 'usuário'}`);
        }
      } catch {}

      const url = new URL(window.location.href);
      url.searchParams.set('_r', String(Date.now()));
      window.location.replace(url.toString());
    } catch (e) {
      console.error('[HardReset] erro geral', e);
      window.location.reload();
    }
  };

  const handleNavigation = (screenId: string, screenName: string) => {
      // LOG DE NAVEGAÇÃO (Rastreamento de Cliques)
      if (currentUser) {
          logAction('OTHER', 'Navigation', screenId, `Acessou a tela: ${screenName}`);
      }
      onNavigate(screenId);
  };

  const toggleMenu = (id: string) => {
    setExpandedMenus(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleLogoutClick = async () => {
      if (window.confirm("Tem certeza que deseja sair do sistema?")) {
          // Log logout action
          const storedUser = localStorage.getItem('userData');
          if (storedUser) {
              const user = JSON.parse(storedUser);
              await logAction('LOGOUT', 'Auth', user.id, `Usuário ${user.name} realizou logout.`);
          }
          onLogout();
      }
  };

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'LayoutDashboard': return <LayoutDashboard size={24} />;
      case 'MapPin': return <MapPin size={24} />;
      case 'Map': return <Map size={24} />;
      case 'Truck': return <Truck size={24} />;
      case 'Users': return <Users size={24} />;
      case 'Briefcase': return <Briefcase size={24} />;
      case 'UserCog': return <UserCog size={24} />;
      case 'FileBarChart': return <FileBarChart size={24} />;
      case 'Settings': return <Settings size={24} />;
      case 'DollarSign': return <DollarSign size={24} />;
      case 'Bot': return <Bot size={24} />;
      case 'Wallet': return <Wallet size={24} />;
      case 'MessageCircle': return <MessageCircle size={24} />;
      case 'Scale': return <Scale size={24} />;
      default: return <LayoutDashboard size={24} />;
    }
  };

  // Função para verificar se o usuário tem acesso a um item
  const hasAccess = (itemId: string) => {
    const role = (currentUser?.role || '').toLowerCase();
    
    if (itemId === 'monitoring-group' || itemId === 'missions') return true;

    if (itemId === 'ranking-dhl') {
      return role === 'avançado' || role === 'avancado' || role === 'diretoria' || role === 'administrador';
    }

    if (itemId === 'mission-report') {
      const nameLower = (currentUser?.name || '').toLowerCase();
      const allowedNames = ['daniel', 'barbara', 'bárbara', 'thiago moreira'];
      if (allowedNames.some(n => nameLower.includes(n))) return true;
      if (role === 'diretoria' || role === 'administrador' || role === 'avançado' || role === 'avancado') return true;
      if (userPermissions.includes('mission-report')) return true;
      return false;
    }

    if (role === 'financeiro') {
        if (itemId === 'finance-group' || itemId === 'fin-report') return true;
    }

    if (role === 'comercial') {
        const forbiddenGroups = ['finance-group', 'settings-group'];
        if (forbiddenGroups.includes(itemId)) return false;
        return userPermissions.includes(itemId);
    }

    // 2. Bloqueio Duro para Usuários Externos (Clientes)
    const isRestrictedClientUser = currentUser?.clientId || (currentUser?.permissions && currentUser.permissions.some((p: string) => p.startsWith('client_view:')));

    if (isRestrictedClientUser) {
        const forbiddenGroups = ['finance-group', 'providers-group', 'settings-group', 'commercial-group', 'support-network', 'whatsapp-center'];
        if (forbiddenGroups.includes(itemId)) return false;
        if (itemId === 'clients') return false;
        if (itemId === 'shift-handover') return false;
    }

    // Passagem de Plantão: ferramenta de operação interna (todos os operadores
    // internos), nunca para usuários-cliente restritos (já bloqueado acima).
    if (itemId === 'shift-handover') return true;

    if (itemId === 'alvara-control') {
        const isAuthorized = role === 'administrador' || role === 'avançado' || role === 'avancado' || role === 'diretoria' || userPermissions.includes('alvara-control');
        if (!isAuthorized) return false;
    }

    // RH — administrador/diretoria têm acesso total; demais por permissão explícita
    if (itemId === 'rh-group' || itemId.startsWith('rh-')) {
        if (role === 'administrador' || role === 'diretoria' || userPermissions.includes('*')) return true;
        if (role === 'financeiro' && ['rh-salaries', 'rh-payroll', 'rh-payslips', 'rh-reports', 'rh-dashboard'].includes(itemId)) return true;
        if (role === 'rh' && itemId !== 'rh-settings') return true;
        if (['rh-timeclock', 'rh-employee-profile'].includes(itemId) && !currentUser?.clientId) return true;
        if (itemId === 'rh-group') return userPermissions.some((p: string) => p.startsWith('rh-'));
        return userPermissions.includes(itemId);
    }

    // REGRAS DO PERFIL AVANÇADO
    const isAvancado = role === 'avançado' || role === 'avancado';
    if (isAvancado) {
        // Bloqueio total de faturamento/financeiro para Avançado (grupo inteiro e todos subitens)
        if (itemId === 'finance-group' || itemId.startsWith('fin-')) return false;
        // Avançado tem acesso explícito a clientes e operações
        const avancadoAllowed = [
            'dashboard', 'missions', 'clients-group', 'clients', 'client-routes',
            'client-vehicles', 'quotes', 'providers-group', 'providers', 'provider-agents',
            'alvara-control', 'support-network', 'reports'
        ];
        return avancadoAllowed.includes(itemId) || userPermissions.includes(itemId);
    }

    if (isAdmin) return true;
    return userPermissions.includes(itemId);
  };

  const renderNavItem = (item: NavItem) => {
    if (!hasAccess(item.id)) return null;

    const hasChildren = item.children && item.children.length > 0;
    const visibleChildren = hasChildren 
        ? item.children?.filter(child => hasAccess(child.id)) 
        : [];

    if (hasChildren && (!visibleChildren || visibleChildren.length === 0)) {
        return null;
    }

    const isExpanded = expandedMenus.includes(item.id);
    const isActive = activeScreen === item.id;
    const isChildActive = visibleChildren?.some(child => child.id === activeScreen);
    const isParentActive = isActive || isChildActive;

    return (
      <div key={item.id} className="mb-1">
        <button
          onClick={() => hasChildren ? toggleMenu(item.id) : handleNavigation(item.id, item.name)}
          className={`
            w-full flex items-center px-4 py-4 rounded-lg transition-all duration-200 group/item relative overflow-hidden
            ${isParentActive && !hasChildren
              ? 'bg-gradient-to-r from-red-900 to-red-800 text-white shadow-md border-l-4 border-red-500' 
              : 'text-gray-300 hover:bg-white/5 hover:text-white'}
          `}
          title={item.name}
        >
          <div className="min-w-[24px] flex justify-center items-center">
             <span className={`transition-colors ${isParentActive ? 'text-red-200' : 'group-hover/item:text-red-400'}`}>
               {getIcon(item.icon)}
             </span>
          </div>
          <div className={`flex-1 flex items-center justify-between ml-4 overflow-hidden whitespace-nowrap transition-opacity duration-300 ${isOpen ? 'opacity-100 w-auto' : 'opacity-0 w-0 lg:group-hover:opacity-100 lg:group-hover:w-auto'}`}>
             <span className="font-medium text-base tracking-wide truncate">{item.name}</span>
             {hasChildren && (
                <span className="text-gray-500 ml-2">
                   {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </span>
             )}
          </div>
        </button>

        {hasChildren && isExpanded && (
           <div className={`bg-black/20 py-2 transition-all animate-fade-in ${isOpen ? 'block' : 'hidden lg:group-hover:block'}`}>
              {visibleChildren?.map(child => {
                 const isChildSelected = activeScreen === child.id;
                 return (
                    <button
                      key={child.id}
                      onClick={() => handleNavigation(child.id, child.name)}
                      className={`
                         w-full flex items-center gap-3 px-5 py-3 pl-14 text-sm font-medium transition-colors text-left whitespace-nowrap
                         ${isChildSelected ? 'text-red-400 bg-white/5 border-r-2 border-red-500' : 'text-gray-400 hover:text-white hover:bg-white/5'}
                      `}
                    >
                       <Circle size={6} className={isChildSelected ? 'fill-red-400 text-red-400' : 'text-gray-600'} />
                       {child.name}
                    </button>
                 );
              })}
           </div>
        )}
      </div>
    );
  };

  return (
    <aside 
      className={`
        fixed inset-y-0 left-0 z-50 h-full
        flex flex-col
        bg-gradient-to-b from-black via-[#1a0505] to-[#450a0a]
        text-white shadow-2xl
        transition-all duration-300 ease-in-out
        group overflow-x-hidden
        ${isOpen ? 'translate-x-0 w-72' : '-translate-x-full w-72'}
        lg:translate-x-0 lg:w-20 lg:hover:w-72
      `}
    >
        <div className="flex items-center justify-center h-28 border-b border-white/10 bg-black/20 shrink-0 overflow-hidden relative">
           <div className={`flex flex-col items-center transition-all duration-300 absolute top-1/2 -translate-y-1/2 ${isOpen ? 'left-8 translate-x-0' : 'left-1/2 -translate-x-1/2 lg:group-hover:left-8 lg:group-hover:translate-x-0'}`}>
               <img 
                  src="/logo.png" 
                  alt="Logo" 
                  className={`w-auto object-contain transition-all ${isOpen ? 'h-16' : 'h-14 lg:group-hover:h-16'}`}
                  onError={(e) => {
                    e.currentTarget.src = 'https://placehold.co/80x80/b91c1c/white?text=TM';
                  }}
               />
           </div>
           <div className={`flex flex-col justify-center ml-16 transition-opacity duration-300 delay-75 whitespace-nowrap ${isOpen ? 'opacity-100' : 'opacity-0 lg:group-hover:opacity-100'}`}>
                <span className="block text-xs font-light text-gray-300 tracking-[0.2em]">GRUPO</span>
                <span className="text-red-600 text-2xl font-bold tracking-widest">TMSEG</span>
           </div>
        </div>
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 space-y-1 scrollbar-thin">
          {NAV_ITEMS.map((item) => renderNavItem(item))}
        </nav>
        <div className="p-4 border-t border-white/10 bg-black/30 shrink-0 overflow-hidden flex flex-col gap-3">
          <button 
            onClick={handleLogoutClick}
            className="w-full flex items-center px-4 py-3 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-all group/logout relative"
            title="Sair do Sistema"
          >
             <div className="min-w-[24px] flex justify-center items-center">
                 <LogOut size={22} className="group-hover/logout:text-red-500 transition-colors" />
             </div>
             <div className={`flex-1 ml-4 overflow-hidden whitespace-nowrap transition-opacity duration-300 ${isOpen ? 'opacity-100 w-auto' : 'opacity-0 w-0 lg:group-hover:opacity-100 lg:group-hover:w-auto'}`}>
                 <span className="font-bold text-sm tracking-wide">SAIR DO SISTEMA</span>
             </div>
          </button>
          <button
            onClick={handleHardReset}
            data-testid="button-hard-reset-cache"
            className="w-full flex items-center px-4 py-3 text-amber-300/80 hover:text-amber-200 hover:bg-amber-500/10 rounded-lg transition-all group/reset relative border border-amber-500/20"
            title="Limpar cache, Service Workers e recarregar"
          >
             <div className="min-w-[24px] flex justify-center items-center">
                 <RefreshCw size={20} className="group-hover/reset:rotate-180 transition-transform duration-500" />
             </div>
             <div className={`flex-1 ml-4 overflow-hidden whitespace-nowrap transition-opacity duration-300 ${isOpen ? 'opacity-100 w-auto' : 'opacity-0 w-0 lg:group-hover:opacity-100 lg:group-hover:w-auto'}`}>
                 <span className="font-bold text-xs tracking-wide uppercase">Limpar Cache</span>
             </div>
          </button>
          <div className={`bg-gradient-to-r from-red-950 to-black rounded-lg p-3 text-center border border-red-900/30 flex items-center gap-3 transition-all ${isOpen ? 'justify-start' : 'justify-center lg:group-hover:justify-start'}`}>
            <div className="relative flex h-3 w-3 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </div>
            <div className={`text-left whitespace-nowrap transition-opacity duration-300 ${isOpen ? 'block opacity-100' : 'hidden opacity-0 lg:group-hover:block lg:group-hover:opacity-100'}`}>
                <p className="text-xs text-gray-400 uppercase font-semibold">Status: Online</p>
                <span className="text-[10px] font-mono font-medium text-green-400" data-testid="text-app-version">v{APP_VERSION}</span>
            </div>
          </div>
        </div>
    </aside>
  );
};

export default Sidebar;
