
import React, { useState, useEffect } from 'react';
import { Mail, Lock, Loader2, Globe, AlertCircle, ShieldCheck } from 'lucide-react';
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

  useEffect(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('app_version', APP_VERSION);
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
      // 1. Verificação inicial por email (Ignorando status para dar erro preciso)
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

      // 2. Verificações de Segurança
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
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden font-sans">
      <div className="absolute inset-0 z-0">
        <img 
          src="/background.png" 
          alt="Background" 
          className="w-full h-full object-cover"
          onError={(e) => {
            e.currentTarget.src = "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=2070&auto=format&fit=crop";
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-black/90 via-gray-900/80 to-red-950/50"></div>
      </div>

      <div className="w-full max-w-lg p-6 relative z-10 mx-4">
        <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-800 via-red-600 to-red-800"></div>

            <div className="p-8 md:p-10">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center mb-6 bg-white/5 p-4 rounded-full border border-white/5 shadow-inner">
                        <img 
                          src="/logo.png" 
                          alt="Logo TMSEG" 
                          className="h-16 w-auto object-contain drop-shadow-xl"
                        />
                    </div>
                    <div className="flex flex-col items-center">
                        <span className="text-gray-400 font-medium tracking-[0.4em] text-xs mb-1 uppercase">Plataforma de Gestão</span>
                        <h1 className="text-3xl font-black text-white tracking-widest mb-1">
                            TM<span className="text-red-600">SEG</span>
                        </h1>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 flex items-center gap-1 tracking-wider">
                            <Globe size={10} className="text-red-500" /> ID Corporativo
                        </label>
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <Mail size={18} className="text-gray-500 group-focus-within:text-red-500 transition-colors" />
                            </div>
                            <input
                                type="text"
                                className="w-full pl-11 pr-4 py-3.5 bg-black/60 border border-gray-700 text-white rounded-lg focus:ring-1 focus:ring-red-500 focus:border-red-500 outline-none transition-all placeholder-gray-600 text-sm"
                                placeholder="usuario@tmseg.com.br"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1 tracking-wider ml-1">
                            <Lock size={10} className="text-red-500" /> Senha
                        </label>
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <Lock size={18} className="text-gray-500 group-focus-within:text-red-500 transition-colors" />
                            </div>
                            <input
                                type="password"
                                className="w-full pl-11 pr-4 py-3.5 bg-black/60 border border-gray-700 text-white rounded-lg focus:ring-1 focus:ring-red-500 focus:border-red-500 outline-none transition-all placeholder-gray-600 text-sm"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="flex items-start gap-3 text-red-200 text-xs bg-red-950/60 p-3 rounded-lg border border-red-900/50 animate-pulse">
                            <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
                            <span className="font-semibold">{error}</span>
                        </div>
                    )}

                    <div className="pt-4">
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full flex justify-center py-3.5 px-4 border border-transparent text-sm font-bold rounded-lg text-white bg-red-700 hover:bg-red-600 transition-all shadow-lg disabled:opacity-50"
                        >
                            {isLoading ? (
                                <Loader2 size={18} className="animate-spin text-white" />
                            ) : (
                                <span className="flex items-center gap-2 tracking-widest text-xs"><ShieldCheck size={16} /> ENTRAR NO SISTEMA</span>
                            )}
                        </button>
                    </div>
                </form>
            </div>

            <div className="px-8 py-3 bg-black/80 border-t border-white/5 flex justify-between items-center">
                <span className="text-[10px] text-gray-500 font-mono">v{APP_VERSION}</span>
                <div className="flex items-center gap-1.5 text-[10px] text-green-500 font-bold font-mono tracking-wider">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                    DATABASE ONLINE
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
