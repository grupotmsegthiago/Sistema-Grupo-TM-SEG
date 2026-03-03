
import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Login from './components/Login';
import { APP_VERSION } from './constants';
import { supabase } from './lib/supabase';
import { RefreshCw } from 'lucide-react';

// Contexto
import { NotificationProvider } from './lib/NotificationContext';

// Componentes
import Dashboard from './components/Dashboard'; 
import MissionTable from './components/MissionTable';
import MissionForm from './components/MissionForm';
import VehicleList from './components/VehicleList';
import VehicleForm from './components/VehicleForm';
import ClientList from './components/ClientList';
import ClientForm from './components/ClientForm';
import ProviderList from './components/ProviderList';
import ProviderForm from './components/ProviderForm';
import AlvaraControl from './components/AlvaraControl'; 
import UserList from './components/UserList';
import UserForm from './components/UserForm';
import ChangePasswordModal from './components/ChangePasswordModal';
import ProfileSettingsModal from './components/ProfileSettingsModal';

import MissionFinancialModal from './components/MissionFinancialModal';

// Outros Componentes
import ClientRouteList from './components/ClientRouteList';
import ClientRouteForm from './components/ClientRouteForm';
import ProviderAgentList from './components/ProviderAgentList';
import ProviderAgentForm from './components/ProviderAgentForm';
import ProfileList from './components/ProfileList';
import ProfileForm from './components/ProfileForm';
import ServerStats from './components/ServerStats';
import ClientVehicleList from './components/ClientVehicleList';
import ClientVehicleForm from './components/ClientVehicleForm';
import SystemLogs from './components/SystemLogs';
import ReportsDashboard from './components/ReportsDashboard';
import QuoteList from './components/QuoteList';
import QuoteForm from './components/QuoteForm';
import PublicAgentRegistration from './components/PublicAgentRegistration';
import SupportMapFinder from './components/SupportMapFinder'; 
import CostOptimizationDashboard from './components/CostOptimizationDashboard';
import MaintenanceDashboard from './components/MaintenanceDashboard';
import ContractManager from './components/ContractManager';

// INTELIGÊNCIA ARTIFICIAL
import AIChatbot from './components/AIChatbot';

// TECNOLOGIAS
import VehicleTechnologyList from './components/VehicleTechnologyList';
import VehicleTechnologyForm from './components/VehicleTechnologyForm';

// FINANCEIRO
import FinancialDashboard from './components/FinancialDashboard';
import FinancialTransactionList from './components/FinancialTransactionList';
import FinancialDRE from './components/FinancialDRE';
import FinancialAccountManager from './components/FinancialAccountManager';
import FinancialCategoryManager from './components/FinancialCategoryManager';
import FinancialReport from './components/FinancialReport'; 
import ClientBillingReport from './components/ClientBillingReport';
import DailyCashMovement from './components/DailyCashMovement';
import BillingControlCenter from './components/BillingControlCenter';

