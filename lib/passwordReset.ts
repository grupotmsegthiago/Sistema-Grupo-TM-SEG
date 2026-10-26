import crypto from 'crypto';
import { gravarSenhaNoServidor } from './sessao/gravarSenha.js';
import { sendPasswordResetEmail } from './email/passwordResetEmails.js';
import { createSupabaseAdminClient } from './supabaseAdmin.js';
import { aplicarSenhaNoPortal, lerAcessoPortal } from './cevaPortal/cadastroSistema.js';
import { gerarSenhaTemporaria } from './cevaPortal/acesso.js';
import { mensagemNovaSenhaWhatsapp, normalizarTelefoneWhatsapp, usuarioSoPortal } from './cevaPortal/regrasAcesso.js';
import { portalDaFicha, type PortalServidor } from './cevaPortal/portalServidor.js';
import { whatsappProviderSendText } from '../server/whatsapp/providerRegistry.js';
import { isZapiConfigured } from '../server/zapiClient.js';
import { assertOfficialBotNumber } from '../server/zapiGuard.js';
import { logWhatsappOutbound } from '../server/whatsappTelemetry.js';

type Resposta = { status: number; body: Record<string, unknown> };
type Cliente = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

function urlDoSistema(): string {
  const base = process.env.SYSTEM_URL
    || `https://${process.env.REPLIT_DOMAINS?.split(',')[0] || 'sistema.grupotmseg.com.br'}`;
  return base.replace(/\/$/, '');
}

function clienteAdmin(): Cliente | null {
  return createSupabaseAdminClient();
}

async function portalDoCliente(sb: Cliente, clientId: string | number): Promise<PortalServidor | null> {
  let consulta = await sb
    .from('clients')
    .select('id, name, trading_name, portal_ativo, portal_slug')
    .eq('id', clientId)
    .maybeSingle();
  if (consulta.error && /portal_/i.test(String(consulta.error.message || ''))) {
    consulta = await sb.from('clients').select('id, name, trading_name').eq('id', clientId).maybeSingle();
  }
  if (consulta.error || !consulta.data) return null;
  return portalDaFicha(consulta.data);
}

async function exigirTrocaNoProximoAcesso(sb: Cliente, userId: string): Promise<void> {
  const { error } = await sb.from('system_users').update({ force_password_change: true }).eq('id', userId);
  if (error) throw new Error(error.message || 'Não foi possível exigir a troca de senha.');
}

export async function handlePasswordResetRequest(body: Record<string, unknown> | null | undefined): Promise<Resposta> {
  const dados = body || {};
  const userId = String(dados.userId || '').trim();
  const senderName = typeof dados.senderName === 'string' ? dados.senderName : undefined;
  const canal = dados.canal === 'whatsapp' ? 'whatsapp' : 'email';
  if (!userId) return { status: 400, body: { error: 'userId obrigatório' } };
  if (canal === 'whatsapp') {
    const telefone = normalizarTelefoneWhatsapp(dados.telefone);
    if (!telefone) {
      return { status: 400, body: { error: 'Informe o WhatsApp com DDD para enviar a nova senha.' } };
    }
    return redefinirPorWhatsapp(userId, telefone);
  }
  return redefinirPorEmail(userId, senderName);
}

async function redefinirPorEmail(userId: string, senderName?: string): Promise<Resposta> {
  const sb = clienteAdmin();
  if (!sb) return { status: 503, body: { error: 'Servidor de usuários indisponível.' } };

  const { data: userData, error: userErr } = await sb
    .from('system_users')
    .select('id, name, email, user_type, client_id')
    .eq('id', userId)
    .single();
  if (userErr || !userData?.email) return { status: 404, body: { error: 'Usuário não encontrado' } };

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { error: updateErr } = await sb.from('system_users').update({
    password_reset_token: token,
    password_reset_expires: expiresAt,
    force_password_change: true,
  }).eq('id', userId);
  if (updateErr) throw new Error(updateErr.message || 'Não foi possível gravar o link de redefinição.');

  let portalLink: string | undefined;
  if (userData.user_type === 'client' && userData.client_id) {
    const portal = await portalDoCliente(sb, userData.client_id);
    if (portal) portalLink = `${urlDoSistema()}${portal.caminho}`;
  }

  const resetLink = `${urlDoSistema()}/reset-password?token=${token}`;
  const envio = await sendPasswordResetEmail(userData.email, userData.name, resetLink, senderName, portalLink);
  if (!envio.ok) {
    return { status: 502, body: { error: envio.erro || 'Falha ao enviar e-mail' } };
  }
  return { status: 200, body: { success: true, message: 'E-mail de redefinição enviado!' } };
}

