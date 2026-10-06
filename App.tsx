
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import WhatsAppStatusBanner from './components/WhatsAppStatusBanner';
import OsAnalysisDiretoriaModal from './components/OsAnalysisDiretoriaModal';
import IdlePresenceGuard from './components/IdlePresenceGuard';
import Login from './components/Login';
import ResetPassword from './components/ResetPassword';
import { APP_VERSION } from './constants';
import { supabase } from './lib/supabase';
import { RefreshCw } from 'lucide-react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';

// Contexto
import { NotificationProvider } from './lib/NotificationContext';
import { RealtimeProvider } from './lib/RealtimeProvider';

// Componentes
import Dashboard from './components/Dashboard'; 
import MissionTable from './components/MissionTable';
import ControleDiario from './components/ControleDiario';
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
import MotivationGate, { shouldShowMotivation } from './components/MotivationGate';

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
import MissionReportPage from './components/MissionReportPage';
import RankingDHL from './components/RankingDHL';
import ProviderActivationMap from './components/ProviderActivationMap';
import ShiftHandover from './components/ShiftHandover';
import QuoteList from './components/QuoteList';
import QuoteForm from './components/QuoteForm';
import PublicAgentRegistration from './components/PublicAgentRegistration';
import DhlSupplierIntake from './components/DhlSupplierIntake';
import CevaPortal from './components/CevaPortal';
import IblPortal from './components/IblPortal';
import PublicLiveTrack from './components/PublicLiveTrack';
import MapaViaturasPublico from './components/MapaViaturasPublico';
import SupportMapFinder from './components/SupportMapFinder'; 
import PushNotificationManager from './components/PushNotificationManager';
import CostOptimizationDashboard from './components/CostOptimizationDashboard';
import MaintenanceDashboard from './components/MaintenanceDashboard';
import ContractManager from './components/ContractManager';
import DhlNonCompliantTables from './components/DhlNonCompliantTables';
import EquipmentManager from './components/EquipmentManager';
import ManualOverrideAlertSettings from './components/ManualOverrideAlertSettings';
import SystemSettingsPage from './components/SystemSettingsPage';

// INTELIGÊNCIA ARTIFICIAL
import AIChatbot from './components/AIChatbot';
import FeatureInactivePanel from './components/FeatureInactivePanel';

// Preservado para reativação futura (P2-01 — não remover).
void AIChatbot;

// TECNOLOGIAS
import VehicleTechnologyList from './components/VehicleTechnologyList';
import VehicleTechnologyForm from './components/VehicleTechnologyForm';

// JURÍDICO
import LegalDashboard from './components/LegalDashboard';

