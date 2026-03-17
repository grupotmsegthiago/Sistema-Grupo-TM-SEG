import { useState, useEffect } from 'react';
import { KeyRound, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';

interface ResetPasswordProps {
  token: string;
  onComplete: () => void;
}

const ResetPassword: React.FC<ResetPasswordProps> = ({ token, onComplete }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [tokenValid, setTokenValid] = useState(false);

  useEffect(() => {
    validateToken();
  }, [token]);

  const validateToken = async () => {
    try {
      const res = await fetch('/api/password-reset/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        setTokenValid(true);
        setUserName(data.userName);
        setUserEmail(data.userEmail);
      } else {
        setError(data.error || 'Token inválido ou expirado.');
      }
    } catch {
      setError('Erro ao validar o link. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('As senhas não conferem.');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess(true);
        setTimeout(() => onComplete(), 3000);
      } else {
        setError(data.error || 'Erro ao redefinir senha.');
      }
    } catch {
      setError('Erro de conexão. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={40} className="animate-spin text-white mx-auto mb-4" />
          <p className="text-white/70 text-sm font-bold uppercase tracking-widest">Validando link...</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={32} className="text-green-600" />
          </div>
          <h2 className="text-xl font-black text-gray-900 mb-2">Senha Alterada!</h2>
          <p className="text-sm text-gray-600 mb-4">Sua nova senha foi definida com sucesso. Você será redirecionado para o login...</p>
          <Loader2 size={20} className="animate-spin text-gray-400 mx-auto" />
        </div>
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={32} className="text-red-600" />
          </div>
          <h2 className="text-xl font-black text-gray-900 mb-2">Link Inválido</h2>
          <p className="text-sm text-gray-600 mb-6">{error || 'Este link de redefinição de senha é inválido ou já expirou.'}</p>
          <button
            onClick={onComplete}
            className="bg-black text-white px-6 py-2.5 rounded-lg font-bold text-sm uppercase hover:bg-gray-800 transition-colors"
            data-testid="button-back-login"
          >
            Voltar ao Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldCheck size={32} className="text-blue-600" />
          </div>
          <h2 className="text-xl font-black text-gray-900 mb-1">Definir Nova Senha</h2>
          <p className="text-sm text-gray-500">
            Olá <span className="font-bold text-gray-700">{userName}</span>, defina sua nova senha de acesso.
          </p>
          <p className="text-xs text-gray-400 mt-1">{userEmail}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5 block">Nova Senha</label>
            <div className="relative">
              <KeyRound size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full pl-10 pr-12 py-3 bg-gray-50 border border-gray-300 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                placeholder="Mínimo 6 caracteres"
                required
                minLength={6}
                data-testid="input-new-password"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5 block">Confirmar Senha</label>
            <div className="relative">
              <KeyRound size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                placeholder="Repita a senha"
                required
                minLength={6}
                data-testid="input-confirm-password"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
              <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
              <span className="text-xs font-bold text-red-700">{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSaving}
            className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-black text-sm uppercase tracking-wider shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            data-testid="button-submit-new-password"
          >
            {isSaving ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
            Salvar Nova Senha
          </button>
        </form>

        <div className="mt-6 text-center">
          <img src="/logo.png" alt="TMSEG" className="h-8 mx-auto opacity-30" />
          <p className="text-[9px] text-gray-400 mt-2 uppercase tracking-wider">Grupo TM SEG — Sistema TMSEGo</p>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