async function redefinirPorWhatsapp(userId: string, telefone: string): Promise<Resposta> {
  const sb = clienteAdmin();
  if (!sb) return { status: 503, body: { error: 'Servidor de usuários indisponível.' } };

  const { data: userData, error: userErr } = await sb
    .from('system_users')
    .select('id, name, email, user_type, client_id, permissions')
    .eq('id', userId)
    .single();
  if (userErr || !userData?.email) return { status: 404, body: { error: 'Usuário não encontrado' } };
  if (userData.user_type !== 'client') {
    return { status: 400, body: { error: 'A redefinição por WhatsApp vale para usuário de cliente.' } };
  }

  const portal = userData.client_id ? await portalDoCliente(sb, userData.client_id) : null;
  const soPortal = usuarioSoPortal(userData.permissions);
  let acessoId: string | number | null = null;
  if (portal) {
    const acesso = await lerAcessoPortal(sb, {
      tabela: portal.tabelas.usuarios,
      email: String(userData.email),
      clientId: userData.client_id,
    });
    if (!acesso.ok) return { status: 500, body: { error: acesso.error } };
    acessoId = acesso.id;
    if (soPortal && acessoId == null) {
      return {
        status: 409,
        body: { error: 'O acesso ao portal deste e-mail não foi encontrado. Salve o usuário com Acesso ao portal e tente de novo.' },
      };
    }
  }

  if (!(await isZapiConfigured())) {
    return { status: 503, body: { error: 'WhatsApp não configurado. A senha atual foi mantida.' } };
  }
  const guarda = await assertOfficialBotNumber();
  if (!guarda.ok) {
    logWhatsappOutbound({
      queueLabel: 'senha-cliente',
      endpoint: 'send-text',
      destinationType: 'individual',
      groupId: telefone,
      success: false,
      skipped: true,
      skipReason: 'número não oficial',
      errorMessage: guarda.error || 'WhatsApp indisponível',
    });
    return {
      status: 503,
      body: { error: guarda.error || 'WhatsApp desconectado. A senha atual foi mantida. Reconecte o bot e tente de novo.' },
    };
  }

  const senha = gerarSenhaTemporaria();
  const link = portal ? `${urlDoSistema()}${portal.caminho}` : urlDoSistema();
  const mensagem = mensagemNovaSenhaWhatsapp({
    nome: String(userData.name || 'usuário'),
    email: String(userData.email),
    senha,
    link,
  });

  let envio: { ok: boolean; httpStatus?: number; error?: string; queueWaitMs?: number; queueDepth?: number };
  try {
    envio = await whatsappProviderSendText(telefone, mensagem, 'senha-cliente');
  } catch (erro: unknown) {
    const texto = erro instanceof Error ? erro.message : 'Falha ao enviar WhatsApp';
    console.error('[PasswordReset] WhatsApp', texto);
    return { status: 502, body: { error: 'O WhatsApp não enviou a mensagem. A senha atual foi mantida.' } };
  }
  logWhatsappOutbound({
    queueLabel: 'senha-cliente',
    endpoint: 'send-text',
    destinationType: 'individual',
    groupId: telefone,
    queueWaitMs: envio.queueWaitMs,
    queueDepth: envio.queueDepth,
    httpStatus: envio.httpStatus,
    success: envio.ok,
    errorMessage: envio.ok ? null : (envio.error || 'Falha no envio'),
  });
  if (!envio.ok) {
    return { status: 502, body: { error: 'O WhatsApp não enviou a mensagem. A senha atual foi mantida. Reconecte o bot e tente de novo.' } };
  }

  if (portal && acessoId != null) {
    const aplicado = await aplicarSenhaNoPortal(sb, {
      tabela: portal.tabelas.usuarios,
      email: String(userData.email),
      clientId: userData.client_id,
      senha,
      trocarSenha: true,
    });
    if (!aplicado.ok || !aplicado.atualizado) {
      return {
        status: 500,
        body: { error: aplicado.ok
          ? 'A mensagem foi enviada, mas o acesso do portal não foi encontrado para gravar a senha.'
          : `A mensagem foi enviada, mas a senha do portal não foi gravada. ${aplicado.error}` },
      };
    }
  }

  try {
    await gravarSenhaNoServidor(sb, String(userData.id), senha, { force_password_change: true });
    await exigirTrocaNoProximoAcesso(sb, String(userData.id));
  } catch (erro: unknown) {
    const texto = erro instanceof Error ? erro.message : 'Falha ao gravar a senha';
    console.error('[PasswordReset] gravação depois do WhatsApp', texto);
    return { status: 500, body: { error: 'A mensagem foi enviada, mas a senha não ficou gravada no cadastro. Envie de novo.' } };
  }

  return {
    status: 200,
    body: {
      success: true,
      message: portal && acessoId != null
        ? 'Nova senha enviada no WhatsApp. No próximo acesso ao portal a troca é obrigatória.'
        : 'Nova senha enviada no WhatsApp. No próximo acesso a troca é obrigatória.',
    },
  };
}

