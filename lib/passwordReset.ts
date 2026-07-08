import crypto from 'crypto';
import { getDhlIntakeSupabase } from './dhl-intake/dhlIntakeSupabase.js';
import { sendPasswordResetEmail } from './email/passwordResetEmails.js';

function systemUrl(): string {
  return process.env.SYSTEM_URL
    || `https://${process.env.REPLIT_DOMAINS?.split(',')[0] || 'sistema.grupotmseg.com.br'}`;
}

export async function handlePasswordResetRequest(body: { userId?: string; senderName?: string }) {
  const { userId, senderName } = body || {};
  if (!userId) return { status: 400, body: { error: 'userId obrigatório' } };

  const sb = await getDhlIntakeSupabase();
  const { data: userData, error: userErr } = await sb
    .from('system_users')
    .select('id, name, email')
    .eq('id', userId)
    .single();

  if (userErr || !userData) return { status: 404, body: { error: 'Usuário não encontrado' } };

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { error: updateErr } = await sb.from('system_users').update({
    password_reset_token: token,
    password_reset_expires: expiresAt,
    force_password_change: true,
  }).eq('id', userId);

  if (updateErr) throw updateErr;

  const resetLink = `${systemUrl()}/reset-password?token=${token}`;
  const success = await sendPasswordResetEmail(userData.email, userData.name, resetLink, senderName);

  return {
    status: 200,
    body: {
      success,
      message: success ? 'E-mail de redefinição enviado!' : 'Falha ao enviar e-mail',
    },
  };
}

export async function handlePasswordResetValidate(body: { token?: string }) {
  const { token } = body || {};
  if (!token) return { status: 400, body: { error: 'Token obrigatório' } };

  const sb = await getDhlIntakeSupabase();
  const { data, error } = await sb
    .from('system_users')
    .select('id, name, email, password_reset_expires')
    .eq('password_reset_token', token)
    .single();

  if (error || !data) return { status: 404, body: { error: 'Token inválido ou expirado' } };
  if (new Date(data.password_reset_expires) < new Date()) {
    return { status: 410, body: { error: 'Token expirado' } };
  }

  return { status: 200, body: { valid: true, userName: data.name, userEmail: data.email } };
}

export async function handlePasswordResetConfirm(body: { token?: string; newPassword?: string }) {
  const { token, newPassword } = body || {};
  if (!token || !newPassword) {
    return { status: 400, body: { error: 'Token e nova senha são obrigatórios' } };
  }
  if (newPassword.length < 6) {
    return { status: 400, body: { error: 'A senha deve ter no mínimo 6 caracteres' } };
  }

  const sb = await getDhlIntakeSupabase();
  const { data, error } = await sb
    .from('system_users')
    .select('id, name, password_reset_expires')
    .eq('password_reset_token', token)
    .single();

  if (error || !data) return { status: 404, body: { error: 'Token inválido ou expirado' } };
  if (new Date(data.password_reset_expires) < new Date()) {
    return { status: 410, body: { error: 'Token expirado' } };
  }

  const { error: updateErr } = await sb.from('system_users').update({
    password: newPassword,
    password_reset_token: null,
    password_reset_expires: null,
    force_password_change: false,
  }).eq('id', data.id);

  if (updateErr) throw updateErr;

  return { status: 200, body: { success: true, message: 'Senha alterada com sucesso!' } };
}
