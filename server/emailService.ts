import nodemailer from 'nodemailer';

const EMAIL_USER = process.env.EMAIL_USER || 'adm@grupotmseg.com.br';
const EMAIL_PASS = process.env.EMAIL_PASS || process.env.SMTP_PASSWORD || '';
const SMTP_FROM = `"Grupo TM SEG" <adm@grupotmseg.com.br>`;
const BCC_RECIPIENTS = 'thiago@grupotmseg.com.br, operacional@grupotmseg.com.br';

const transporter = nodemailer.createTransport({
  host: 'smtp.office365.com',
  port: 587,
  secure: false,
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
  tls: {
    ciphers: 'SSLv3',
    rejectUnauthorized: false,
  },
  requireTLS: true,
});

console.log(`[Email] SMTP configurado: ${EMAIL_USER} | from: adm@grupotmseg.com.br | senha: ${EMAIL_PASS ? '***configurada***' : '⚠ VAZIA'}`);

function baseTemplate(content: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { margin:0; padding:0; background:#f4f4f4; font-family: 'Segoe UI', Arial, sans-serif; }
  .container { max-width:600px; margin:0 auto; background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,0.08); }
  .header { background:#1a1a1a; padding:28px 32px; text-align:center; }
  .header h1 { color:#ffffff; font-size:22px; margin:0 0 4px; letter-spacing:1px; }
  .header .accent { color:#c0392b; font-weight:700; }
  .header .subtitle { color:#999; font-size:12px; margin:0; letter-spacing:2px; text-transform:uppercase; }
  .body-content { padding:32px; color:#333; line-height:1.7; font-size:14px; }
  .body-content h2 { color:#1a1a1a; font-size:18px; border-bottom:3px solid #c0392b; padding-bottom:8px; margin-top:0; }
  .info-table { width:100%; border-collapse:collapse; margin:16px 0; }
  .info-table td { padding:10px 14px; border-bottom:1px solid #eee; vertical-align:top; }
  .info-table td:first-child { font-weight:600; color:#1a1a1a; width:40%; white-space:nowrap; }
  .info-table td:last-child { color:#555; }
  .badge { display:inline-block; background:#c0392b; color:#fff; padding:4px 12px; border-radius:4px; font-size:12px; font-weight:600; letter-spacing:0.5px; }
  .footer { background:#1a1a1a; padding:24px 32px; text-align:center; border-top:3px solid #c0392b; }
  .footer p { color:#999; font-size:12px; margin:4px 0; }
  .footer .ceo { color:#ffffff; font-weight:600; font-size:13px; }
  .footer .company { color:#c0392b; font-weight:600; }
  .divider { height:3px; background: linear-gradient(90deg, #c0392b, #1a1a1a); margin:0; }
  .highlight-box { background:#fdf2f2; border-left:4px solid #c0392b; padding:12px 16px; margin:16px 0; border-radius:0 4px 4px 0; }
  .highlight-box p { margin:4px 0; font-size:13px; color:#555; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>GRUPO <span class="accent">TM SEG</span></h1>
    <p class="subtitle">Segurança &amp; Escolta Armada</p>
  </div>
  <div class="divider"></div>
  <div class="body-content">
    ${content}
  </div>
  <div class="footer">
    <p class="ceo">Thiago Moreira — CEO</p>
    <p class="company">Grupo TM SEG</p>
    <p>Segurança Patrimonial &amp; Escolta Armada</p>
    <p style="margin-top:8px; font-size:11px; color:#666;">Este é um e-mail automático. Em caso de dúvidas, entre em contato pelo e-mail adm@grupotmseg.com.br</p>
  </div>
</div>
</body>
</html>`;
}

function formatDateTime(isoStr: string | null | undefined): string {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return isoStr; }
}

export interface MissionEmailData {
  id: string;
  client: string;
  provider: string;
  origin: string;
  destination: string;
  start_time: string;
  mission_type?: string;
  driver_name?: string;
  driver_phone?: string;
  client_vehicle?: number | null;
  revenue_value?: number;
  cost_value?: number;
}

export async function sendMissionEmailToClient(
  mission: MissionEmailData,
  clientEmail: string,
  vehiclePlate: string
): Promise<boolean> {
  const html = baseTemplate(`
    <h2>📋 Nova Ordem de Serviço</h2>
    <p>Prezado(a) Cliente,</p>
    <p>Informamos que uma nova missão de escolta foi registrada para a sua empresa. Seguem os detalhes:</p>
    <table class="info-table">
      <tr><td>Nº da Missão (OS)</td><td><span class="badge">${mission.id}</span></td></tr>
      <tr><td>Rota</td><td>${mission.origin} → ${mission.destination}</td></tr>
      <tr><td>Viatura (Placa)</td><td>${vehiclePlate || '—'}</td></tr>
      <tr><td>Tipo de Escolta</td><td>${mission.mission_type || 'Caracterizada'}</td></tr>
      <tr><td>Data/Hora Inicial</td><td>${formatDateTime(mission.start_time)}</td></tr>
    </table>
    <div class="highlight-box">
      <p><strong>Observação:</strong> Acompanhe o status da missão em tempo real pelo painel do sistema.</p>
    </div>
    <p>Atenciosamente,<br><strong>Equipe Grupo TM SEG</strong></p>
  `);

  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to: clientEmail,
      bcc: BCC_RECIPIENTS,
      subject: `OS Nº ${mission.id} — Nova Missão de Escolta Registrada`,
      html,
    });
    console.log(`[Email] Missão ${mission.id} → Cliente: ${clientEmail}`);
    return true;
  } catch (err: any) {
    console.error(`[Email] Erro ao enviar para cliente ${clientEmail}:`, err.message);
    return false;
  }
}

export async function sendMissionEmailToProvider(
  mission: MissionEmailData,
  providerEmail: string,
  vehiclePlate: string
): Promise<boolean> {
  const html = baseTemplate(`
    <h2>📋 Ordem de Serviço — Fornecedor</h2>
    <p>Prezado(a) Fornecedor,</p>
    <p>Uma nova ordem de serviço foi atribuída à sua empresa. Seguem os detalhes operacionais:</p>
    <table class="info-table">
      <tr><td>Nº da Missão (OS)</td><td><span class="badge">${mission.id}</span></td></tr>
      <tr><td>Rota</td><td>${mission.origin} → ${mission.destination}</td></tr>
      <tr><td>Viatura (Placa)</td><td>${vehiclePlate || '—'}</td></tr>
      <tr><td>Tipo de Escolta</td><td>${mission.mission_type || 'Caracterizada'}</td></tr>
      <tr><td>Data/Hora Inicial</td><td>${formatDateTime(mission.start_time)}</td></tr>
      ${mission.driver_name ? `<tr><td>Motorista</td><td>${mission.driver_name}</td></tr>` : ''}
      ${mission.driver_phone ? `<tr><td>Tel. Motorista</td><td>${mission.driver_phone}</td></tr>` : ''}
    </table>

    <div style="background:#1a1a1a; color:#ffffff; padding:24px 28px; border-radius:8px; margin:24px 0; border-left:4px solid #c0392b;">
      <h3 style="color:#c0392b; font-size:16px; margin:0 0 16px; text-align:center; letter-spacing:1px;">🛡️ BRIEFING RÁPIDO – ESCOLTA ARMADA GRUPO TM SEG 🛡️</h3>
      <p style="color:#ccc; font-size:13px; margin:0 0 16px; text-align:center; font-style:italic;">Atenção, Equipe! Sua segurança e a excelência da operação dependem da atenção a estes pontos essenciais.</p>

      <h4 style="color:#c0392b; font-size:14px; margin:20px 0 8px; border-bottom:1px solid #333; padding-bottom:6px;">1. 🚗 VIATURA E PREPARAÇÃO</h4>
      <p style="color:#ddd; font-size:12px; margin:6px 0;"><strong style="color:#fff;">Espelhamento Tático:</strong> Viatura espelhada ANTES da chegada na origem. Posição estratégica e discreta.</p>
      <p style="color:#ddd; font-size:12px; margin:10px 0 4px;"><strong style="color:#fff;">Checklist ESSENCIAL:</strong></p>
      <ul style="color:#ccc; font-size:12px; margin:4px 0 8px 16px; padding:0; list-style:disc;">
        <li style="margin:4px 0;">Comunicação: Teclado e Pânico 100% funcionais.</li>
        <li style="margin:4px 0;">Veículo: Pneus, freios, iluminação e combustível sempre OK.</li>
        <li style="margin:4px 0;">Equipamentos: Extintor, triângulo, macaco e chave de roda a bordo e acessíveis.</li>
      </ul>
      <p style="color:#f87171; font-size:12px; margin:8px 0; font-weight:700;">⛔ PROIBIDO: Estacionar em áreas demarcadas do cliente (exceto pontos de carga/descarga autorizados).</p>

      <h4 style="color:#c0392b; font-size:14px; margin:20px 0 8px; border-bottom:1px solid #333; padding-bottom:6px;">2. 🧑‍✈️ AGENTES E CONDUTA</h4>
      <ul style="color:#ccc; font-size:12px; margin:4px 0 8px 16px; padding:0; list-style:disc;">
        <li style="margin:4px 0;"><strong style="color:#fff;">Profissionalismo Total:</strong> Postura padrão, uniforme impecável, vigilância constante.</li>
        <li style="margin:4px 0;"><strong style="color:#fff;">Armamento e Equipamento:</strong> SEMPRE armado e com todos os equipamentos táticos em perfeitas condições de uso.</li>
        <li style="margin:4px 0;"><strong style="color:#fff;">Pontualidade CRÍTICA:</strong> Chegar no horário.</li>
        <li style="margin:4px 0;"><strong style="color:#fff;">Contato Prévio:</strong> Fazer contato padrão com o motorista do veículo escoltado na chegada.</li>
        <li style="margin:4px 0;"><strong style="color:#fff;">Conhecimento da Rota:</strong> Estudar rota principal e alternativas, incluindo pontos críticos e de apoio.</li>
      </ul>

      <h4 style="color:#c0392b; font-size:14px; margin:20px 0 8px; border-bottom:1px solid #333; padding-bottom:6px;">3. 📞 COMUNICAÇÃO E EMERGÊNCIA</h4>
      <ul style="color:#ccc; font-size:12px; margin:4px 0 8px 16px; padding:0; list-style:disc;">
        <li style="margin:4px 0;"><strong style="color:#fff;">Comunicação Ativa:</strong> Manter a base informada (partida, paradas, chegada). Comunicação clara e concisa.</li>
        <li style="margin:4px 0;"><strong style="color:#fff;">Emergências:</strong> Em caso de anomalia, incidente ou abordagem, comunicar IMEDIATAMENTE a base com detalhes.</li>
        <li style="margin:4px 0;"><strong style="color:#fff;">Protocolos:</strong> Estar ciente e treinado nos protocolos para abordagens hostis, acidentes e falhas mecânicas. A segurança da vida é primordial.</li>
      </ul>

      <h4 style="color:#c0392b; font-size:14px; margin:20px 0 8px; border-bottom:1px solid #333; padding-bottom:6px;">4. 📝 ADMINISTRAÇÃO</h4>
      <ul style="color:#ccc; font-size:12px; margin:4px 0 8px 16px; padding:0; list-style:disc;">
        <li style="margin:4px 0;"><strong style="color:#fff;">Documentação:</strong> Portar e manter válidos CNH, CRLV e demais documentos obrigatórios.</li>
        <li style="margin:4px 0;"><strong style="color:#fff;">Relatório Pós-Missão:</strong> Preencher relatório detalhado de todas as missões, mesmo sem ocorrências.</li>
      </ul>

      <p style="color:#c0392b; font-size:13px; margin:20px 0 0; text-align:center; font-weight:700; letter-spacing:0.5px;">Sua atenção a cada detalhe garante a segurança e o sucesso da nossa PARCERIA</p>
    </div>

    <p>Atenciosamente,<br><strong>Equipe Grupo TM SEG</strong></p>
  `);

  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to: providerEmail,
      bcc: BCC_RECIPIENTS,
      subject: `OS Nº ${mission.id} — Ordem de Serviço Atribuída`,
      html,
    });
    console.log(`[Email] Missão ${mission.id} → Fornecedor: ${providerEmail}`);
    return true;
  } catch (err: any) {
    console.error(`[Email] Erro ao enviar para fornecedor ${providerEmail}:`, err.message);
    return false;
  }
}

export interface WelcomeEmailData {
  name: string;
  email: string;
  password: string;
  userType: string;
  profileName?: string;
}

export async function sendWelcomeEmail(user: WelcomeEmailData, systemUrl: string, verificationCode?: string): Promise<boolean> {
  const typeLabel = user.userType === 'client' ? 'Cliente' : user.userType === 'provider' ? 'Fornecedor' : 'Interno';

  const verificationBlock = verificationCode ? `
    <div style="background:#0f172a; border:2px solid #c0392b; border-radius:12px; padding:24px; text-align:center; margin:20px 0;">
      <p style="color:#94a3b8; font-size:12px; margin:0 0 8px; text-transform:uppercase; letter-spacing:2px;">Código de Confirmação</p>
      <span style="font-size:32px; font-weight:900; color:#c0392b; letter-spacing:10px; font-family:'Courier New',monospace;">${verificationCode}</span>
      <p style="color:#475569; font-size:11px; margin:12px 0 0;">Use este código no primeiro acesso para ativar sua conta.</p>
    </div>
  ` : '';

  const html = baseTemplate(`
    <h2>🎉 Bem-vindo(a) ao Grupo TM SEG</h2>
    <p>Olá, <strong>${user.name}</strong>!</p>
    <p>Sua conta foi criada com sucesso no sistema de gestão do <strong>Grupo TM SEG</strong>. Abaixo estão suas credenciais de acesso:</p>
    <table class="info-table">
      <tr><td>Tipo de Acesso</td><td><span class="badge">${typeLabel}</span></td></tr>
      ${user.profileName ? `<tr><td>Perfil</td><td>${user.profileName}</td></tr>` : ''}
      <tr><td>Link do Sistema</td><td><a href="${systemUrl}" style="color:#c0392b; font-weight:600;">${systemUrl}</a></td></tr>
      <tr><td>Login (E-mail)</td><td>${user.email}</td></tr>
      <tr><td>Senha Temporária</td><td><code style="background:#f0f0f0; padding:2px 8px; border-radius:3px; font-size:14px;">${user.password}</code></td></tr>
    </table>
    ${verificationBlock}
    <div class="highlight-box">
      <p><strong>⚠️ Importante:</strong> No seu primeiro acesso, você será solicitado a <strong>alterar sua senha obrigatoriamente</strong>. Nunca compartilhe suas credenciais com terceiros.</p>
    </div>
    <p>Atenciosamente,<br><strong>Equipe Grupo TM SEG</strong></p>
  `);

  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to: user.email,
      bcc: BCC_RECIPIENTS,
      subject: `Bem-vindo(a) ao Grupo TM SEG — Suas Credenciais de Acesso`,
      html,
    });
    console.log(`[Email] Boas-vindas → ${user.email}`);
    return true;
  } catch (err: any) {
    console.error(`[Email] Erro ao enviar boas-vindas para ${user.email}:`, err.message);
    return false;
  }
}

export async function sendVerificationCodeEmail(email: string, userName: string, code: string): Promise<boolean> {
  const html = baseTemplate(`
    <h2>🔐 Código de Verificação</h2>
    <p>Olá, <strong>${userName}</strong>!</p>
    <p>Use o código abaixo para confirmar a criação da sua conta no sistema <strong>Grupo TM SEG</strong>:</p>
    <div style="background:#0f172a; border:2px solid #c0392b; border-radius:12px; padding:24px; text-align:center; margin:20px 0;">
      <span style="font-size:36px; font-weight:900; color:#c0392b; letter-spacing:12px; font-family:'Courier New',monospace;">${code}</span>
    </div>
    <p style="font-size:12px; color:#666;">Este código expira em <strong>10 minutos</strong>. Se você não solicitou este código, ignore este e-mail.</p>
    <p>Atenciosamente,<br><strong>Equipe Grupo TM SEG</strong></p>
  `);

  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to: email,
      bcc: 'thiago@grupotmseg.com.br',
      subject: `🔐 Código de Verificação — Grupo TM SEG`,
      html,
    });
    console.log(`[Email] Código de verificação → ${email}`);
    return true;
  } catch (err: any) {
    console.error(`[Email] Erro ao enviar código para ${email}:`, err.message);
    return false;
  }
}

export async function sendTestEmail(to: string): Promise<boolean> {
  const html = baseTemplate(`
    <h2>✅ E-mail de Teste</h2>
    <p>Este é um e-mail de teste do sistema de automação do <strong>Grupo TM SEG</strong>.</p>
    <p>Se você recebeu este e-mail, a configuração SMTP está funcionando corretamente.</p>
    <table class="info-table">
      <tr><td>Remetente</td><td>${EMAIL_USER}</td></tr>
      <tr><td>Destinatário</td><td>${to}</td></tr>
      <tr><td>Data/Hora</td><td>${formatDateTime(new Date().toISOString())}</td></tr>
    </table>
    <p>Atenciosamente,<br><strong>Equipe Grupo TM SEG</strong></p>
  `);

  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to,
      bcc: BCC_RECIPIENTS,
      subject: `Teste — Sistema de E-mails Grupo TM SEG`,
      html,
    });
    console.log(`[Email] Teste enviado → ${to}`);
    return true;
  } catch (err: any) {
    console.error(`[Email] Erro no teste:`, err.message);
    return false;
  }
}

export { transporter };
