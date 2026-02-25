
import React, { useState, useEffect } from 'react';
import { Mail, Lock, Loader2, AlertCircle, ShieldCheck, Shield, Eye, EyeOff, Fingerprint, Radio } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { logAction } from '../lib/logger';
import { APP_VERSION } from '../constants';

interface LoginProps {
  onLogin: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [dbStatus, setDbStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  const bgImages = [
    'https://images.unsplash.com/photo-1614064641938-3bbee52942c7?q=80&w=2070&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?q=80&w=2070&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?q=80&w=2070&auto=format&fit=crop',
  ];

  useEffect(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('app_version', APP_VERSION);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex(prev => (prev + 1) % bgImages.length);
    }, 8000);
    return () => clearInterval(interval);
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
      const { data: userCheck, error: checkError } = await supabase
        .from('system_users')
        .select(`
            id,
            name,
            email,
            password,
            status,
            client_id,
            provider_id,
            profile_id,
            force_password_change,
            permissions, 
            profiles:profile_id (
                name,
                permissions
            )
        `)
        .ilike('email', cleanEmail)
        .maybeSingle();

      if (checkError) {
        console.error("Database Auth Error:", checkError);
        throw new Error(`Falha de comunicação com o servidor.`);
      }

      if (!userCheck) {
        throw new Error('E-mail não localizado no sistema.');
      }

      if (userCheck.password !== cleanPassword) {
        throw new Error('Senha incorreta. Verifique e tente novamente.');
      }

      if (userCheck.status !== 'Ativo') {
        throw new Error('Sua conta está inativa ou bloqueada. Contate a administração.');
      }

      const profilePerms = userCheck.profiles?.permissions || [];
      const userPerms = userCheck.permissions || [];
      const combinedPermissions = [...new Set([...profilePerms, ...userPerms])];

      const userData = {
        id: userCheck.id,
        name: userCheck.name,
        email: userCheck.email,
        role: userCheck.profiles?.name || 'Usuário',
        permissions: combinedPermissions,
        clientId: userCheck.client_id,
        providerId: userCheck.provider_id,
        force_password_change: userCheck.force_password_change
      };

      localStorage.setItem('authToken', `tmseg-token-${userCheck.id}-${Date.now()}`);
      localStorage.setItem('userData', JSON.stringify(userData));
      localStorage.setItem('app_version', APP_VERSION);

      await logAction('LOGIN', 'Auth', userCheck.id, `Login realizado: ${userCheck.name}`);
      onLogin();

    } catch (err: any) {
      console.error('Detailed Auth Error:', err);
      setError(err.message || 'Falha na autenticação.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex font-sans overflow-hidden relative">

      <div className="absolute inset-0 z-0">
        {bgImages.map((img, idx) => (
          <img
            key={idx}
            src={img}
            alt=""
            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-[2000ms]"
            style={{ opacity: idx === currentImageIndex ? 1 : 0 }}
            onLoad={() => idx === 0 && setImageLoaded(true)}
          />
        ))}
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/95 to-black/40"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30"></div>
      </div>

      <div className="hidden lg:flex absolute top-0 right-0 bottom-0 w-[55%] z-[1] items-center justify-center pointer-events-none">
        <div className="relative">
          <div className="absolute -inset-20 bg-red-600/5 rounded-full blur-3xl"></div>
          <div className="text-center space-y-4 relative">
            <div className="inline-flex items-center gap-3 bg-white/5 backdrop-blur-sm border border-white/10 rounded-full px-6 py-3">
              <Radio size={14} className="text-red-500 animate-pulse" />
              <span className="text-white/60 text-xs font-bold uppercase tracking-[0.3em]">Monitoramento 24h</span>
            </div>
            <h2 className="text-5xl font-black text-white/10 tracking-widest uppercase">Proteção</h2>
            <h2 className="text-5xl font-black text-white/5 tracking-widest uppercase">Total</h2>
          </div>
        </div>
      </div>

      <div className="relative z-10 flex items-center w-full lg:w-[45%] min-h-screen">
        <div className="w-full max-w-md mx-auto px-8 md:px-12 py-12">

          <div className="mb-10">
            <div className="flex items-center gap-4 mb-8">
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-br from-red-600 to-red-800 rounded-2xl flex items-center justify-center shadow-lg shadow-red-900/30 rotate-3">
                  <img
                    src="/logo.png"
                    alt="TMSEG"
                    className="h-9 w-auto object-contain drop-shadow-lg -rotate-3"
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
                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-black flex items-center justify-center">
                  <div className="w-2 h-2 bg-white rounded-full"></div>
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-black text-white tracking-wide">
                  GRUPO TM<span className="text-red-500">SEG</span>
                </h1>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.35em]">Segurança Patrimonial & Escolta Armada</p>
              </div>
            </div>

            <div className="space-y-2 mb-8">
              <h2 className="text-xl font-black text-white">Acesso ao Sistema</h2>
              <p className="text-sm text-gray-500 font-medium">Área restrita. Identifique-se para continuar.</p>
            </div>

            <div className="flex items-center gap-3 mb-8">
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
                    Acessar Sistema
                  </>
                )}
              </button>
            </div>
          </form>

          <div className="mt-10 pt-6 border-t border-white/5">
            <div className="flex items-center justify-between">
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

          <div className="mt-6 grid grid-cols-3 gap-3">
            {[
              { label: 'Escolta Armada', icon: Shield },
              { label: 'Rastreamento', icon: Radio },
              { label: 'Seg. Patrimonial', icon: Fingerprint },
            ].map((item, i) => (
              <div key={i} className="flex flex-col items-center gap-2 p-3 bg-white/[0.02] rounded-xl border border-white/5">
                <item.icon size={16} className="text-red-600/60" />
                <span className="text-[9px] font-bold text-gray-600 uppercase tracking-wider text-center leading-tight">{item.label}</span>
              </div>
            ))}
          </div>

        </div>
      </div>

      <style>{`
        @keyframes scan {
          0%, 100% { transform: translateY(-100%); opacity: 0; }
          10%, 90% { opacity: 0.03; }
          50% { transform: translateY(100%); opacity: 0.03; }
        }
      `}</style>
    </div>
  );
};

export default Login;
