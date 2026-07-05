
import React, { useState, useEffect } from 'react';
import { Lock, ArrowRight, Loader2, AlertCircle, Key } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ChangePasswordModalProps {
  onSuccess: () => void;
}

const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ onSuccess }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    const storedUser = localStorage.getItem('userData');
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        setUserEmail(user.email);
      } catch (e) {
        setError('Não foi possível identificar o seu usuário.');
      }
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!newPassword || !confirmPassword) {
      setError('Por favor, preencha ambos os campos.');
      return;
    }
    if (newPassword.length < 6) {
      setError('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setIsLoading(true);

    try {
      const { error: updateError } = await supabase
        .from('system_users')
        .update({ 
          password: newPassword,
          force_password_change: false
        })
        .eq('email', userEmail);
      
      if (updateError) {
        throw new Error(updateError.message || 'Falha ao atualizar a senha.');
      }

      alert('Senha atualizada com sucesso! Você já pode acessar o sistema.');
      onSuccess();

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden font-sans bg-gray-100">
      <div className="absolute inset-0 z-0">
        <img 
          src="/background.png" 
          alt="Security Operations Center" 
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-black/90 via-gray-900/80 to-red-950/50"></div>
      </div>

      <div className="w-full max-w-lg p-6 relative z-10 mx-4">
        <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-8 md:p-10">
                <div className="text-center mb-8">
                    <div className="inline-block p-3 bg-white/10 rounded-full border border-white/10 mb-4">
                        <Key size={32} className="text-red-500" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">Alteração de Senha Obrigatória</h1>
                    <p className="text-sm text-gray-300">Por segurança, crie uma nova senha pessoal para o seu primeiro acesso.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Nova Senha</label>
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <Lock size={18} className="text-gray-500 group-focus-within:text-red-500 transition-colors" />
                            </div>
                            <input
                                type="password"
                                className="w-full pl-11 pr-4 py-3.5 bg-black/60 border border-gray-700 text-white rounded-lg focus:ring-1 focus:ring-red-500"
                                placeholder="••••••••"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Confirme a Nova Senha</label>
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <Lock size={18} className="text-gray-500 group-focus-within:text-red-500 transition-colors" />
                            </div>
                            <input
                                type="password"
                                className="w-full pl-11 pr-4 py-3.5 bg-black/60 border border-gray-700 text-white rounded-lg focus:ring-1 focus:ring-red-500"
                                placeholder="••••••••"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 text-red-200 text-xs bg-red-950/60 p-3 rounded-lg border border-red-900/50">
                            <AlertCircle size={16} className="text-red-500 shrink-0" />
                            <span className="font-semibold">{error}</span>
                        </div>
                    )}

                    <div className="pt-4">
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full flex justify-center py-3.5 px-4 text-sm font-bold rounded-lg text-white bg-red-700 hover:bg-red-600 transition-all"
                        >
                            {isLoading ? (
                                <Loader2 size={20} className="animate-spin" />
                            ) : (
                                <span className="flex items-center gap-2">Salvar Nova Senha <ArrowRight size={16} /></span>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ChangePasswordModal;
