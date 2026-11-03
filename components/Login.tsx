
import React, { useState, useEffect } from 'react';
import { Mail, Lock, Loader2, AlertCircle, ShieldCheck, Shield, Eye, EyeOff, Fingerprint, Radio } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { logAction } from '../lib/logger';
import { enrichUserWithCltData } from '../lib/timeclock/cltEmployee';
import {
  hasFaceRegistered,
  requiresTimeclockUser,
} from '../lib/timeclock/eligibility';
import FaceAuthGate from './FaceAuthGate';
import type { TimeClockUserContext } from '../lib/timeclock/types';
import { APP_VERSION } from '../constants';
import { normalizarModulos } from '../lib/training/operadorAcademy';
import { clearLocalStoragePreservingForceLogoutSeen } from '../lib/forceLogout';
import { caminhoPortalDasPermissoes, usuarioSoPortal } from '../lib/cevaPortal/regrasAcesso';

interface LoginProps {
  onLogin: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [dbStatus, setDbStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [agora, setAgora] = useState(() => new Date());
  const [authPhase, setAuthPhase] = useState<'credentials' | 'face'>('credentials');
  const [pendingUser, setPendingUser] = useState<TimeClockUserContext | null>(null);
  const [faceMode, setFaceMode] = useState<'register' | 'verify'>('register');

  useEffect(() => {
    let logoutReason = '';
    try {
      logoutReason = sessionStorage.getItem('tmseg:logout_reason') || '';
    } catch {
      /* ignora */
    }
    // Preserva force_logout_seen — senão o boot em index.tsx entra em loop de reload.
    clearLocalStoragePreservingForceLogoutSeen();
    try {
      sessionStorage.clear();
    } catch {
      /* ignora */
    }
    if (logoutReason) {
      try {
        sessionStorage.setItem('tmseg:logout_reason', logoutReason);
      } catch {
        /* ignora */
      }
    }
    localStorage.setItem('app_version', APP_VERSION);
    if (logoutReason === 'idle_30min') {
      setError(
        'Sessão encerrada por 30 minutos sem interação no sistema. Faça login novamente.',
      );
    } else if (logoutReason === 'night_idle') {
      setError(
        'Sessão encerrada na vigia noturna (20 min sem interação). Faça login novamente.',
      );
    } else if (logoutReason === 'night_challenge_timeout') {
      setError(
        'Sessão encerrada: desafio de presença noturna sem resposta. Faça login novamente.',
      );
    }
  }, []);

  useEffect(() => {
    const relogio = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(relogio);
  }, []);

  useEffect(() => {
    const checkDb = async () => {
      try {
        const { error } = await supabase.from('profiles').select('id', { count: 'exact', head: true });
        setDbStatus(error ? 'offline' : 'online');
      } catch {
        setDbStatus('offline');
      }
    };
    checkDb();
    const interval = setInterval(checkDb, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      setError('Preencha e-mail e senha corretamente.');
      setIsLoading(false);
      return;
    }

    try {
      const resposta = await fetch('/api/ponte-auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, senha: cleanPassword }),
      });
      const corpo = await resposta.json() as {
        ok?: boolean;
        codigo?: string;
        motivo?: string;
        token?: string;
        usuario?: {
          id: string;
          name: string;
          email: string;
          role: string;
          permissions: string[];
          clientId: string | null;
          providerId: string | null;
          force_password_change: boolean;
          trainingRequired?: boolean;
          trainingPassedAt?: string | null;
          trainingModules?: unknown;
          trainingScore?: number | null;
        };
      };
      if (!resposta.ok || !corpo.ok || !corpo.token || !corpo.usuario) {
        if (corpo.codigo === 'portal_only') {
          throw new Error(`Este acesso é somente o portal do cliente. Entre em ${window.location.origin}`);
        }
        if (corpo.codigo === 'usuario_desativado') {
          throw new Error('Sua conta está inativa ou bloqueada. Contate a administração.');
        }
        if (corpo.codigo === 'credenciais_invalidas') {
          throw new Error('E-mail ou senha incorretos. Verifique e tente novamente.');
        }
        throw new Error(corpo.motivo || 'Falha de comunicação com o servidor.');
      }

      const usuario = corpo.usuario;
      if (usuarioSoPortal(usuario.permissions || [])) {
        const caminho = caminhoPortalDasPermissoes(usuario.permissions) || '';
        throw new Error(`Este acesso é somente o portal do cliente. Entre em ${window.location.origin}${caminho}`);
      }

      let userData = {
        id: usuario.id,
        name: usuario.name,
        email: usuario.email,
        role: usuario.role || 'Usuário',
        permissions: usuario.permissions || [],
        clientId: usuario.clientId,
        providerId: usuario.providerId,
        force_password_change: usuario.force_password_change,
      };
      userData = await enrichUserWithCltData(userData);
      const sessionUser = {
        ...userData,
        trainingRequired: Boolean(usuario.trainingRequired),
        trainingPassedAt: usuario.trainingPassedAt || null,
        trainingModules: normalizarModulos(usuario.trainingModules),
        trainingScore: usuario.trainingScore ?? null,
      };

      localStorage.setItem('authToken', corpo.token);
      if (requiresTimeclockUser(sessionUser)) {
        setPendingUser(sessionUser);
        setFaceMode(hasFaceRegistered(sessionUser) ? 'verify' : 'register');
        setAuthPhase('face');
        setIsLoading(false);
        return;
      }

      localStorage.setItem('userData', JSON.stringify(sessionUser));
      localStorage.setItem('app_version', APP_VERSION);
      await logAction('LOGIN', 'Auth', usuario.id, `Login realizado: ${usuario.name}`);
      onLogin();

    } catch (err: any) {
      console.error('Detailed Auth Error:', err);
      setError(err.message || 'Falha na autenticação.');
    } finally {
      setIsLoading(false);
    }
  };

  const completeLogin = async (userData: TimeClockUserContext, userId: string, userName: string) => {
    localStorage.setItem('userData', JSON.stringify(userData));
    localStorage.setItem('app_version', APP_VERSION);
    await logAction('LOGIN', 'Auth', userId, `Login realizado: ${userName}`);
    onLogin();
  };

  if (authPhase === 'face' && pendingUser) {
    return (
      <FaceAuthGate
        user={pendingUser}
        mode={faceMode}
        onSuccess={(updated) => {
          void completeLogin(updated, pendingUser.id, pendingUser.name);
        }}
        onCancel={() => {
          localStorage.removeItem('authToken');
          setAuthPhase('credentials');
          setPendingUser(null);
        }}
      />
    );
  }

  const horaOperacional = agora.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });

  return (
    <div className="tmseg-login font-sans">

      <div className="tmseg-hero" aria-hidden="true">
        <img src="/login-hero.jpg" alt="" className="tmseg-hero-img" />
        <div className="tmseg-hero-shade" />
      </div>
      <div className="tmseg-brand">
        <img src="/logo.png" alt="Grupo TM SEG" />
      </div>
      <div className="tmseg-login-copy">
        <h2>Segurança<br />em movimento.</h2>
        <p>Inteligência, controle e proteção em cada missão.</p>
        <div className="tmseg-central">
          <Radio size={16} />
          <span>Central 24h · {horaOperacional}<small>Monitoramento em tempo real</small></span>
        </div>
      </div>

      <div className="tmseg-login-card">
        <div className="tmseg-login-card-inner">

          <div className="mb-6">
            <div className="flex items-center gap-4 mb-5">
              <div className="relative">
                <div className="flex items-center justify-center">
                  <img
                    src="/logo.png"
                    alt="TMSEG"
                    className="h-16 w-auto object-contain drop-shadow-lg"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      const parent = e.currentTarget.parentElement;
                      if (parent) {
                        const icon = document.createElement('div');
                        icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>';
                        parent.appendChild(icon);
                      }
                    }}
                  />
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-black text-white tracking-wide">
                  GRUPO TM<span className="text-red-500">SEG</span>
                </h1>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.25em]">Intermediadora de Escolta Armada & Seg. Patrimonial</p>
              </div>
            </div>

            <div className="space-y-1 mb-5">
              <h2 className="text-xl font-black text-white">Bem-vindo de volta</h2>
              <p className="text-sm text-gray-400 font-medium">Acesse sua central de operações.</p>
            </div>

            <div className="flex items-center gap-3 mb-5">
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                <Shield size={12} className="text-red-500" />
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Conexão Segura</span>
              </div>
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                <Fingerprint size={12} className="text-red-500" />
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Criptografado</span>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" data-testid="login-form">
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                <Mail size={12} className="text-red-500" />
                Identificação Corporativa
              </label>
              <div className="relative group">
                <input
                  type="text"
                  className="w-full px-4 py-4 bg-white/5 border border-white/10 text-white rounded-xl focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 outline-none transition-all placeholder-gray-600 text-sm font-medium tracking-wide"
                  placeholder="seu.email@empresa.com.br"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  data-testid="input-email"
                />
                <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-red-500/0 via-red-500/0 to-red-500/0 group-focus-within:from-red-500/5 group-focus-within:via-transparent group-focus-within:to-red-500/5 pointer-events-none transition-all"></div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                <Lock size={12} className="text-red-500" />
                Senha de Acesso
              </label>
              <div className="relative group">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="w-full px-4 py-4 pr-12 bg-white/5 border border-white/10 text-white rounded-xl focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 outline-none transition-all placeholder-gray-600 text-sm font-medium tracking-widest"
                  placeholder="••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  data-testid="input-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-red-400 transition-colors"
                  data-testid="button-toggle-password"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
                <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-red-500/0 via-red-500/0 to-red-500/0 group-focus-within:from-red-500/5 group-focus-within:via-transparent group-focus-within:to-red-500/5 pointer-events-none transition-all"></div>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-3 text-red-300 text-xs bg-red-950/40 p-4 rounded-xl border border-red-900/30" data-testid="text-login-error">
                <AlertCircle size={18} className="text-red-500 shrink-0" />
                <span className="font-bold">{error}</span>
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center items-center gap-3 py-4 px-6 text-sm font-black rounded-xl text-white bg-gradient-to-r from-red-700 via-red-600 to-red-700 hover:from-red-600 hover:via-red-500 hover:to-red-600 transition-all shadow-lg shadow-red-900/30 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-[0.2em] active:scale-[0.98]"
                data-testid="button-submit"
              >
                {isLoading ? (
                  <Loader2 size={20} className="animate-spin text-white" />
                ) : (
                  <>
                    <ShieldCheck size={18} />
                    Entrar no sistema
                  </>
                )}
              </button>
            </div>
          </form>

          <div className="mt-6 pt-5 border-t border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-gray-600 font-mono font-bold">v{APP_VERSION}</span>
                <div className="w-px h-3 bg-white/10"></div>
                <span className="text-[10px] text-gray-600 font-bold uppercase tracking-wider">Grupo TMSEG</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${dbStatus === 'online' ? 'bg-green-500 animate-pulse' : dbStatus === 'offline' ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'}`}></div>
                <span className={`text-[10px] font-bold font-mono uppercase tracking-wider ${dbStatus === 'online' ? 'text-green-500' : dbStatus === 'offline' ? 'text-red-500' : 'text-yellow-500'}`}>
                  {dbStatus === 'online' ? 'SISTEMA OPERACIONAL' : dbStatus === 'offline' ? 'SISTEMA OFFLINE' : 'VERIFICANDO...'}
                </span>
              </div>
            </div>
          </div>

        </div>
      </div>

      <style>{`
        .tmseg-login {
          position: relative;
          min-height: 100vh;
          min-height: 100dvh;
          overflow: hidden;
          background:
            radial-gradient(900px 520px at 18% 18%, rgba(196, 0, 24, 0.28), transparent 60%),
            radial-gradient(700px 420px at 80% 80%, rgba(255, 45, 45, 0.08), transparent 55%),
            #050507;
          color: #fff;
        }
        .tmseg-hero { position: absolute; inset: 0; overflow: hidden; }
        .tmseg-hero-img {
          position: absolute; inset: -4%; width: 108%; height: 108%; object-fit: cover; object-position: 42% center;
          animation: tmseg-ken 22s ease-in-out infinite alternate;
        }
        .tmseg-hero-shade {
          position: absolute; inset: 0;
          background:
            linear-gradient(90deg, rgba(0,0,0,.2) 0 48%, rgba(0,0,0,.55) 70%, rgba(0,0,0,.78) 100%),
            linear-gradient(to top, rgba(0,0,0,.72) 0 18%, transparent 42%);
        }
        .tmseg-hero::after {
          content: ""; position: absolute; inset: 0; pointer-events: none;
          background: linear-gradient(105deg, transparent 35%, rgba(255,255,255,.14) 48%, transparent 60%);
          transform: translateX(-70%);
          animation: tmseg-sheen 7.5s ease-in-out infinite;
        }
        .tmseg-brand { position: absolute; z-index: 2; left: 3vw; top: 3vh; }
        .tmseg-brand img {
          height: 92px; width: auto; mix-blend-mode: screen;
          filter: drop-shadow(0 8px 18px rgba(0,0,0,.45));
          animation: tmseg-logo 3.6s ease-in-out infinite;
        }
        .tmseg-login-copy { position: absolute; left: 4vw; bottom: 7vh; max-width: 560px; z-index: 2; }
        .tmseg-login-copy h2 {
          margin: 0; font-size: clamp(42px, 5vw, 68px); line-height: .9; font-weight: 900;
          letter-spacing: -0.04em; text-transform: uppercase;
        }
        .tmseg-login-copy p { margin: 14px 0 0; max-width: 420px; color: rgba(255,255,255,.78); font-size: 16px; }
        .tmseg-central { display: flex; align-items: center; gap: 10px; margin-top: 22px; color: #ff4d4d; }
        .tmseg-central span { display: grid; font-size: 13px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
        .tmseg-central small { color: rgba(255,255,255,.62); font-weight: 600; letter-spacing: .14em; }
        .tmseg-login-card {
          position: relative; z-index: 3; width: min(460px, calc(100% - 32px));
          margin: 28px auto; max-height: calc(100dvh - 56px); overflow: auto;
        }
        .tmseg-login-card-inner {
          padding: 28px 26px 22px; border-radius: 28px;
          background: linear-gradient(180deg, rgba(16,16,20,.82), rgba(8,8,10,.9));
          border: 1px solid rgba(255,255,255,.12);
          box-shadow: 0 30px 80px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.12);
          backdrop-filter: blur(18px);
        }
        @media (min-width: 1100px) {
          .tmseg-login-card {
            position: absolute; right: 4vw; top: 50%; transform: translateY(-50%); margin: 0;
          }
        }
        @media (max-width: 1099px) {
          .tmseg-login { overflow: auto; }
          .tmseg-hero { position: relative; height: 46vh; min-height: 280px; }
          .tmseg-brand { left: 16px; top: 12px; }
          .tmseg-brand img { height: 64px; }
          .tmseg-login-copy { left: 16px; right: 16px; bottom: 16px; }
          .tmseg-login-copy h2 { font-size: 34px; }
          .tmseg-login-card { margin: -28px auto 24px; }
        }
        @keyframes tmseg-ken { to { transform: scale(1.08) translate3d(-1.5%, -1%, 0); } }
        @keyframes tmseg-sheen { to { transform: translateX(70%); } }
        @keyframes tmseg-logo { 50% { filter: drop-shadow(0 0 16px rgba(255,40,40,.55)); } }
        @media (prefers-reduced-motion: reduce) {
          .tmseg-hero-img, .tmseg-hero::after, .tmseg-brand img { animation: none !important; }
        }
      `}</style>
    </div>
  );
};

export default Login;