// TEMPO DE INATIVIDADE (30 minutos)
const INACTIVITY_LIMIT = 20 * 60 * 1000;

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const token = localStorage.getItem('authToken');
    const userData = localStorage.getItem('userData');
    const version = localStorage.getItem('app_version');
    return !!(token && userData && version === APP_VERSION);
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [needsPasswordChange, setNeedsPasswordChange] = useState(false);
  const [isProfileSettingsOpen, setIsProfileSettingsOpen] = useState(false);
  const [currentScreen, setCurrentScreen] = useState('dashboard'); 
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  const [rebootCountdown, setRebootCountdown] = useState<number | null>(null);
  const [isCevaClient, setIsCevaClient] = useState(false);
  const [billingMissionId, setBillingMissionId] = useState<string | null>(null);
  const [billingMission, setBillingMission] = useState<any>(null);

  const normalizedPath = window.location.pathname.toLowerCase().replace(/\/$/, '');
  const isPublicRoute = normalizedPath === '/cadastro-operacional';

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    localStorage.clear(); 
    sessionStorage.clear(); 
    localStorage.setItem('app_version', APP_VERSION); 
    document.cookie.split(";").forEach((c) => {
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });
    setIsAuthenticated(false);
    setNeedsPasswordChange(false);
    setCurrentScreen('dashboard');
    window.location.href = '/'; 
  }, []);

  const verifySessionInDatabase = async () => {
      const storedUser = localStorage.getItem('userData');
      if (!storedUser) return;
      try {
          const user = JSON.parse(storedUser);
          const { data, error } = await supabase.from('system_users').select(`status, force_password_change, permissions, profile_id, client_id, profiles:profile_id ( permissions )`).eq('id', user.id).single();
          if (error || !data || data.status !== 'Ativo') { handleLogout(); return; }
          if (data.force_password_change) setNeedsPasswordChange(true);
          const profilePerms = data.profiles?.permissions || [];
          const userPerms = data.permissions || [];
          const combinedPermissions = [...new Set([...profilePerms, ...userPerms])];
          if (JSON.stringify(user.permissions) !== JSON.stringify(combinedPermissions)) {
              user.permissions = combinedPermissions;
              localStorage.setItem('userData', JSON.stringify(user));
          }
          if (data.client_id) {
              const { data: clientData } = await supabase.from('clients').select('name').eq('id', data.client_id).single();
              if (clientData && (clientData.name || '').toUpperCase().includes('CEVA')) {
                  setIsCevaClient(true);
              }
          }
          if (!isAuthenticated) setIsAuthenticated(true);
      } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (!isAuthenticated || isPublicRoute) return;
    const channel = supabase.channel('global_reset_channel').on('postgres_changes',{event: 'INSERT',schema: 'public',table: 'system_logs',filter: 'entity=eq.FORCE_LOGOUT_SIGNAL'},(payload) => {setRebootCountdown(10);}).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isAuthenticated, isPublicRoute]);

  useEffect(() => {
      if (rebootCountdown === null) return;
      if (rebootCountdown <= 0) { handleLogout(); return; }
      const timer = setTimeout(() => { setRebootCountdown(prev => (prev !== null ? prev - 1 : null)); }, 1000);
      return () => clearTimeout(timer);
  }, [rebootCountdown, handleLogout]);

  useEffect(() => {
    if (isPublicRoute) return; 
    const storedVersion = localStorage.getItem('app_version');
    const token = localStorage.getItem('authToken');
    const userData = localStorage.getItem('userData');
    if (storedVersion !== APP_VERSION) { handleLogout(); return; }
    if (!token || !userData) { if (isAuthenticated) handleLogout(); } else { verifySessionInDatabase(); }
  }, [isPublicRoute, isAuthenticated, handleLogout]);

  useEffect(() => {
    if (!isAuthenticated || isPublicRoute) return;
    let timeoutId: any;
    const resetTimer = () => { if (timeoutId) clearTimeout(timeoutId); timeoutId = setTimeout(() => handleLogout(), INACTIVITY_LIMIT); };
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => document.addEventListener(event, resetTimer));
    resetTimer();
    const sessionInterval = setInterval(verifySessionInDatabase, 120000);
    return () => { if (timeoutId) clearTimeout(timeoutId); clearInterval(sessionInterval); events.forEach(event => document.removeEventListener(event, resetTimer)); };
  }, [isAuthenticated, isPublicRoute, handleLogout]); 

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
  const handleLogin = () => { setIsAuthenticated(true); verifySessionInDatabase(); };

  const handleOpenBillingMission = async (missionId: string) => {
      try {
          const { data, error } = await supabase.from('missions').select('*').eq('id', missionId).single();
          if (error || !data) { alert(`OS ${missionId} não encontrada.`); return; }
          const m: any = data;
          const mapped = {
              ...m,
              createdAt: m.created_at,
              lastUpdate: m.last_update,
              startTime: m.start_time,
              endTime: m.end_time,
              startKm: m.start_km,
              endKm: m.end_km,
              totalDistance: m.total_distance,
              traveledDistance: m.traveled_distance,
              mapLink: m.map_link,
              estimatedTime: m.estimated_time,
              currentLocation: m.current_location,
              vehicleId: m.vehicle_id,
              revenue_value: m.revenue_value,
              cost_value: m.cost_value,
              toll_value: m.toll_value,
              toll_value_provider: m.toll_value_provider,
              billing_approved: m.billing_approved,
              billing_verified_by: m.billing_verified_by,
              mission_type: m.mission_type || 'Caracterizada',
              originalClientName: m.client,
          };
          setBillingMission(mapped);
          setBillingMissionId(missionId);
      } catch (err) { console.error(err); }
  };
  const handlePasswordChanged = () => {
    const storedUser = localStorage.getItem('userData');
    if (storedUser) { try { const user = JSON.parse(storedUser); user.force_password_change = false; localStorage.setItem('userData', JSON.stringify(user)); } catch (e) { console.error(e); } }
    setNeedsPasswordChange(false);
  };
  const navigateTo = (screen: string) => { setSelectedId(null); setCurrentScreen(screen); };
  const handleEdit = (screen: string, id: string) => { setSelectedId(id); setCurrentScreen(screen); };
  const handleSaveAndContinue = (missionId: string) => { localStorage.setItem('openMissionOnLoad', missionId); navigateTo('missions'); };

  if (isPublicRoute) { return ( <NotificationProvider> <PublicAgentRegistration /> </NotificationProvider> ); }
  
  if (!isAuthenticated) { return <Login onLogin={handleLogin} />; }
  
  if (needsPasswordChange) { return <ChangePasswordModal onSuccess={handlePasswordChanged} />; }

  const renderContent = () => {
    switch (currentScreen) {
      case 'dashboard': return <Dashboard />; 
      case 'missions': return <MissionTable onNewMission={() => navigateTo('new-mission')} />;
      case 'new-mission': return <MissionForm onBack={() => navigateTo('missions')} onSaveAndContinue={handleSaveAndContinue} onAddClient={() => navigateTo('client-form')} />;
      case 'ai-support': return <AIChatbot />;
      case 'cost-optimization': return <CostOptimizationDashboard />;
      case 'db-maintenance': return <MaintenanceDashboard />;
      case 'fin-dashboard': return <FinancialDashboard />;
      case 'fin-transactions': return <FinancialTransactionList />;
      case 'fin-dre': return <FinancialDRE />;
      case 'fin-accounts': return <FinancialAccountManager />;
      case 'fin-categories': return <FinancialCategoryManager />;
      case 'fin-report': return <FinancialReport />; 
      case 'fin-billing': return <ClientBillingReport onNavigate={navigateTo} onOpenMission={handleOpenBillingMission} />;
      case 'fin-daily-movement': return <DailyCashMovement />;
      case 'fin-billing-control': return <BillingControlCenter />;
      case 'clients': return <ClientList onAddClient={() => navigateTo('client-form')} onEdit={(id) => handleEdit('client-form', id)} />;
      case 'client-form': return ( <ClientForm id={selectedId} onBack={() => navigateTo('clients')} onSave={() => {}} onAddVehicle={() => navigateTo('client-vehicle-form')} onEditVehicle={(vid) => handleEdit('client-vehicle-form', vid)} onAddRoute={() => navigateTo('client-route-form')} onEditRoute={(rid) => handleEdit('client-route-form', rid)} onAddQuote={() => navigateTo('quote-form')} onEditQuote={(qid) => handleEdit('quote-form', qid)} /> );
      case 'contract-manager': return <ContractManager />;
      case 'client-users': return <UserList userType="client" onAddUser={() => navigateTo('client-user-form')} onEdit={(id) => handleEdit('client-user-form', id)} />;
      case 'client-user-form': return <UserForm id={selectedId} userType="client" onBack={() => navigateTo('client-users')} />;
      case 'client-vehicles': return <ClientVehicleList onAddVehicle={() => navigateTo('client-vehicle-form')} onEdit={(id) => handleEdit('client-vehicle-form', id)} />;
      case 'client-vehicle-form': return <ClientVehicleForm id={selectedId} onBack={() => navigateTo('client-vehicles')} />;
      case 'client-routes': return <ClientRouteList onAdd={() => navigateTo('client-route-form')} onEdit={(id) => handleEdit('client-route-form', id)} />;
      case 'client-route-form': return <ClientRouteForm id={selectedId} onSuccess={() => navigateTo('client-routes')} />;
      case 'quotes': return <QuoteList onAdd={() => navigateTo('quote-form')} onEdit={(id) => handleEdit('quote-form', id)} />;
      case 'quote-form': return <QuoteForm id={selectedId} onBack={() => navigateTo('quotes')} />;
      case 'providers': return <ProviderList onAddProvider={() => navigateTo('provider-form')} onEdit={(id) => handleEdit('provider-form', id)} />;
      case 'provider-form': return <ProviderForm id={selectedId} onBack={() => navigateTo('providers')} onNavigateToVehicles={() => navigateTo('provider-vehicles')} />;
      case 'alvara-control': return <AlvaraControl />;
      case 'provider-users': return <UserList userType="provider" onAddUser={() => navigateTo('provider-user-form')} onEdit={(id) => handleEdit('provider-user-form', id)} />;
      case 'provider-user-form': return <UserForm id={selectedId} userType="provider" onBack={() => navigateTo('provider-users')} />;
      case 'provider-vehicles': return <VehicleList onAddVehicle={() => navigateTo('provider-vehicle-form')} onEdit={(id) => handleEdit('provider-vehicle-form', id)} />;
      case 'provider-vehicle-form': return <VehicleForm id={selectedId} onBack={() => navigateTo('provider-vehicles')} />;
      case 'provider-agents': return <ProviderAgentList onAdd={() => navigateTo('provider-agent-form')} onEdit={(id) => handleEdit('provider-agent-form', id)} />;
      case 'provider-agent-form': return <ProviderAgentForm id={selectedId} onBack={() => navigateTo('provider-agents')} />;
      case 'provider-technologies': return <VehicleTechnologyList onAdd={() => navigateTo('provider-technology-form')} onEdit={(id) => handleEdit('provider-technology-form', id)} />;
      case 'provider-technology-form': return <VehicleTechnologyForm id={selectedId} onBack={() => navigateTo('provider-technologies')} />;
      case 'internal-users': return <UserList userType="internal" onAddUser={() => navigateTo('internal-user-form')} onEdit={(id) => handleEdit('internal-user-form', id)} />;
      case 'internal-user-form': return <UserForm id={selectedId} userType="internal" onBack={() => navigateTo('internal-users')} />;
      case 'profiles': return <ProfileList onAdd={() => navigateTo('profile-form')} onEdit={(id) => handleEdit('profile-form', id)} />;
      case 'profile-form': return <ProfileForm id={selectedId} onBack={() => navigateTo('profiles')} />;
      case 'server-stats': return <ServerStats />;
      case 'system-logs': return <SystemLogs />;
      case 'reports': return <ReportsDashboard />;
      case 'support-network': return <SupportMapFinder onNavigate={navigateTo} />;
      default: return <Dashboard />;
    }
  };

  return (
    <NotificationProvider>
        <div className="flex h-screen-ios overflow-x-hidden overflow-y-auto md:overflow-y-hidden font-sans text-gray-800 relative" style={{ maxWidth: '100vw' }}>
        
        {rebootCountdown !== null && (
            <div className="fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center text-center p-6 backdrop-blur-xl animate-in fade-in duration-500">
                <div className="bg-red-600 p-6 rounded-full shadow-[0_0_60px_rgba(220,38,38,0.7)] mb-8 animate-pulse"><RefreshCw size={80} className="text-white animate-spin duration-[4000ms]" /></div>
                <h1 className="text-4xl md:text-6xl font-black text-white uppercase tracking-tighter mb-4">SISTEMA EM MANUTENÇÃO</h1>
                <p className="text-xl text-red-500 font-bold uppercase tracking-widest mb-12 max-w-2xl">O sistema está sendo reiniciado para atualizações críticas. Aguarde...</p>
                <div className="relative scale-150 mb-12"><div className="text-9xl font-black text-white font-mono">{rebootCountdown}</div><div className="absolute -inset-8 border-8 border-red-600/20 rounded-full animate-ping"></div></div>
            </div>
        )}
        <div className="absolute inset-0 z-0 pointer-events-none"><img src="/background.png" alt="System Background" className="w-full h-full object-cover fixed opacity-[0.03]"/><div className="absolute inset-0 bg-[#f8fafc] -z-10"></div></div>
        <Sidebar isOpen={isSidebarOpen} activeScreen={currentScreen} onNavigate={navigateTo} onLogout={handleLogout} />
        <div className="flex-1 flex flex-col h-full relative z-10 overflow-x-hidden lg:pl-20">
            {isSidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setIsSidebarOpen(false)}></div>}
            <Header onMenuClick={toggleSidebar} onProfileSettingsClick={() => setIsProfileSettingsOpen(true)} isCevaClient={isCevaClient} />
            <main className="flex-1 overflow-y-auto p-4 md:p-6 scrollbar-thin">
            <div className="w-full mx-auto relative">
                {renderContent()}
                <footer className="mt-8 text-center text-[10px] text-gray-400 pb-4 uppercase">&copy; {new Date().getFullYear()} Grupo TMSEG.</footer>
            </div>
            </main>
        </div>
        {isProfileSettingsOpen && ( <ProfileSettingsModal onClose={() => setIsProfileSettingsOpen(false)} onSuccess={() => { setIsProfileSettingsOpen(false); alert("Dados atualizados com sucesso! Por segurança, por favor, faça login novamente."); handleLogout(); }} /> )}
        {billingMissionId && billingMission && ( <MissionFinancialModal isOpen={true} onClose={() => { setBillingMissionId(null); setBillingMission(null); }} mission={billingMission} onUpdate={() => {}} /> )}
        </div>
    </NotificationProvider>
  );
};

export default App;