export async function handlePasswordResetValidate(body: { token?: string } | null | undefined): Promise<Resposta> {
  const token = String(body?.token || '');
  if (!token) return { status: 400, body: { error: 'Token obrigatório' } };

  const sb = clienteAdmin();
  if (!sb) return { status: 503, body: { error: 'Servidor de usuários indisponível.' } };
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

export async function handlePasswordResetConfirm(body: { token?: string; newPassword?: string } | null | undefined): Promise<Resposta> {
  const token = String(body?.token || '');
  const newPassword = String(body?.newPassword || '');
  if (!token || !newPassword) {
    return { status: 400, body: { error: 'Token e nova senha são obrigatórios' } };
  }
  if (newPassword.length < 8) {
    return { status: 400, body: { error: 'A senha deve ter no mínimo 8 caracteres' } };
  }

  const sb = clienteAdmin();
  if (!sb) return { status: 503, body: { error: 'Servidor de usuários indisponível.' } };
  const { data, error } = await sb
    .from('system_users')
    .select('id, name, email, user_type, client_id, permissions, password_reset_expires')
    .eq('password_reset_token', token)
    .single();

  if (error || !data) return { status: 404, body: { error: 'Token inválido ou expirado' } };
  if (new Date(data.password_reset_expires) < new Date()) {
    return { status: 410, body: { error: 'Token expirado' } };
  }

  if (data.user_type === 'client' && data.client_id) {
    const portal = await portalDoCliente(sb, data.client_id);
    if (portal) {
      const aplicado = await aplicarSenhaNoPortal(sb, {
        tabela: portal.tabelas.usuarios,
        email: String(data.email || ''),
        clientId: data.client_id,
        senha: newPassword,
        trocarSenha: false,
      });
      if (!aplicado.ok) return { status: 500, body: { error: aplicado.error } };
      if (usuarioSoPortal(data.permissions) && !aplicado.atualizado) {
        return {
          status: 409,
          body: { error: 'O acesso ao portal deste e-mail não foi encontrado. A senha não foi alterada.' },
        };
      }
    }
  }

  await gravarSenhaNoServidor(sb, String(data.id), newPassword, {
    password_reset_token: null,
    password_reset_expires: null,
    force_password_change: false,
  });

  return { status: 200, body: { success: true, message: 'Senha alterada com sucesso!' } };
}
