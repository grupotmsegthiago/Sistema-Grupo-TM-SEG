
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, User, Lock, Save, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

const ProfileSettingsModal: React.FC<Props> = ({ onClose, onSuccess }) => {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem('userData');
    if (storedUser) {
      const user = JSON.parse(storedUser);
      setCurrentUser(user);
      setNewEmail(user.email);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!currentPassword) {
      setError('A senha atual é obrigatória para fazer qualquer alteração.');
      return;
    }

    const emailChanged = newEmail.trim() !== currentUser.email;
    const passwordChanged = newPassword.trim() !== '';

    if (!emailChanged && !passwordChanged) {
      setError('Nenhuma alteração foi feita.');
      return;
    }

    if (passwordChanged) {
      if (newPassword.length < 6) {
        setError('A nova senha deve ter no mínimo 6 caracteres.');
        return;
      }
      if (newPassword !== confirmNewPassword) {
        setError('As novas senhas não coincidem.');
        return;
      }
    }

    setIsLoading(true);

    try {
      // 1. Verificar a senha atual
      const { data, error: checkError } = await supabase
        .from('system_users')
        .select('id')
        .eq('email', currentUser.email)
        .eq('password', currentPassword)
        .single();

      if (checkError || !data) {
        throw new Error('A senha atual está incorreta.');
      }

      // 2. Preparar payload de atualização
      const updatePayload: any = {};
      if (emailChanged) {
        updatePayload.email = newEmail.trim();
      }
      if (passwordChanged) {
        updatePayload.password = newPassword.trim();
      }

      // 3. Executar atualização
      const { error: updateError } = await supabase
        .from('system_users')
        .update(updatePayload)
        .eq('id', currentUser.id);

      if (updateError) {
        throw new Error(updateError.message);
      }
      
      onSuccess();

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border">
        <header className="bg-gray-50 p-4 flex justify-between items-center border-b">
          <h2 className="text-lg font-bold text-gray-800">Minha Conta</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200"><X size={20} /></button>
        </header>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 p-3 rounded-lg border border-red-200 text-red-700">
              <AlertCircle size={18} />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-gray-500">E-mail de Acesso</label>
            <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} className="w-full mt-1 p-2 border rounded-lg" />
          </div>

          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-sm font-bold text-gray-500 uppercase">Alterar Senha</h3>
            <div className="relative">
              <label className="text-xs font-bold text-gray-500">Senha Atual (Obrigatória)</label>
              <input type={showCurrentPwd ? 'text' : 'password'} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="w-full mt-1 p-2 border rounded-lg pr-10" />
              <button type="button" onClick={() => setShowCurrentPwd(!showCurrentPwd)} className="absolute right-2 top-7 p-1 text-gray-400"><Eye size={16}/></button>
            </div>
            <div className="relative">
              <label className="text-xs font-bold text-gray-500">Nova Senha</label>
              <input type={showNewPwd ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full mt-1 p-2 border rounded-lg pr-10" />
              <button type="button" onClick={() => setShowNewPwd(!showNewPwd)} className="absolute right-2 top-7 p-1 text-gray-400"><Eye size={16}/></button>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500">Confirmar Nova Senha</label>
              <input type="password" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} className="w-full mt-1 p-2 border rounded-lg" />
            </div>
          </div>
        </form>

        <footer className="p-4 bg-gray-50 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2 border rounded-lg font-bold text-sm">Cancelar</button>
          <button onClick={handleSubmit} disabled={isLoading} className="px-5 py-2 bg-red-700 text-white rounded-lg font-bold text-sm flex items-center gap-2">
            {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Save size={16} />}
            {isLoading ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default ProfileSettingsModal;