// FINANCEIRO
import FinancialDashboard from './components/FinancialDashboard';
import FinancialTransactionList from './components/FinancialTransactionList';
import FinancialDRE from './components/FinancialDRE';
import FinancialAccountManager from './components/FinancialAccountManager';
import FinancialCategoryManager from './components/FinancialCategoryManager';
import FinancialReport from './components/FinancialReport';
import DashboardDiretoria from './components/dashboard/DashboardDiretoria';
import ComissoesComerciaisPage from './components/ComissoesComerciaisPage';
import DiretoriaFaturamentoPage from './components/DiretoriaFaturamentoPage';
import GestaoInvestimento from './components/investimentos/GestaoInvestimento'; 
import ClientBillingReport from './components/ClientBillingReport';
import DailyCashMovement from './components/DailyCashMovement';
import VendorVerificationControl from './components/VendorVerificationControl';
import FinancialInvoiceControl from './components/FinancialInvoiceControl';
import MissionAlertMonitor from './components/MissionAlertMonitor';
import EvidenceStartAlert from './components/EvidenceStartAlert';
import VeladaClosureAlert from './components/VeladaClosureAlert';
import DhlCopiaAoVivo from './components/DhlCopiaAoVivo';
import DhlViaturaNovaAlerta from './components/DhlViaturaNovaAlerta';
import TabelaRotaAlertaUsuario from './components/TabelaRotaAlertaUsuario';
import UserPresenceTracker from './components/UserPresenceTracker';
import PresenceDebugPanel from './components/PresenceDebugPanel';
import TimeClockGate from './components/TimeClockGate';
import AppErrorBoundary from './components/AppErrorBoundary';
import { getIdleMs, wireUserActivityTracker, touchUserActivity } from './lib/userActivityTracker';
import { flushInteractionStats } from './lib/productivity/interactionStats';
import { logProductivityEvent } from './lib/productivity/logProductivity';
import {
  idleLogoutReasonKey,
  isIdleLogoutDue,
  LOGOUT_REASON_IDLE_KEY,
  getIdleLogoutThresholdMinutes,
  shouldEnforceSessionIdleLogout,
} from './lib/productivity/sessionIdleLogout';
import { wireNightHeartbeat, reportNightIncident } from './lib/productivity/nightHeartbeat';
import { isNightWatchActive } from './lib/productivity/nightWatch';
import {
  FORCE_LOGOUT_SEEN_KEY,
  FORCE_LOGOUT_SETTINGS_KEY,
  clearLocalStoragePreservingForceLogoutSeen,
  parseForceLogoutSignal,
} from './lib/forceLogout';
import RhModule from './components/rh/RhModule';
import { canAccessRhScreen } from './lib/rh/permissions';
import { canAccessMissionReport } from './lib/missionReportAccess';
import { canAccessDiretoriaMenu, canAccessComissoesComerciais, canAccessFaturamentoDiretoria } from './lib/diretoriaAccess';
import { canViewOsAnalysisPendencies } from './lib/osAnalysisAccess';
import OsAnalysisPendingPage from './components/OsAnalysisPendingPage';
import { canViewAprovacoesPendentes } from './lib/aprovacoesPendentesAccess';
import AprovacoesPendentesPage from './components/AprovacoesPendentesPage';
import { enrichUserWithCltData } from './lib/timeclock/cltEmployee';
import { persistScreen, resolveInitialScreen, getRoleDefaultScreen, getScreenFromUrl } from './lib/screenNavigation';
import { canAccessScreen, fallbackScreenForUser } from './lib/screenAccess';
import TrainingAcademy from './components/TrainingAcademy';
import { operadorBloqueado, normalizarModulos } from './lib/training/operadorAcademy';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const token = localStorage.getItem('authToken');
    const userData = localStorage.getItem('userData');
    // Não exige app_version === APP_VERSION: após auto-update o login deve persistir.
    return !!(token && userData);
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [needsPasswordChange, setNeedsPasswordChange] = useState(false);
  const [isProfileSettingsOpen, setIsProfileSettingsOpen] = useState(false);
  const [currentScreen, setCurrentScreen] = useState(() => resolveInitialScreen('dashboard'));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Quando o faturamento abre o cadastro para corrigir endereço fiscal da NF. */
  const [clientFormReturnTo, setClientFormReturnTo] = useState<string | null>(null);
  const [clientFormNfAddressHint, setClientFormNfAddressHint] = useState(false);
  
  const [rebootCountdown, setRebootCountdown] = useState<number | null>(null);
  const [isCevaClient, setIsCevaClient] = useState(false);
  const [billingMissionId, setBillingMissionId] = useState<string | null>(null);
  const [billingMission, setBillingMission] = useState<any>(null);
  const [motivationPending, setMotivationPending] = useState(() => {
    try {
      const token = localStorage.getItem('authToken');
      const userData = localStorage.getItem('userData');
      if (!(token && userData)) return false;
      const u = JSON.parse(userData || '{}');
      return shouldShowMotivation(u.id || u.email || 'anon');
    } catch { return false; }
  });
  const [academyVersion, setAcademyVersion] = useState(0);

  const normalizedPath = window.location.pathname.toLowerCase().replace(/\/$/, '');
  const isPublicRoute = normalizedPath === '/cadastro-operacional';
  const isCevaPortalRoute = normalizedPath === '/ceva';
  const isIblPortalRoute = normalizedPath === '/ibl';
  const isPortalExternoRoute = isCevaPortalRoute || isIblPortalRoute;
  const isDhlSupplierRoute = normalizedPath === '/fornecedor/dhl';
  const isLiveTrackRoute = normalizedPath === '/rastreio';
  const isViaturasMapaRoute = normalizedPath === '/viaturas' || normalizedPath === '/dhl';
  const isResetPasswordRoute = normalizedPath === '/reset-password';
  const resetToken = new URLSearchParams(window.location.search).get('token') || '';

  const handleLogout = useCallback(async () => {
    let logoutReason = '';
    try {
      logoutReason = sessionStorage.getItem(LOGOUT_REASON_IDLE_KEY) || '';
    } catch {
      /* ignora */
    }
    try { window.dispatchEvent(new CustomEvent('tmseg:logout')); } catch {}
    await supabase.auth.signOut();
    clearLocalStoragePreservingForceLogoutSeen();
    try {
      sessionStorage.clear();
    } catch {
      /* ignora */
    }
    if (logoutReason) {
      try {
        sessionStorage.setItem(LOGOUT_REASON_IDLE_KEY, logoutReason);
      } catch {
        /* ignora */
      }
    }
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
          const { data, error } = await supabase.from('system_users').select(`name, status, force_password_change, permissions, profile_id, client_id, training_required, training_passed_at, training_modules, training_score, profiles:profile_id ( name, permissions )`).eq('id', user.id).single();
          if (error) {
            console.warn('[Sessão] Falha temporária ao verificar usuário — mantendo login:', error.message);
            return;
          }
          if (!data || data.status !== 'Ativo') { handleLogout(); return; }
          if (data.force_password_change) setNeedsPasswordChange(true);
          const profilePerms = data.profiles?.permissions || [];
          const userPerms = data.permissions || [];
          const combinedPermissions = [...new Set([...profilePerms, ...userPerms])];
          let needsUpdate = false;
          if (JSON.stringify(user.permissions) !== JSON.stringify(combinedPermissions)) {
              user.permissions = combinedPermissions;
              needsUpdate = true;
          }
          if (data.name && (!user.name || user.name === 'Usuário')) {
              user.name = data.name;
              needsUpdate = true;
          }
          if (data.profiles?.name && (!user.role || user.role === 'Usuário')) {
              user.role = data.profiles.name;
              needsUpdate = true;
          }
          user.trainingRequired = Boolean(data.training_required);
          user.trainingPassedAt = data.training_passed_at || null;
          user.trainingModules = normalizarModulos(data.training_modules);
          user.trainingScore = data.training_score ?? null;
          needsUpdate = true;
          if (needsUpdate) {
              localStorage.setItem('userData', JSON.stringify(user));
          }
          const enriched = await enrichUserWithCltData({
            ...user,
            email: user.email,
          });
          localStorage.setItem('userData', JSON.stringify(enriched));
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
    if (!isAuthenticated || isPublicRoute || isPortalExternoRoute) return;
    const roleDefault = getRoleDefaultScreen();
    if (roleDefault && !getScreenFromUrl()) {
      setCurrentScreen(roleDefault);
      persistScreen(roleDefault);
    }
  }, [isAuthenticated, isPublicRoute]);

  useEffect(() => {
    if (!isAuthenticated || isPublicRoute || isPortalExternoRoute) return;
    return wireUserActivityTracker();
  }, [isAuthenticated, isPublicRoute]);

  useEffect(() => {
    if (!isAuthenticated || isPublicRoute || isPortalExternoRoute) return;
    return wireNightHeartbeat();
  }, [isAuthenticated, isPublicRoute]);

  useEffect(() => {
    if (!isAuthenticated || isPublicRoute || isPortalExternoRoute) return;
    const channel = supabase
      .channel('global_reset_channel')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'system_logs',
          filter: 'entity=eq.FORCE_LOGOUT_SIGNAL',
        },
        () => {
          setRebootCountdown(10);
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'system_settings',
          filter: `key=eq.${FORCE_LOGOUT_SETTINGS_KEY}`,
        },
        (payload) => {
          const next = parseForceLogoutSignal(
            (payload.new as { value?: unknown } | null)?.value,
          );
          if (!next) return;
          const seen = localStorage.getItem(FORCE_LOGOUT_SEEN_KEY) || '';
          if (next === seen) return;
          localStorage.setItem(FORCE_LOGOUT_SEEN_KEY, next);
          setRebootCountdown(10);
        },
      )
      .subscribe();

    const poll = window.setInterval(async () => {
      try {
        const { data } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', FORCE_LOGOUT_SETTINGS_KEY)
          .maybeSingle();
        const next = parseForceLogoutSignal(data?.value);
        if (!next) return;
        const seen = localStorage.getItem(FORCE_LOGOUT_SEEN_KEY) || '';
        if (next === seen) return;
        localStorage.setItem(FORCE_LOGOUT_SEEN_KEY, next);
        setRebootCountdown(10);
      } catch {
        /* ignore */
      }
    }, 12_000);

    return () => {
      window.clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated, isPublicRoute]);

  useEffect(() => {
      if (rebootCountdown === null) return;
      if (rebootCountdown <= 0) { handleLogout(); return; }
      const timer = setTimeout(() => { setRebootCountdown(prev => (prev !== null ? prev - 1 : null)); }, 1000);
      return () => clearTimeout(timer);
  }, [rebootCountdown, handleLogout]);

  useEffect(() => {
    if (isPublicRoute || isPortalExternoRoute) return; 
    const storedVersion = localStorage.getItem('app_version');
    const token = localStorage.getItem('authToken');
    const userData = localStorage.getItem('userData');
    // Versão diferente: NÃO força logout (era agressivo demais e causava
    // bounces inesperados). Só atualiza marca local; o auto-update no
    // boot já recarrega o bundle se o servidor estiver mais novo.
    if (storedVersion && storedVersion !== APP_VERSION) {
      localStorage.setItem('app_version', APP_VERSION);
    } else if (!storedVersion) {
      localStorage.setItem('app_version', APP_VERSION);
    }
    if (!token || !userData) { if (isAuthenticated) handleLogout(); } else { verifySessionInDatabase(); }
  }, [isPublicRoute, isAuthenticated, handleLogout]);

  // Logout obrigatório: 30 min diurno / 20 min na vigia noturna (funcionários).
  // Conta mesmo com aba em segundo plano; diretoria/CEO isentos (admin entra na vigia).
  useEffect(() => {
    if (!isAuthenticated || isPublicRoute || isPortalExternoRoute) return;
    let loggingOut = false;

    const readRole = (): string | undefined => {
      try {
        const u = JSON.parse(localStorage.getItem('userData') || '{}');
        return u?.role;
      } catch {
        return undefined;
      }
    };

    const forceIdleLogout = async () => {
      if (loggingOut) return;
      if (!shouldEnforceSessionIdleLogout(readRole())) return;
      const idleMs = getIdleMs();
      if (!isIdleLogoutDue(idleMs)) return;
      loggingOut = true;
      const thresholdMin = getIdleLogoutThresholdMinutes();
      const idleMinutes = Math.max(thresholdMin, Math.floor(idleMs / 60_000));
      const reason = idleLogoutReasonKey();
      try {
        sessionStorage.setItem(LOGOUT_REASON_IDLE_KEY, reason);
      } catch {
        /* ignora */
      }
      try {
        await flushInteractionStats('idle_logout');
        await logProductivityEvent('SESSION_IDLE_LOGOUT', {
          idleMinutes,
          thresholdMinutes: thresholdMin,
          nightWatch: isNightWatchActive(),
        });
        if (isNightWatchActive()) {
          await reportNightIncident({
            type: 'force_logout',
            idleMinutes,
            details: { thresholdMinutes: thresholdMin },
          });
        }
      } catch {
        /* segue o logout mesmo se o log falhar */
      }
      await handleLogout();
    };

    const tick = () => {
      void forceIdleLogout();
    };

    tick();
    const idlePoll = window.setInterval(tick, 15_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const sessionInterval = setInterval(verifySessionInDatabase, 120000);
    return () => {
      window.clearInterval(idlePoll);
      clearInterval(sessionInterval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isAuthenticated, isPublicRoute, handleLogout]);

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
  const handleLogin = () => {
    setIsAuthenticated(true);
    verifySessionInDatabase();
    try {
      const u = JSON.parse(localStorage.getItem('userData') || '{}');
      setMotivationPending(shouldShowMotivation(u.id || u.email || 'anon'));
      const roleDefault = getRoleDefaultScreen();
      if (roleDefault) {
        setCurrentScreen(roleDefault);
        persistScreen(roleDefault);
      }
    } catch {
      setMotivationPending(true);
    }
  };

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
  const getStoredUser = () => {
    try { return JSON.parse(localStorage.getItem('userData') || '{}'); } catch { return {}; }
  };

  const navigateTo = (screen: string) => {
    const user = getStoredUser();
    const target = canAccessScreen(user, screen) ? screen : fallbackScreenForUser(user);
    setSelectedId(null);
    setCurrentScreen(target);
    persistScreen(target);
    touchUserActivity();
    window.dispatchEvent(new CustomEvent('tmseg:screen-change', { detail: target }));
  };
  const handleEdit = (screen: string, id: string) => {
    const user = getStoredUser();
    if (!canAccessScreen(user, screen)) {
      navigateTo(fallbackScreenForUser(user));
      return;
    }
    setSelectedId(id);
    setCurrentScreen(screen);
    persistScreen(screen);
  };

  useEffect(() => {
    const handler = (e: Event) => {
      const screen = (e as CustomEvent<string>).detail;
      if (typeof screen === 'string' && screen) navigateTo(screen);
    };
    window.addEventListener('tmseg:navigate', handler as EventListener);
    return () => window.removeEventListener('tmseg:navigate', handler as EventListener);
  }, []);
  const openBillingRef = useRef(handleOpenBillingMission);
  openBillingRef.current = handleOpenBillingMission;
  useEffect(() => {
    const handler = (e: Event) => {
      const missionId = String((e as CustomEvent).detail || '').trim();
      if (missionId) void openBillingRef.current(missionId);
    };
    window.addEventListener('tmseg:open-billing-mission', handler as EventListener);
    return () => window.removeEventListener('tmseg:open-billing-mission', handler as EventListener);
  }, []);
  const handleSaveAndContinue = (missionId: string) => { localStorage.setItem('openMissionOnLoad', missionId); navigateTo('missions'); };

  if (isPublicRoute) { return ( <NotificationProvider> <PublicAgentRegistration /> </NotificationProvider> ); }
  if (isDhlSupplierRoute) { return <DhlSupplierIntake />; }
  if (isLiveTrackRoute) { return <PublicLiveTrack />; }
  if (isViaturasMapaRoute) { return <MapaViaturasPublico />; }
  if (isIblPortalRoute) { return <IblPortal />; }
  if (isCevaPortalRoute) { return <CevaPortal />; }

  if (isResetPasswordRoute && resetToken) {
    return <ResetPassword token={resetToken} onComplete={() => { window.location.href = '/'; }} />;
  }
  
  if (!isAuthenticated) { return <Login onLogin={handleLogin} />; }
  
  if (needsPasswordChange) { return <ChangePasswordModal onSuccess={handlePasswordChanged} />; }

  if (operadorBloqueado(getStoredUser())) {
    return (
      <NotificationProvider>
        <TrainingAcademy
          key={academyVersion}
          mode="obrigatorio"
          onPassed={() => setAcademyVersion((v) => v + 1)}
          onLogout={handleLogout}
        />
      </NotificationProvider>
    );
  }

  if (motivationPending) {
    const u = (() => { try { return JSON.parse(localStorage.getItem('userData') || '{}'); } catch { return {}; } })();
    return <MotivationGate userId={u.id || u.email || 'anon'} userName={u.name || u.full_name} onAcknowledge={() => setMotivationPending(false)} />;
  }

  const renderContent = () => {
    const accessUser = getStoredUser();
    if (!canAccessScreen(accessUser, currentScreen)) {
      const fb = fallbackScreenForUser(accessUser);
      if (fb !== currentScreen) {
        // Corrige deep-link (?page=) sem permissão no perfil.
        queueMicrotask(() => navigateTo(fb));
      }
      return <Dashboard onOpenMission={handleOpenBillingMission} />;
    }

    switch (currentScreen) {
      case 'dashboard': return <Dashboard onOpenMission={handleOpenBillingMission} />;
      case 'treinamento': return <TrainingAcademy mode="revisao" />;
      case 'missions': return <MissionTable onNewMission={() => navigateTo('new-mission')} />;
      case 'controle-diario': return <ControleDiario />;
      case 'shift-handover': {
        const u = (() => { try { return JSON.parse(localStorage.getItem('userData') || '{}'); } catch { return {}; } })();
        const rl = (u.role || '').toLowerCase();
        const perms: string[] = Array.isArray(u.permissions) ? u.permissions : [];
        const isRestrictedClient = !!u.clientId || perms.some(p => typeof p === 'string' && p.startsWith('client_view:'));
        const allowed = !isRestrictedClient && (rl !== 'comercial' || perms.includes('*') || perms.includes('shift-handover'));
        return allowed ? <ShiftHandover /> : <Dashboard onOpenMission={handleOpenBillingMission} />;
      }
      case 'new-mission': return <MissionForm onBack={() => navigateTo('missions')} onSaveAndContinue={handleSaveAndContinue} onAddClient={() => navigateTo('client-form')} />;
      case 'ai-support':
        // P2-01: mantido inativo — AIChatbot + /api/chat existem; ativação exige validação de custo/segurança.
        return (
          <FeatureInactivePanel
            title="Assistente IA (Suporte)"
            reason="O chat com IA não está ativo nesta versão. O módulo AIChatbot e o endpoint /api/chat permanecem no código para eventual reativação após revisão de permissões, custo Gemini e política de uso."
            backlogRef="Classificação P2-01: MANTER INATIVO (decisão 2026-08-13)."
          />
        );
      case 'cost-optimization': return <CostOptimizationDashboard />;
      case 'db-maintenance': return <MaintenanceDashboard />;
      case 'fin-dashboard': return <FinancialDashboard onNavigate={navigateTo} />;
      case 'fin-transactions': return <FinancialTransactionList />;
      case 'fin-dre': return <FinancialDRE />;
      case 'fin-accounts': return <FinancialAccountManager />;
      case 'fin-categories': return <FinancialCategoryManager />;
      case 'fin-report': return <FinancialReport />;
      case 'diretoria-cockpit': {
        const u = (() => { try { return JSON.parse(localStorage.getItem('userData') || '{}'); } catch { return {}; } })();
        return canAccessDiretoriaMenu(u)
          ? <DashboardDiretoria onNavigate={navigateTo} />
          : <Dashboard onOpenMission={handleOpenBillingMission} />;
      }
      case 'comissoes-comerciais': {
        const u = (() => { try { return JSON.parse(localStorage.getItem('userData') || '{}'); } catch { return {}; } })();
        return canAccessComissoesComerciais(u)
          ? <ComissoesComerciaisPage />
          : <Dashboard onOpenMission={handleOpenBillingMission} />;
      }
      case 'diretoria-faturamento': {
        const u = (() => { try { return JSON.parse(localStorage.getItem('userData') || '{}'); } catch { return {}; } })();
        return canAccessFaturamentoDiretoria(u)
          ? (
            <DiretoriaFaturamentoPage
              onNavigate={navigateTo}
              onEditClient={(id) => {
                setClientFormReturnTo('diretoria-faturamento');
                handleEdit('client-form', id);
              }}
            />
          )
          : <Dashboard onOpenMission={handleOpenBillingMission} />;
      }
      case 'gestao-investimento': {
        const u = (() => { try { return JSON.parse(localStorage.getItem('userData') || '{}'); } catch { return {}; } })();
        return canAccessDiretoriaMenu(u)
          ? <GestaoInvestimento />
          : <Dashboard onOpenMission={handleOpenBillingMission} />;
      }
      case 'os-analysis-pending': {
        const u = (() => { try { return JSON.parse(localStorage.getItem('userData') || '{}'); } catch { return {}; } })();
        return canViewOsAnalysisPendencies(u)
          ? <OsAnalysisPendingPage onOpenMission={handleOpenBillingMission} />
          : <Dashboard onOpenMission={handleOpenBillingMission} />;
      }
      case 'fin-aprovacoes-pendentes': {
        const u = (() => { try { return JSON.parse(localStorage.getItem('userData') || '{}'); } catch { return {}; } })();
        return canViewAprovacoesPendentes(u)
          ? <AprovacoesPendentesPage onOpenMission={handleOpenBillingMission} />
          : <Dashboard onOpenMission={handleOpenBillingMission} />;
      }
      case 'fin-billing': return (
        <ClientBillingReport
          onNavigate={navigateTo}
          onOpenMission={handleOpenBillingMission}
          onEditClient={(id) => {
            setClientFormReturnTo('fin-billing');
            setClientFormNfAddressHint(true);
            handleEdit('client-form', id);
          }}
        />
      );
      case 'fin-daily-movement': return <DailyCashMovement />;
      case 'fin-vendor-verification': return <VendorVerificationControl onNavigate={navigateTo} onOpenMission={handleOpenBillingMission} />;
      case 'fin-invoices': return <FinancialInvoiceControl onNavigate={navigateTo} />;
      case 'fin-dhl-noncompliant': return <DhlNonCompliantTables onBack={() => navigateTo('fin-billing')} />;
      case 'clients': return <ClientList onAddClient={() => navigateTo('client-form')} onEdit={(id) => handleEdit('client-form', id)} />;
      case 'client-form': return (
        <ClientForm
          id={selectedId}
          nfAddressRequiredHint={clientFormNfAddressHint}
          onBack={() => {
            const ret = clientFormReturnTo;
            setClientFormReturnTo(null);
            setClientFormNfAddressHint(false);
            navigateTo(ret || 'clients');
          }}
          onSave={() => {}}
          onAddVehicle={() => navigateTo('client-vehicle-form')}
          onEditVehicle={(vid) => handleEdit('client-vehicle-form', vid)}
          onAddRoute={() => navigateTo('client-route-form')}
          onEditRoute={(rid) => handleEdit('client-route-form', rid)}
          onAddQuote={() => navigateTo('quote-form')}
          onEditQuote={(qid) => handleEdit('quote-form', qid)}
        />
      );
      case 'contract-manager': return <ContractManager />;
      case 'client-users': return <UserList userType="client" onAddUser={() => navigateTo('client-user-form')} onEdit={(id) => handleEdit('client-user-form', id)} />;
      case 'client-user-form': return <UserForm id={selectedId} userType="client" onBack={() => navigateTo('client-users')} />;
      case 'client-vehicles': return <ClientVehicleList onAddVehicle={() => navigateTo('client-vehicle-form')} onEdit={(id) => handleEdit('client-vehicle-form', id)} />;
      case 'client-vehicle-form': return <ClientVehicleForm id={selectedId} onBack={() => navigateTo('client-vehicles')} />;
      case 'client-routes': return <ClientRouteList onAdd={() => navigateTo('client-route-form')} onEdit={(id) => handleEdit('client-route-form', id)} />;
      case 'client-route-form': return <ClientRouteForm id={selectedId} onSuccess={() => navigateTo('client-routes')} />;
      case 'quotes': return <QuoteList onAdd={() => navigateTo('quote-form')} onEdit={(id) => handleEdit('quote-form', id)} />;
      case 'quote-form': return <QuoteForm id={selectedId} onBack={() => navigateTo('quotes')} />;
      case 'provider-activation-map': return <ProviderActivationMap />;
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
      case 'equipment-manager': return <EquipmentManager />;
      case 'system-logs': return <SystemLogs />;
      case 'manual-override-settings': return <ManualOverrideAlertSettings />;
      case 'system-settings': return <SystemSettingsPage onNavigate={navigateTo} />;
      case 'legal-dashboard': return <LegalDashboard />;
      case 'reports': return <ReportsDashboard />;
      case 'mission-report': {
        const u = (() => { try { return JSON.parse(localStorage.getItem('userData') || '{}'); } catch { return {}; } })();
        return canAccessMissionReport(u) ? <MissionReportPage /> : <Dashboard />;
      }
      case 'ranking-dhl': {
        const u = (() => { try { return JSON.parse(localStorage.getItem('userData') || '{}'); } catch { return {}; } })();
        const rl = (u.role || '').toLowerCase();
        const allowed = rl === 'avançado' || rl === 'avancado' || rl === 'diretoria' || rl === 'administrador';
        return allowed ? <RankingDHL /> : <Dashboard />;
      }
      case 'support-network': return <SupportMapFinder onNavigate={navigateTo} />;
      default: {
        if (currentScreen.startsWith('rh-')) {
          const u = (() => { try { return JSON.parse(localStorage.getItem('userData') || '{}'); } catch { return {}; } })();
          if (!canAccessRhScreen(currentScreen, u)) return <Dashboard onOpenMission={handleOpenBillingMission} />;
          return <RhModule screen={currentScreen} selectedId={selectedId} onNavigate={navigateTo} onEdit={handleEdit} />;
        }
        return <Dashboard onOpenMission={handleOpenBillingMission} />;
      }
    }
  };

  return (
    <QueryClientProvider client={queryClient}>
    <RealtimeProvider>
    <NotificationProvider>
        <UserPresenceTracker enabled={isAuthenticated && !isPublicRoute && !isDhlSupplierRoute && !isLiveTrackRoute && !isResetPasswordRoute} />
        <TimeClockGate onLogout={handleLogout} onCleared={() => {}}>
        <div className="flex min-h-screen-ios overflow-x-auto overflow-y-auto font-sans text-gray-800 relative" style={{ maxWidth: '100vw' }}>
        
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
        <PushNotificationManager />
        <PresenceDebugPanel />
        {(() => { try { const u = JSON.parse(localStorage.getItem('userData') || '{}'); const r = (u.role || '').toLowerCase(); const allowed = ['operador', 'avançado', 'avancado']; return allowed.includes(r); } catch { return false; } })() && <><MissionAlertMonitor /><EvidenceStartAlert /></>}
        {isAuthenticated && !isPublicRoute && !isDhlSupplierRoute && !isLiveTrackRoute && !isResetPasswordRoute && <VeladaClosureAlert />}
        {isAuthenticated && !isPublicRoute && !isDhlSupplierRoute && !isLiveTrackRoute && !isResetPasswordRoute && <DhlCopiaAoVivo />}
        {isAuthenticated && !isPublicRoute && !isDhlSupplierRoute && !isLiveTrackRoute && !isResetPasswordRoute && <DhlViaturaNovaAlerta />}
        <div className="flex-1 flex flex-col min-h-0 min-w-0 relative z-10 lg:pl-20">
            {isSidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setIsSidebarOpen(false)}></div>}
            <Header onMenuClick={toggleSidebar} onProfileSettingsClick={() => setIsProfileSettingsOpen(true)} isCevaClient={isCevaClient} />
            <WhatsAppStatusBanner />
            <OsAnalysisDiretoriaModal onOpenMission={handleOpenBillingMission} />
            <IdlePresenceGuard />
            <main className="flex-1 overflow-x-auto overflow-y-auto p-3 sm:p-4 md:p-6 scrollbar-thin" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="w-full mx-auto relative">
                <TabelaRotaAlertaUsuario />
                <AppErrorBoundary onReset={() => {
                  // Só limpa o erro — não joga o usuário pro dashboard automaticamente.
                }}>
                  {renderContent()}
                </AppErrorBoundary>
                <footer className="mt-8 text-center text-[10px] text-gray-400 pb-4 uppercase">&copy; {new Date().getFullYear()} Grupo TMSEG.</footer>
            </div>
            </main>
        </div>
        {isProfileSettingsOpen && ( <ProfileSettingsModal onClose={() => setIsProfileSettingsOpen(false)} onSuccess={() => { setIsProfileSettingsOpen(false); alert("Dados atualizados com sucesso! Por segurança, por favor, faça login novamente."); handleLogout(); }} /> )}
        {billingMissionId && billingMission && ( <MissionFinancialModal isOpen={true} onClose={() => { setBillingMissionId(null); setBillingMission(null); }} mission={billingMission} onUpdate={() => { setBillingMissionId(null); setBillingMission(null); window.dispatchEvent(new CustomEvent('refreshMissions')); }} /> )}
        </div>
        </TimeClockGate>
    </NotificationProvider>
    </RealtimeProvider>
    </QueryClientProvider>
  );
};

export default App;
