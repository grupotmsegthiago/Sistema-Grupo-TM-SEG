import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { Resend } from "resend";
import webpush from "web-push";
import { calculateMissionFinancials } from "../lib/financialUtils";
import fs from "fs";
import path from "path";
import { sendMissionEmailToClient, sendMissionEmailToProvider, sendMissionResendToClient, sendMirroringEvidenceEmail, sendMissionChangeNotificationToClient, sendMissionChangeNotificationToProvider, sendWelcomeEmail, sendTestEmail, sendVerificationCodeEmail, sendPasswordResetEmail } from "./emailService";
import { findOrCreateCustomer, createPayment, getPayment, getPaymentPixQrCode, getPaymentBankSlip, listPayments, deletePayment, mapAsaasStatus, isAsaasConfigured, getAsaasCompanies } from "./asaasService";

const resend = new Resend(process.env.RESEND_API_KEY);

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails('mailto:contato@grupotmseg.com.br', VAPID_PUBLIC, VAPID_PRIVATE);
}

const pushSubscriptions = new Map<string, any>();
const verificationCodes = new Map<string, { code: string; expiresAt: number; email: string }>();

const ai = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  (async () => {
    try {
      const dbPass = process.env.SUPABASE_DB_PASSWORD;
      if (dbPass) {
        const migrationPool = new pg.Pool({
          connectionString: `postgresql://postgres.ajhmmjuewdsukecaimik:${dbPass}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`,
          ssl: { rejectUnauthorized: false },
          max: 1
        });
        await migrationPool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS operational_email TEXT`);
        await migrationPool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS medicao_email TEXT`);
        await migrationPool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS issuer_company TEXT`);
        await migrationPool.query(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS mirroring_evidence_url TEXT`);
        await migrationPool.query(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS email_pending_client BOOLEAN DEFAULT FALSE`);
        await migrationPool.query(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS email_pending_provider BOOLEAN DEFAULT FALSE`);
        await migrationPool.query(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS snapshot_data JSONB`);
        await migrationPool.query(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS snapshot_approved_by TEXT`);
        await migrationPool.query(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS snapshot_approved_at TIMESTAMPTZ`);
        await migrationPool.query(`ALTER TABLE system_users ADD COLUMN IF NOT EXISTS password_reset_token TEXT`);
        await migrationPool.query(`ALTER TABLE system_users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ`);
        console.log('[Migration] Colunas verificadas/criadas com sucesso');
        await migrationPool.end();
      }
    } catch (migErr: any) {
      console.warn('[Migration] Aviso:', migErr.message);
    }
  })();

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: Date.now(), uptime: process.uptime() });
  });

  app.get('/sw.js', (_req: Request, res: Response) => {
    const swPath = path.resolve(process.cwd(), 'client', 'public', 'sw.js');
    if (fs.existsSync(swPath)) {
      res.setHeader('Content-Type', 'application/javascript');
      res.setHeader('Service-Worker-Allowed', '/');
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(swPath);
    } else {
      res.status(404).send('Not found');
    }
  });

  app.get('/manifest.json', (_req: Request, res: Response) => {
    const manifestPath = path.resolve(process.cwd(), 'client', 'public', 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      res.setHeader('Content-Type', 'application/manifest+json');
      res.sendFile(manifestPath);
    } else {
      res.status(404).send('Not found');
    }
  });

  app.get('/api/push/vapid-key', (_req: Request, res: Response) => {
    res.json({ publicKey: VAPID_PUBLIC });
  });

  app.post('/api/push/subscribe', (req: Request, res: Response) => {
    try {
      const { subscription, userId } = req.body;
      if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ error: 'Subscription inválida' });
      }
      const key = userId || subscription.endpoint;
      pushSubscriptions.set(key, subscription);
      console.log(`[Push] Subscription registrada: ${key.substring(0, 30)}... (total: ${pushSubscriptions.size})`);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/push/unsubscribe', (req: Request, res: Response) => {
    try {
      const { userId, endpoint } = req.body;
      const key = userId || endpoint;
      pushSubscriptions.delete(key);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/push/send', async (req: Request, res: Response) => {
    try {
      const { title, body, tag } = req.body;
      if (!title) return res.status(400).json({ error: 'Título obrigatório' });

      const payload = JSON.stringify({ title, body: body || '', tag: tag || 'tmseg', icon: '/favicon.png' });
      const results: any[] = [];
      const failed: string[] = [];

      for (const [key, sub] of pushSubscriptions.entries()) {
        try {
          await webpush.sendNotification(sub, payload);
          results.push({ key: key.substring(0, 20), status: 'ok' });
        } catch (err: any) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            pushSubscriptions.delete(key);
            failed.push(key.substring(0, 20));
          } else {
            results.push({ key: key.substring(0, 20), status: 'error', msg: err.message });
          }
        }
      }

      res.json({ sent: results.length, failed: failed.length, total: pushSubscriptions.size });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/push/test', async (req: Request, res: Response) => {
    try {
      const { subscription } = req.body;
      if (!subscription) return res.status(400).json({ error: 'Subscription obrigatória' });

      const payload = JSON.stringify({
        title: 'OS - Criada Nº TESTE-001 - Cliente: EXEMPLO LTDA',
        body: 'Origem: São Paulo - SP → Destino: Campinas - SP\nFornecedor: ATIVA SEGURANÇA',
        tag: `test-${Date.now()}`,
        icon: '/favicon.png'
      });

      await webpush.sendNotification(subscription, payload);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message, statusCode: e.statusCode });
    }
  });

  const supabase = createClient(
    'https://ajhmmjuewdsukecaimik.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqaG1tanVld2RzdWtlY2FpbWlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNzUxMjEsImV4cCI6MjA3OTc1MTEyMX0.5bXRWTyb1HxLimt3lqJTBfjzDoumux7TXlW4lycXrPk'
  );

  // Supabase Realtime listener for push notifications
  const supabaseForPush = supabase;

  supabaseForPush
    .channel('server-push-missions')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'missions'
    }, async (payload: any) => {
      const mission = payload.new;
      if (!mission) return;

      const osId = mission.id || 'N/A';
      const client = mission.client || 'N/A';
      const origin = mission.origin || 'N/A';
      const destination = mission.destination || 'N/A';
      const provider = mission.provider || 'N/A';
      const isAccident = (mission.current_location || '').includes('ACIDENTE');

      const title = isAccident
        ? `🚨 ACIDENTE - OS Nº ${osId} - ${client}`
        : `OS - Criada Nº ${osId} - Cliente: ${client}`;
      const body = `Origem: ${origin} → Destino: ${destination}\nFornecedor: ${provider}`;

      if (pushSubscriptions.size > 0) {
        const pushPayload = JSON.stringify({ title, body, tag: `mission-${osId}`, icon: '/favicon.png' });
        for (const [key, sub] of pushSubscriptions.entries()) {
          try {
            await webpush.sendNotification(sub, pushPayload);
          } catch (err: any) {
            if (err.statusCode === 410 || err.statusCode === 404) {
              pushSubscriptions.delete(key);
            }
          }
        }
        console.log(`[Push] Notificação enviada para ${pushSubscriptions.size} dispositivos: OS ${osId}`);
      }

    })
    .subscribe();

  // ── Email API Endpoints ──
  app.post("/api/email/test", async (req: Request, res: Response) => {
    try {
      const { to } = req.body;
      if (!to) return res.status(400).json({ error: 'Campo "to" obrigatório' });
      const success = await sendTestEmail(to);
      res.json({ success, message: success ? 'E-mail de teste enviado!' : 'Falha ao enviar e-mail' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/email/test-mission-emails", async (req: Request, res: Response) => {
    try {
      const { to } = req.body;
      if (!to) return res.status(400).json({ error: 'Campo "to" obrigatório' });

      const fakeMission = {
        id: 'GTM-2026-0001',
        client: 'CEVA Logística',
        provider: 'MACOR Segurança',
        origin: 'São Paulo, SP — CD Guarulhos',
        destination: 'Campinas, SP — CD Hortolândia',
        start_time: new Date().toISOString(),
        mission_type: 'Escolta Caracterizada',
        driver_name: 'José Carlos da Silva',
        driver_phone: '(11) 99999-8888',
        client_vehicle: 3,
        revenue_value: 1850.00,
        cost_value: 1200.00,
      };

      const clientResult = await sendMissionEmailToClient(fakeMission, to, 'ABC-1D23');
      const clientOk = typeof clientResult === 'object' ? clientResult.success : clientResult;
      const providerOk = await sendMissionEmailToProvider(fakeMission, to, 'ABC-1D23');

      res.json({
        clientEmail: { success: clientOk, message: clientOk ? 'E-mail CLIENTE enviado!' : 'Falha no e-mail do cliente' },
        providerEmail: { success: providerOk, message: providerOk ? 'E-mail FORNECEDOR enviado!' : 'Falha no e-mail do fornecedor' },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/email/welcome", async (req: Request, res: Response) => {
    try {
      const { name, email, password, userType, profileName, verificationCode } = req.body;
      if (!name || !email || !password) return res.status(400).json({ error: 'Campos name, email e password são obrigatórios' });
      const systemUrl = process.env.SYSTEM_URL || `https://${process.env.REPLIT_DOMAINS?.split(',')[0] || 'app.grupotmseg.com.br'}`;
      const success = await sendWelcomeEmail({ name, email, password, userType: userType || 'internal', profileName }, systemUrl, verificationCode);
      res.json({ success, message: success ? 'E-mail de boas-vindas enviado!' : 'Falha ao enviar e-mail' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  const getResetPool = () => {
    const dbPass = process.env.SUPABASE_DB_PASSWORD;
    if (!dbPass) throw new Error('SUPABASE_DB_PASSWORD não configurada');
    return new pg.Pool({
      connectionString: `postgresql://postgres.ajhmmjuewdsukecaimik:${dbPass}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`,
      ssl: { rejectUnauthorized: false },
      max: 2
    });
  };

  app.post("/api/password-reset/request", async (req: Request, res: Response) => {
    try {
      const { userId, senderName } = req.body;
      if (!userId) return res.status(400).json({ error: 'userId obrigatório' });

      const pool = getResetPool();
      try {
        const userResult = await pool.query('SELECT id, name, email FROM system_users WHERE id = $1', [userId]);
        if (userResult.rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado' });
        const user = userResult.rows[0];

        const crypto = await import('crypto');
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        await pool.query(
          'UPDATE system_users SET password_reset_token = $1, password_reset_expires = $2, force_password_change = true WHERE id = $3',
          [token, expiresAt, userId]
        );

        const verifyResult = await pool.query('SELECT password_reset_token FROM system_users WHERE id = $1', [userId]);
        console.log(`[PasswordReset] Token gravado para user ${userId}: ${verifyResult.rows[0]?.password_reset_token ? 'SIM' : 'NÃO'}`);

        const systemUrl = process.env.SYSTEM_URL || `https://${process.env.REPLIT_DOMAINS?.split(',')[0] || 'app.grupotmseg.com.br'}`;
        const resetLink = `${systemUrl}/reset-password?token=${token}`;

        const success = await sendPasswordResetEmail(user.email, user.name, resetLink, senderName);
        res.json({ success, message: success ? 'E-mail de redefinição enviado!' : 'Falha ao enviar e-mail' });
      } finally {
        await pool.end();
      }
    } catch (err: any) {
      console.error('[PasswordReset] Erro:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/password-reset/validate", async (req: Request, res: Response) => {
    try {
      const { token } = req.body;
      if (!token) return res.status(400).json({ error: 'Token obrigatório' });

      const pool = getResetPool();
      try {
        const result = await pool.query(
          'SELECT id, name, email, password_reset_expires FROM system_users WHERE password_reset_token = $1',
          [token]
        );

        if (result.rows.length === 0) return res.status(404).json({ error: 'Token inválido ou expirado' });
        const user = result.rows[0];

        if (new Date(user.password_reset_expires) < new Date()) {
          return res.status(410).json({ error: 'Token expirado' });
        }

        res.json({ valid: true, userName: user.name, userEmail: user.email });
      } finally {
        await pool.end();
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/password-reset/confirm", async (req: Request, res: Response) => {
    try {
      const { token, newPassword } = req.body;
      if (!token || !newPassword) return res.status(400).json({ error: 'Token e nova senha são obrigatórios' });
      if (newPassword.length < 6) return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres' });

      const pool = getResetPool();
      try {
        const result = await pool.query(
          'SELECT id, name, password_reset_expires FROM system_users WHERE password_reset_token = $1',
          [token]
        );

        if (result.rows.length === 0) return res.status(404).json({ error: 'Token inválido ou expirado' });
        const user = result.rows[0];

        if (new Date(user.password_reset_expires) < new Date()) {
          return res.status(410).json({ error: 'Token expirado' });
        }

        await pool.query(
          'UPDATE system_users SET password = $1, password_reset_token = NULL, password_reset_expires = NULL, force_password_change = false WHERE id = $2',
          [newPassword, user.id]
        );

        res.json({ success: true, message: 'Senha alterada com sucesso!' });
      } finally {
        await pool.end();
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/email/mission-scheduled", async (req: Request, res: Response) => {
    try {
      const { missionId, client, origin, destination, start_time, mission_type, vehiclePlate, senderName } = req.body;
      if (!missionId || !client) return res.status(400).json({ error: 'Campos missionId e client obrigatórios' });

      const { data: missionCheck } = await supabase.from('missions').select('*').eq('id', missionId).single();
      if (!missionCheck) return res.status(404).json({ error: 'Missão não encontrada' });

      const missionData = {
        id: missionId,
        client: missionCheck.client || client || '',
        provider: missionCheck.provider || '',
        origin: origin || missionCheck.origin || '',
        destination: destination || missionCheck.destination || '',
        start_time: start_time || missionCheck.start_time || '',
        mission_type: mission_type || missionCheck.mission_type || 'Caracterizada',
      };

      let clientVehicleLabel = '';
      if (missionCheck.client_vehicle_id) {
        const { data: cv } = await supabase.from('client_vehicles').select('plate, model').eq('id', missionCheck.client_vehicle_id).single();
        if (cv?.plate) clientVehicleLabel = cv.model ? `${cv.plate} / ${cv.model}` : cv.plate;
      }
      if (!clientVehicleLabel && vehiclePlate && vehiclePlate !== '—') {
        clientVehicleLabel = vehiclePlate;
      }
      if (!clientVehicleLabel) {
        const fallbackVal = missionCheck.client_vehicle || '';
        if (fallbackVal && !isNaN(Number(fallbackVal))) {
          const { data: cvFallback } = await supabase.from('client_vehicles').select('plate, model').eq('id', Number(fallbackVal)).single();
          if (cvFallback?.plate) clientVehicleLabel = cvFallback.model ? `${cvFallback.plate} / ${cvFallback.model}` : cvFallback.plate;
        } else if (fallbackVal) {
          clientVehicleLabel = fallbackVal;
        }
      }

      const grEspelhamento = missionCheck.gr_espelhamento || '';
      let trackerInfo = '';
      if (missionCheck.vehicle_id) {
        const { data: veh } = await supabase.from('vehicles').select('tracker_type, tracker_id').eq('id', missionCheck.vehicle_id).single();
        if (veh && (veh.tracker_type || veh.tracker_id)) {
          trackerInfo = `${veh.tracker_type || '-'} / ID: ${veh.tracker_id || '-'}`;
        }
      }

      const driverName = missionCheck.driver_name || '';
      const driverPhone = missionCheck.driver_phone || '';

      const agent1 = missionCheck.agent1 || '';
      const agent2 = missionCheck.agent2 || '';

      let escortVehiclePlate = '';
      if (missionCheck.vehicle_id) {
        const { data: escVeh } = await supabase.from('vehicles').select('plate, model').eq('id', missionCheck.vehicle_id).single();
        if (escVeh?.plate) escortVehiclePlate = escVeh.model ? `${escVeh.plate} / ${escVeh.model}` : escVeh.plate;
      }

      const missingFields: string[] = [];
      if (!agent1) missingFields.push('Agente 01');
      if (!agent2) missingFields.push('Agente 02');
      if (!escortVehiclePlate) missingFields.push('Placa da viatura de escolta');
      if (!clientVehicleLabel || clientVehicleLabel === '—' || clientVehicleLabel === '') missingFields.push('Placa do veículo do cliente');
      if (!driverName) missingFields.push('Nome do motorista');
      if (!driverPhone) missingFields.push('Telefone do motorista');
      if (!missionData.origin) missingFields.push('Origem');
      if (!missionData.destination) missingFields.push('Destino');

      if (missingFields.length > 0) {
        await supabase.from('missions').update({ email_pending_client: true }).eq('id', missionId);
        console.log(`[Email Fila] Missão ${missionId} → Cliente pendente (faltam: ${missingFields.join(', ')})`);
        return res.json({ success: true, queued: true, message: `📋 E-mail do CLIENTE na fila — faltam: ${missingFields.join(', ')}` });
      }

      await supabase.from('missions').update({ email_pending_client: false }).eq('id', missionId);

      const { data: clientData } = await supabase.from('clients').select('operational_email, email').eq('name', missionData.client).single();
      const clientEmail = clientData?.operational_email || clientData?.email;
      
      const enrichedMission = { ...missionData, agent1, agent2, escort_vehicle_plate: escortVehiclePlate, driver_name: driverName, driver_phone: driverPhone };

      if (!clientEmail) {
        const fallback = 'operacional@grupotmseg.com.br';
        const alertMission = { ...enrichedMission, _noEmailAlert: true, _alertEntity: 'Cliente', _alertName: missionData.client };
        const result = await sendMissionEmailToClient(alertMission, fallback, clientVehicleLabel, grEspelhamento, trackerInfo, senderName);
        const success = typeof result === 'object' ? result.success : result;
        return res.json({ success, message: success ? `⚠️ Cliente "${missionData.client}" sem e-mail — notificação enviada para operacional.` : 'Falha ao enviar' });
      }

      const result = await sendMissionEmailToClient(enrichedMission, clientEmail, clientVehicleLabel, grEspelhamento, trackerInfo, senderName);
      const success = typeof result === 'object' ? result.success : result;
      if (success && typeof result === 'object' && result.messageId) {
        await supabase.from('missions').update({ email_message_id: result.messageId }).eq('id', missionId);
        console.log(`[Email] Message-ID salvo para missão ${missionId}: ${result.messageId}`);
      }
      res.json({ success, message: success ? 'E-mail de agendamento enviado ao cliente!' : 'Falha ao enviar' });
    } catch (err: any) {
      console.error('[Email] Erro mission-scheduled:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/email/mission-solicited", async (req: Request, res: Response) => {
    try {
      const { missionId, provider, vehiclePlate, origin, destination, start_time, mission_type, driver_name, driver_phone, senderName } = req.body;
      if (!missionId || !provider) return res.status(400).json({ error: 'Campos missionId e provider obrigatórios' });

      const { data: missionCheck } = await supabase.from('missions').select('*').eq('id', missionId).single();
      if (!missionCheck) return res.status(404).json({ error: 'Missão não encontrada' });

      const missionData = {
        id: missionId,
        client: missionCheck.client || '',
        provider: missionCheck.provider || provider || '',
        origin: origin || missionCheck.origin || '',
        destination: destination || missionCheck.destination || '',
        start_time: start_time || missionCheck.start_time || '',
        mission_type: mission_type || missionCheck.mission_type || 'Caracterizada',
        driver_name: driver_name || missionCheck.driver_name || '',
        driver_phone: driver_phone || missionCheck.driver_phone || '',
      };

      let cargoVehicleLabel = vehiclePlate || '';
      if (missionCheck.vehicle_id) {
        const { data: veh } = await supabase.from('vehicles').select('plate, model').eq('id', missionCheck.vehicle_id).single();
        if (veh) cargoVehicleLabel = veh.model ? `${veh.plate} / ${veh.model}` : veh.plate;
      }
      if (!cargoVehicleLabel) cargoVehicleLabel = missionCheck.client_vehicle || '';

      const missingFields: string[] = [];
      if (!cargoVehicleLabel || cargoVehicleLabel === '—' || cargoVehicleLabel === '') missingFields.push('Placa do veículo/carga');
      if (!missionData.driver_name) missingFields.push('Nome do motorista');
      if (!missionData.driver_phone) missingFields.push('Telefone do motorista');
      if (!missionData.origin) missingFields.push('Origem');
      if (!missionData.destination) missingFields.push('Destino');

      if (missingFields.length > 0) {
        await supabase.from('missions').update({ email_pending_provider: true }).eq('id', missionId);
        console.log(`[Email Fila] Missão ${missionId} → Fornecedor pendente (faltam: ${missingFields.join(', ')})`);
        return res.json({ success: true, queued: true, message: `📋 E-mail do FORNECEDOR na fila — faltam: ${missingFields.join(', ')}` });
      }

      await supabase.from('missions').update({ email_pending_provider: false }).eq('id', missionId);

      const { data: provData } = await supabase.from('providers').select('os_email, email').eq('name', missionData.provider).single();
      const provEmail = provData?.os_email || provData?.email;
      
      if (!provEmail) {
        const fallback = 'operacional@grupotmseg.com.br';
        const alertMission = { ...missionData, _noEmailAlert: true, _alertEntity: 'Fornecedor', _alertName: missionData.provider };
        const success = await sendMissionEmailToProvider(alertMission, fallback, cargoVehicleLabel, senderName);
        return res.json({ success, message: success ? `⚠️ Fornecedor "${missionData.provider}" sem e-mail — notificação enviada para operacional.` : 'Falha ao enviar' });
      }

      const success = await sendMissionEmailToProvider(missionData, provEmail, cargoVehicleLabel, senderName);
      res.json({ success, message: success ? 'E-mail de solicitação enviado ao fornecedor!' : 'Falha ao enviar' });
    } catch (err: any) {
      console.error('[Email] Erro mission-solicited:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/email/mission-change-client", async (req: Request, res: Response) => {
    try {
      const { missionId, client, origin, destination, start_time, mission_type, vehiclePlate, changes, senderName } = req.body;
      if (!missionId || !client || !changes?.length) return res.status(400).json({ error: 'Dados obrigatórios ausentes' });

      const providerBlockedFields = ['fornecedor', 'provider', 'prestador'];
      const safeChanges = (changes as any[]).filter((c: any) => !providerBlockedFields.includes((c.field || '').toLowerCase()));
      if (safeChanges.length === 0) return res.json({ success: true, message: 'Sem alterações relevantes para o cliente' });

      const { data: clientData } = await supabase.from('clients').select('operational_email, email').eq('name', client).single();
      const clientEmail = clientData?.operational_email || clientData?.email;
      if (!clientEmail) return res.json({ success: false, message: 'Cliente sem e-mail cadastrado' });

      const missionData = { id: missionId, client, origin: origin || '', destination: destination || '', start_time: start_time || '', mission_type: mission_type || 'Caracterizada', provider: '', driver_name: '', driver_phone: '' };
      const success = await sendMissionChangeNotificationToClient(missionData, clientEmail, vehiclePlate || '', safeChanges, senderName);
      res.json({ success, message: success ? 'E-mail de alteração enviado ao cliente!' : 'Falha ao enviar' });
    } catch (err: any) {
      console.error('[Email] Erro mission-change-client:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/email/mission-change-provider", async (req: Request, res: Response) => {
    try {
      const { missionId, provider, origin, destination, start_time, mission_type, vehiclePlate, changes, senderName } = req.body;
      if (!missionId || !provider || !changes?.length) return res.status(400).json({ error: 'Dados obrigatórios ausentes' });

      const { data: provData } = await supabase.from('providers').select('os_email, email').eq('name', provider).single();
      const provEmail = provData?.os_email || provData?.email;
      if (!provEmail) return res.json({ success: false, message: 'Fornecedor sem e-mail cadastrado' });

      const { data: missionCheck } = await supabase.from('missions').select('client').eq('id', missionId).single();
      const missionData = { id: missionId, client: missionCheck?.client || '', provider, origin: origin || '', destination: destination || '', start_time: start_time || '', mission_type: mission_type || 'Caracterizada', driver_name: '', driver_phone: '' };
      const success = await sendMissionChangeNotificationToProvider(missionData, provEmail, vehiclePlate || '', changes, senderName);
      res.json({ success, message: success ? 'E-mail de alteração enviado ao fornecedor!' : 'Falha ao enviar' });
    } catch (err: any) {
      console.error('[Email] Erro mission-change-provider:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/email/mirroring-evidence", async (req: Request, res: Response) => {
    try {
      const { missionId, client, imageUrl, vehiclePlate, origin, destination, start_time, mission_type, senderName } = req.body;
      if (!missionId || !client || !imageUrl) return res.status(400).json({ error: 'Dados obrigatórios ausentes' });

      const { data: clientData } = await supabase.from('clients').select('*').eq('name', client).single();
      const clientEmail = clientData?.operational_email || clientData?.email;

      let clientVehicleLabel = '';
      const { data: missionRow } = await supabase.from('missions').select('client_vehicle_id, client_vehicle, vehicle_id, gr_espelhamento, email_message_id').eq('id', missionId).single();
      if (missionRow?.client_vehicle_id) {
        const { data: cv } = await supabase.from('client_vehicles').select('plate, model').eq('id', missionRow.client_vehicle_id).single();
        if (cv?.plate) clientVehicleLabel = cv.model ? `${cv.plate} / ${cv.model}` : cv.plate;
      }
      if (!clientVehicleLabel && vehiclePlate && vehiclePlate !== '—') {
        clientVehicleLabel = vehiclePlate;
      }
      if (!clientVehicleLabel) {
        const fallbackVal = missionRow?.client_vehicle || '';
        if (fallbackVal && !isNaN(Number(fallbackVal))) {
          const { data: cvFb } = await supabase.from('client_vehicles').select('plate, model').eq('id', Number(fallbackVal)).single();
          if (cvFb?.plate) clientVehicleLabel = cvFb.model ? `${cvFb.plate} / ${cvFb.model}` : cvFb.plate;
        } else if (fallbackVal) {
          clientVehicleLabel = fallbackVal;
        }
      }

      const grEspelhamento = missionRow?.gr_espelhamento || '';
      let trackerInfo = '';
      if (missionRow?.vehicle_id) {
        const { data: veh } = await supabase.from('vehicles').select('tracker_type, tracker_id').eq('id', missionRow.vehicle_id).single();
        if (veh && (veh.tracker_type || veh.tracker_id)) {
          trackerInfo = `${veh.tracker_type || '-'} / ID: ${veh.tracker_id || '-'}`;
        }
      }

      const missionData: any = { id: missionId, client, origin: origin || '', destination: destination || '', start_time: start_time || '', mission_type: mission_type || 'Caracterizada' };
      const threadMessageId = missionRow?.email_message_id || '';

      const targetEmail = clientEmail || 'operacional@grupotmseg.com.br';
      if (!clientEmail) {
        missionData._noEmailAlert = true;
        missionData._alertEntity = 'Cliente';
        missionData._alertName = client;
      }
      const success = await sendMirroringEvidenceEmail(missionData, targetEmail, clientVehicleLabel, imageUrl, grEspelhamento, trackerInfo, threadMessageId, senderName);
      res.json({ success, message: success ? (clientEmail ? 'E-mail de evidência de espelhamento enviado ao cliente!' : `⚠️ Cliente "${client}" sem e-mail — notificação enviada para operacional.`) : 'Falha ao enviar' });
    } catch (err: any) {
      console.error('[Email] Erro mirroring-evidence:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/email/mission-resend-client", async (req: Request, res: Response) => {
    try {
      const { missionId, senderName } = req.body;
      if (!missionId) return res.status(400).json({ error: 'ID da missão obrigatório' });

      const { data: missionRow } = await supabase.from('missions').select('*').eq('id', missionId).single();
      if (!missionRow) return res.status(404).json({ error: 'Missão não encontrada' });

      const { data: clientData } = await supabase.from('clients').select('*').eq('name', missionRow.client).single();
      const clientEmail = clientData?.operational_email || clientData?.email;

      let clientVehicleLabel = '';
      if (missionRow.client_vehicle_id) {
        const { data: cv } = await supabase.from('client_vehicles').select('plate, model').eq('id', missionRow.client_vehicle_id).single();
        if (cv?.plate) clientVehicleLabel = cv.model ? `${cv.plate} / ${cv.model}` : cv.plate;
      }
      if (!clientVehicleLabel) {
        const fallbackVal = missionRow.client_vehicle || '';
        if (fallbackVal && !isNaN(Number(fallbackVal))) {
          const { data: cvFallback } = await supabase.from('client_vehicles').select('plate, model').eq('id', Number(fallbackVal)).single();
          if (cvFallback?.plate) clientVehicleLabel = cvFallback.model ? `${cvFallback.plate} / ${cvFallback.model}` : cvFallback.plate;
        } else if (fallbackVal) {
          clientVehicleLabel = fallbackVal;
        }
      }
      if (!clientVehicleLabel) clientVehicleLabel = '—';

      const grEspelhamento = missionRow.gr_espelhamento || '';
      let trackerInfo = '';
      if (missionRow.vehicle_id) {
        const { data: veh } = await supabase.from('vehicles').select('tracker_type, tracker_id').eq('id', missionRow.vehicle_id).single();
        if (veh && (veh.tracker_type || veh.tracker_id)) {
          trackerInfo = `${veh.tracker_type || '-'} / ID: ${veh.tracker_id || '-'}`;
        }
      }

      const missionData: any = {
        id: missionRow.id,
        client: missionRow.client,
        provider: missionRow.provider || '',
        origin: missionRow.origin || '',
        destination: missionRow.destination || '',
        start_time: missionRow.start_time || '',
        mission_type: missionRow.mission_type || 'Caracterizada',
        driver_name: missionRow.driver_name || '',
        driver_phone: missionRow.driver_phone || ''
      };

      const mirroringUrl = missionRow.mirroring_evidence_url || '';
      const threadMessageId = missionRow.email_message_id || '';
      const targetEmail = clientEmail || 'operacional@grupotmseg.com.br';
      if (!clientEmail) {
        missionData._noEmailAlert = true;
        missionData._alertEntity = 'Cliente';
        missionData._alertName = missionRow.client;
      }
      const success = await sendMissionResendToClient(missionData, targetEmail, clientVehicleLabel, mirroringUrl || undefined, grEspelhamento, trackerInfo, threadMessageId, senderName);
      res.json({ success, message: success ? (clientEmail ? `E-mail enviado para ${clientEmail}${mirroringUrl ? ' (com evidência de espelhamento)' : ''}` : `⚠️ Cliente "${missionRow.client}" sem e-mail — notificação enviada para operacional.`) : 'Falha ao enviar' });
    } catch (err: any) {
      console.error('[Email] Erro mission-resend-client:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/gemini/generate", async (req: Request, res: Response) => {
    try {
      const { contents, config, stream } = req.body;
      const model = req.body.model || "gemini-2.5-flash";
      const finalConfig = { ...config, maxOutputTokens: config?.maxOutputTokens || 8192 };

      if (stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        const streamResult = await ai.models.generateContentStream({
          model,
          contents,
          config: finalConfig
        });

        for await (const chunk of streamResult) {
          const text = chunk.text || "";
          if (text) {
            res.write(`data: ${JSON.stringify({ text })}\n\n`);
          }
        }
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      } else {
        const response = await ai.models.generateContent({
          model,
          contents,
          config: finalConfig
        });
        res.json({ text: response.text || "" });
      }
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: error.message || "Erro interno" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: error.message || "Erro interno do servidor" });
      }
    }
  });

  app.post("/api/chat", async (req: Request, res: Response) => {
    try {
      const { message, history, image } = req.body;
      const systemInstruction = "Você é o assistente oficial de logística e segurança do Grupo TMSEG. Responda de forma profissional e técnica.";

      if (image) {
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: {
            parts: [
              { inlineData: { mimeType: image.mimeType, data: image.data } },
              { text: message || "Analise esta imagem sob a ótica de segurança logística." }
            ]
          },
          config: { systemInstruction, maxOutputTokens: 8192 }
        });
        res.json({ text: response.text || "Não foi possível analisar a imagem." });
      } else {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        const chatHistory = (history || []).map((m: any) => ({
          role: m.role === "user" ? "user" : "model",
          parts: [{ text: m.text }]
        }));

        const stream = await ai.models.generateContentStream({
          model: "gemini-2.5-flash",
          contents: [...chatHistory, { role: "user", parts: [{ text: message }] }],
          config: { systemInstruction, maxOutputTokens: 8192 }
        });

        for await (const chunk of stream) {
          const text = chunk.text || "";
          if (text) {
            res.write(`data: ${JSON.stringify({ text })}\n\n`);
          }
        }
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      }
    } catch (error: any) {
      console.error("Chat API Error:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: error.message || "Erro interno" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: error.message || "Erro interno do servidor" });
      }
    }
  });

  const SUPABASE_URL = 'https://ajhmmjuewdsukecaimik.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqaG1tanVld2RzdWtlY2FpbWlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNzUxMjEsImV4cCI6MjA3OTc1MTEyMX0.5bXRWTyb1HxLimt3lqJTBfjzDoumux7TXlW4lycXrPk';
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  app.post("/api/supabase/init-invoices", async (_req: Request, res: Response) => {
    try {
      const { data, error } = await supabaseAdmin.from('financial_invoices').select('id', { count: 'exact', head: true });

      const newCols = ['nf_image_url', 'boleto_image_url', 'provider', 'issuer_company', 'boleto_due_date', 'asaas_payment_id', 'asaas_status', 'asaas_invoice_url', 'asaas_bankslip_url', 'asaas_pix_payload', 'asaas_barcode'];

      if (error && error.code === '42P01') {
        const createSql = `
          CREATE TABLE IF NOT EXISTS public.financial_invoices (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            client TEXT NOT NULL,
            number TEXT NOT NULL,
            amount DOUBLE PRECISION NOT NULL DEFAULT 0,
            date TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'EMITIDA',
            notes TEXT DEFAULT '',
            created_by TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            nf_image_url TEXT,
            boleto_image_url TEXT,
            provider TEXT,
            issuer_company TEXT,
            boleto_due_date TEXT
          );
          ALTER TABLE public.financial_invoices ENABLE ROW LEVEL SECURITY;
          CREATE POLICY IF NOT EXISTS "Allow all for financial_invoices" ON public.financial_invoices FOR ALL USING (true) WITH CHECK (true);
        `;
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
          body: JSON.stringify({ query: createSql })
        });
        if (!resp.ok) {
          res.json({ ok: false, note: 'Table does not exist. Please create it via Supabase SQL editor.', sql: createSql });
          return;
        }
      } else {
        let needsMigration = false;
        try {
          const { error: checkErr } = await supabaseAdmin.from('financial_invoices').select('nf_image_url').limit(1);
          if (checkErr && checkErr.code === '42703') needsMigration = true;
        } catch { needsMigration = true; }

        if (needsMigration) {
          const supabasePgUrl = `postgresql://postgres.ajhmmjuewdsukecaimik:${process.env.SUPABASE_DB_PASSWORD || ''}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`;
          if (process.env.SUPABASE_DB_PASSWORD) {
            try {
              const pool = new pg.Pool({ connectionString: supabasePgUrl, ssl: { rejectUnauthorized: false } });
              for (const col of newCols) {
                await pool.query(`ALTER TABLE public.financial_invoices ADD COLUMN IF NOT EXISTS ${col} TEXT`).catch(() => {});
              }
              await pool.end();
              console.log('[Invoice migration] Columns added via pg connection');
            } catch (pgErr: any) {
              console.log('[Invoice migration] pg failed:', pgErr.message);
            }
          } else {
            const migSql = newCols.map(c => `ALTER TABLE public.financial_invoices ADD COLUMN IF NOT EXISTS ${c} TEXT;`).join('\n');
            res.json({ ok: true, migration_needed: true, sql: migSql, hint: 'Execute this SQL in Supabase SQL Editor to add the new columns' });
            return;
          }
        }
      }
      res.json({ ok: true });
    } catch (e: any) {
      res.json({ ok: false, error: e.message });
    }
  });

  app.get("/api/supabase/status", async (_req: Request, res: Response) => {
    try {
      const startTime = Date.now();
      const { error: pingError } = await supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true });
      const latencyMs = Date.now() - startTime;

      let incidents: any[] = [];
      try {
        const statusRes = await fetch("https://status.supabase.com/api/v2/incidents.json");
        const statusData = await statusRes.json() as any;
        incidents = (statusData?.incidents || []).slice(0, 5);
      } catch { }

      let scheduledMaintenances: any[] = [];
      try {
        const maintRes = await fetch("https://status.supabase.com/api/v2/scheduled-maintenances.json");
        const maintData = await maintRes.json() as any;
        scheduledMaintenances = (maintData?.scheduled_maintenances || []).slice(0, 3);
      } catch { }

      res.json({
        rest_ok: !pingError,
        latency_ms: latencyMs,
        incidents,
        scheduled_maintenances: scheduledMaintenances,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/supabase/db-metrics", async (_req: Request, res: Response) => {
    try {
      const tables = [
        'missions', 'clients', 'providers', 'vehicles', 'client_vehicles',
        'client_routes', 'client_price_tables', 'provider_cost_tables',
        'system_users', 'system_logs', 'financial_transactions',
        'financial_accounts', 'financial_categories', 'commercial_proposals',
        'quotes', 'provider_agents', 'agents', 'mission_logs', 'mission_history',
        'profiles', 'contracts'
      ];

      const results: { table: string; count: number; estimatedSizeKb: number }[] = [];

      const counts = await Promise.allSettled(
        tables.map(async (table) => {
          const startTime = Date.now();
          const { count, error } = await supabaseAdmin.from(table).select('*', { count: 'exact', head: true });
          const elapsed = Date.now() - startTime;
          if (error) return { table, count: 0, estimatedSizeKb: 0, latency: elapsed, error: error.message };
          const rowCount = count || 0;
          const avgRowSizeKb = ['system_logs', 'mission_logs', 'mission_history'].includes(table) ? 2 : 
                               ['missions', 'commercial_proposals'].includes(table) ? 4 : 1;
          return { table, count: rowCount, estimatedSizeKb: rowCount * avgRowSizeKb, latency: elapsed };
        })
      );

      const tableMetrics = counts.map((result, i) => {
        if (result.status === 'fulfilled') return result.value;
        return { table: tables[i], count: 0, estimatedSizeKb: 0, error: 'Inacessível' };
      });

      const totalRows = tableMetrics.reduce((sum: number, t: any) => sum + (t.count || 0), 0);
      const totalEstimatedKb = tableMetrics.reduce((sum: number, t: any) => sum + (t.estimatedSizeKb || 0), 0);

      res.json({
        tables: tableMetrics,
        total_rows: totalRows,
        total_estimated_size_mb: parseFloat((totalEstimatedKb / 1024).toFixed(2)),
        quota_mb: 500,
        usage_percent: parseFloat((totalEstimatedKb / 1024 / 500 * 100).toFixed(2)),
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/supabase/storage-usage", async (_req: Request, res: Response) => {
    try {
      const { data: buckets, error: bucketsError } = await supabaseAdmin.storage.listBuckets();
      if (bucketsError) throw bucketsError;

      const bucketStats: any[] = [];
      for (const bucket of (buckets || [])) {
        try {
          const { data: files, error: filesError } = await supabaseAdmin.storage.from(bucket.name).list('', { limit: 1000 });
          if (!filesError && files) {
            const totalBytes = files.reduce((sum, f: any) => sum + ((f.metadata as any)?.size || 0), 0);
            bucketStats.push({
              bucket_id: bucket.name,
              objects: files.length,
              size_bytes: totalBytes,
              size_mb: parseFloat((totalBytes / 1024 / 1024).toFixed(2)),
              public: bucket.public,
            });
          } else {
            bucketStats.push({ bucket_id: bucket.name, objects: 0, size_bytes: 0, size_mb: 0, public: bucket.public, error: filesError?.message });
          }
        } catch {
          bucketStats.push({ bucket_id: bucket.name, objects: 0, size_bytes: 0, size_mb: 0, public: bucket.public });
        }
      }

      const totalStorageMb = bucketStats.reduce((sum, b) => sum + b.size_mb, 0);

      res.json({
        buckets: bucketStats,
        total_storage_mb: parseFloat(totalStorageMb.toFixed(2)),
        storage_quota_mb: 1024,
        usage_percent: parseFloat((totalStorageMb / 1024 * 100).toFixed(2)),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/db/capacity", async (_req: Request, res: Response) => {
    try {
      const DB_CAPACITY_GB = Number(process.env.DB_CAPACITY_GB || 0.5);

      const tables = ['missions', 'clients', 'providers', 'vehicles', 'system_users',
        'financial_transactions', 'commercial_proposals', 'client_price_tables',
        'provider_cost_tables', 'system_logs', 'financial_accounts', 'financial_categories'];

      let totalRows = 0;
      const tableStats: any[] = [];

      for (const table of tables) {
        try {
          const { count, error } = await supabaseAdmin.from(table).select('*', { count: 'exact', head: true });
          if (!error && count !== null) {
            totalRows += count;
            tableStats.push({ table, rows: count });
          }
        } catch {}
      }

      let used_bytes = 0;
      let dbSizeSource = 'estimate';

      try {
        const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc('get_db_usage_bytes');
        if (!rpcErr && rpcData) {
          used_bytes = Number(rpcData);
          dbSizeSource = 'rpc';
        }
      } catch {}

      if (used_bytes === 0) {
        const avgRowBytes = 800;
        used_bytes = totalRows * avgRowBytes;
        dbSizeSource = 'estimate';
      }

      const limit_bytes = Math.round(DB_CAPACITY_GB * 1024 * 1024 * 1024);
      const percent_used = limit_bytes > 0 ? used_bytes / limit_bytes : null;

      res.json({
        used_bytes,
        limit_bytes,
        percent_used,
        used_mb: +(used_bytes / 1024 / 1024).toFixed(2),
        used_gb: +(used_bytes / 1024 / 1024 / 1024).toFixed(3),
        limit_gb: DB_CAPACITY_GB,
        total_rows: totalRows,
        tables: tableStats.sort((a, b) => b.rows - a.rows),
        source: dbSizeSource,
        updated_at: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/platform/costs", async (_req: Request, res: Response) => {
    try {
      let overrides: Record<string, number> = {};
      const dbUrl = process.env.DATABASE_URL;
      if (dbUrl) {
        const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, max: 1 });
        try {
          await pool.query(`CREATE TABLE IF NOT EXISTS platform_cost_overrides (
            key TEXT PRIMARY KEY,
            value NUMERIC DEFAULT 0,
            updated_at TIMESTAMP DEFAULT NOW()
          )`);
          const { rows } = await pool.query('SELECT key, value FROM platform_cost_overrides');
          rows.forEach((r: any) => { overrides[r.key] = Number(r.value) || 0; });
        } catch (e) { console.error('Erro ao ler overrides:', e); }
        finally { await pool.end(); }
      }

      const BRL_RATE = overrides['usd_to_brl'] || Number(process.env.USD_TO_BRL || 5.80);

      const replitPlan = process.env.REPLIT_PLAN || 'Hacker';
      const replitPlanCosts: Record<string, { usd: number, label: string }> = {
        'Free': { usd: 0, label: 'Free' },
        'Starter': { usd: 9, label: 'Starter ($9/mês)' },
        'Hacker': { usd: 7, label: 'Hacker ($7/mês)' },
        'Pro': { usd: 20, label: 'Pro ($20/mês)' },
        'Teams': { usd: 25, label: 'Teams ($25/mês)' },
      };
      const replitBase = replitPlanCosts[replitPlan] || replitPlanCosts['Hacker'];

      const supabasePlan = process.env.SUPABASE_PLAN || 'Free';
      const supabasePlanCosts: Record<string, { usd: number, label: string }> = {
        'Free': { usd: 0, label: 'Free Tier' },
        'Pro': { usd: 25, label: 'Pro ($25/mês)' },
        'Team': { usd: 599, label: 'Team ($599/mês)' },
      };
      const supabaseBase = supabasePlanCosts[supabasePlan] || supabasePlanCosts['Free'];

      const replitExtraEgress = overrides['replit_egress'] ?? Number(process.env.REPLIT_EXTRA_EGRESS_USD || 0);
      const replitExtraCompute = overrides['replit_compute'] ?? Number(process.env.REPLIT_EXTRA_COMPUTE_USD || 0);
      const replitExtraStorage = overrides['replit_storage'] ?? Number(process.env.REPLIT_EXTRA_STORAGE_USD || 0);
      const replitExtraAlwaysOn = overrides['replit_always_on'] ?? 0;
      const replitExtraOther = overrides['replit_other'] ?? 0;
      const supabaseExtraDb = overrides['supabase_db'] ?? Number(process.env.SUPABASE_EXTRA_DB_USD || 0);
      const supabaseExtraBandwidth = overrides['supabase_bandwidth'] ?? Number(process.env.SUPABASE_EXTRA_BANDWIDTH_USD || 0);
      const supabaseExtraStorage = overrides['supabase_storage'] ?? Number(process.env.SUPABASE_EXTRA_STORAGE_USD || 0);

      const googleMapsEstimate = overrides['google_maps'] ?? Number(process.env.GOOGLE_MAPS_MONTHLY_USD || 0);
      const resendEstimate = overrides['resend'] ?? Number(process.env.RESEND_MONTHLY_USD || 0);
      const otherCosts = overrides['other_apis'] ?? Number(process.env.OTHER_MONTHLY_COSTS_USD || 0);

      const replitTotalUsd = replitBase.usd + replitExtraEgress + replitExtraCompute + replitExtraStorage + replitExtraAlwaysOn + replitExtraOther;
      const supabaseTotalUsd = supabaseBase.usd + supabaseExtraDb + supabaseExtraBandwidth + supabaseExtraStorage;
      const apiTotalUsd = googleMapsEstimate + resendEstimate + otherCosts;
      const grandTotalUsd = replitTotalUsd + supabaseTotalUsd + apiTotalUsd;

      const toR = (v: number) => +(v * BRL_RATE).toFixed(2);

      const DB_CAPACITY_GB = Number(process.env.DB_CAPACITY_GB || 0.5);
      let dbUsedMb = 0;
      try {
        const { data: capData } = await supabaseAdmin.from('missions').select('*', { count: 'exact', head: true });
        const missionsCount = (capData as any)?.length || 0;
        dbUsedMb = missionsCount * 0.001;
      } catch {}

      const savingTips = [];

      if (supabasePlan === 'Free') {
        savingTips.push({
          area: 'Supabase',
          tip: 'Limpe registros antigos de system_logs periodicamente para economizar espaço no banco Free Tier (500MB).',
          impact: 'Médio',
          action: 'DELETE FROM system_logs WHERE created_at < NOW() - INTERVAL \'90 days\''
        });
        savingTips.push({
          area: 'Supabase',
          tip: 'Comprima imagens antes de fazer upload no Storage para reduzir os 1GB gratuitos.',
          impact: 'Baixo',
          action: 'Use ferramentas como TinyPNG ou compressão no frontend antes do upload.'
        });
      }

      savingTips.push({
        area: 'Replit',
        tip: 'Configure o Repl para hibernar após inatividade. O Always-On consome créditos mesmo sem tráfego.',
        impact: 'Alto',
        action: 'Desative Always-On se o sistema não precisa estar 24/7 disponível.'
      });

      savingTips.push({
        area: 'Google Maps',
        tip: 'Cache rotas calculadas localmente. Cada chamada de Directions API custa ~$0.005-$0.01.',
        impact: 'Alto',
        action: 'Salve totalDistance e estimatedTime na missão ao calcular a rota pela primeira vez.'
      });

      savingTips.push({
        area: 'Gemini AI',
        tip: 'As chamadas AI via Replit Integrations são gratuitas. Aproveite para chatbot, auditoria e análises.',
        impact: 'Info',
        action: 'Continue usando o Gemini via Replit AI Integrations (sem custo adicional).'
      });

      savingTips.push({
        area: 'Supabase',
        tip: 'Adicione índices nas colunas mais consultadas (client, status, created_at) para reduzir tempo de query.',
        impact: 'Médio',
        action: 'CREATE INDEX idx_missions_client ON missions(client); CREATE INDEX idx_missions_status ON missions(status);'
      });

      savingTips.push({
        area: 'Replit',
        tip: 'Use variáveis de ambiente ao invés de hardcode para trocar de plano sem alterar código.',
        impact: 'Baixo',
        action: 'Defina REPLIT_PLAN, SUPABASE_PLAN, DB_CAPACITY_GB no painel de Secrets.'
      });

      savingTips.push({
        area: 'Geral',
        tip: 'Monitore o consumo mensal de bandwidth do Supabase. O Free Tier tem 2GB/mês de transferência.',
        impact: 'Médio',
        action: 'Verifique o dashboard do Supabase em Usage > Bandwidth mensalmente.'
      });

      res.json({
        currency_rate: BRL_RATE,
        replit: {
          plan: replitBase.label,
          base_usd: replitBase.usd,
          base_brl: toR(replitBase.usd),
          extras: {
            egress: { usd: replitExtraEgress, brl: toR(replitExtraEgress) },
            compute: { usd: replitExtraCompute, brl: toR(replitExtraCompute) },
            storage: { usd: replitExtraStorage, brl: toR(replitExtraStorage) },
            always_on: { usd: replitExtraAlwaysOn, brl: toR(replitExtraAlwaysOn) },
            other: { usd: replitExtraOther, brl: toR(replitExtraOther) },
          },
          total_usd: replitTotalUsd,
          total_brl: toR(replitTotalUsd),
        },
        supabase: {
          plan: supabaseBase.label,
          base_usd: supabaseBase.usd,
          base_brl: toR(supabaseBase.usd),
          extras: {
            db: { usd: supabaseExtraDb, brl: toR(supabaseExtraDb) },
            bandwidth: { usd: supabaseExtraBandwidth, brl: toR(supabaseExtraBandwidth) },
            storage: { usd: supabaseExtraStorage, brl: toR(supabaseExtraStorage) },
          },
          total_usd: supabaseTotalUsd,
          total_brl: toR(supabaseTotalUsd),
          db_capacity_gb: DB_CAPACITY_GB,
        },
        apis: {
          google_maps: { usd: googleMapsEstimate, brl: toR(googleMapsEstimate) },
          resend: { usd: resendEstimate, brl: toR(resendEstimate) },
          other: { usd: otherCosts, brl: toR(otherCosts) },
          total_usd: apiTotalUsd,
          total_brl: toR(apiTotalUsd),
        },
        total_usd: grandTotalUsd,
        total_brl: toR(grandTotalUsd),
        saving_tips: savingTips,
        updated_at: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/platform/costs/overrides", async (req: Request, res: Response) => {
    try {
      const dbUrl = process.env.DATABASE_URL;
      if (!dbUrl) return res.status(500).json({ error: 'DATABASE_URL não configurada' });
      const { overrides } = req.body;
      if (!overrides || typeof overrides !== 'object') return res.status(400).json({ error: 'overrides inválidos' });

      const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, max: 1 });
      try {
        await pool.query(`CREATE TABLE IF NOT EXISTS platform_cost_overrides (
          key TEXT PRIMARY KEY,
          value NUMERIC DEFAULT 0,
          updated_at TIMESTAMP DEFAULT NOW()
        )`);
        for (const [key, value] of Object.entries(overrides)) {
          const numVal = Number(value) || 0;
          await pool.query(
            `INSERT INTO platform_cost_overrides (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
            [key, numVal]
          );
        }
        res.json({ success: true, saved: Object.keys(overrides).length });
      } finally {
        await pool.end();
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/supabase/billing-links", (_req: Request, res: Response) => {
    const projectRef = 'ajhmmjuewdsukecaimik';
    res.json({
      billing: "https://supabase.com/dashboard/org/_/billing",
      usage: "https://supabase.com/dashboard/org/_/usage",
      database: `https://supabase.com/dashboard/project/${projectRef}/database/tables`,
      storage: `https://supabase.com/dashboard/project/${projectRef}/storage/buckets`,
      logs: `https://supabase.com/dashboard/project/${projectRef}/logs/explorer`,
      settings: `https://supabase.com/dashboard/project/${projectRef}/settings/general`,
      api_docs: `https://supabase.com/dashboard/project/${projectRef}/api`,
    });
  });

  app.get("/api/supabase/health-check", async (_req: Request, res: Response) => {
    try {
      const checks: any = {};

      const dbStart = Date.now();
      const { error: dbErr } = await supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true });
      checks.database = { ok: !dbErr, latency_ms: Date.now() - dbStart, error: dbErr?.message || null };

      const authStart = Date.now();
      try {
        const authRes = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
          headers: { apikey: SUPABASE_ANON_KEY },
        });
        checks.auth = { ok: authRes.ok, latency_ms: Date.now() - authStart };
      } catch (e: any) {
        checks.auth = { ok: false, latency_ms: Date.now() - authStart, error: e.message };
      }

      const storageStart = Date.now();
      const { error: storageErr } = await supabaseAdmin.storage.listBuckets();
      checks.storage = { ok: !storageErr, latency_ms: Date.now() - storageStart, error: storageErr?.message || null };

      const realtimeStart = Date.now();
      try {
        const rtRes = await fetch(`${SUPABASE_URL}/realtime/v1/api/tenants`, {
          headers: { apikey: SUPABASE_ANON_KEY },
        });
        checks.realtime = { ok: rtRes.status !== 500, latency_ms: Date.now() - realtimeStart };
      } catch (e: any) {
        checks.realtime = { ok: false, latency_ms: Date.now() - realtimeStart, error: e.message };
      }

      const allOk = Object.values(checks).every((c: any) => c.ok);

      res.json({
        overall: allOk ? 'healthy' : 'degraded',
        checks,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/missions/recalculate-all", async (req: Request, res: Response) => {
    try {
      const fetchAll = async (table: string) => {
        const allRows: any[] = [];
        let from = 0;
        const pageSize = 1000;
        while (true) {
          const { data, error } = await supabaseAdmin.from(table).select('*').range(from, from + pageSize - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          allRows.push(...data);
          if (data.length < pageSize) break;
          from += pageSize;
        }
        return allRows;
      };

      const missions = await fetchAll('missions');
      const clientTables = await fetchAll('client_price_tables');
      const providerTables = await fetchAll('provider_cost_tables');
      const clients = await fetchAll('clients');

      const { calculateMissionFinancials } = await import('../lib/financialUtils');

      let updated = 0;
      let skipped = 0;
      let errors: string[] = [];
      const details: any[] = [];

      const TERMINAL_STATUSES = ['Concluída', 'Cancelada', 'COMPLETED', 'CANCELLED'];

      for (const m of (missions || [])) {
        try {
          if (m.status === 'REFUSED' || m.status === 'Recusada') { skipped++; continue; }
          if (!TERMINAL_STATUSES.includes(m.status)) { skipped++; continue; }
          if (m.billing_approved || m.billing_verified_by) { skipped++; continue; }
          if (m.revenue_value > 0 || m.cost_value > 0) { skipped++; continue; }

          const missionObj = {
            ...m,
            startKm: m.start_km,
            endKm: m.end_km,
            startTime: m.start_time,
            endTime: m.end_time,
          };

          const clientData = (clients || []).find((c: any) => c.name === m.client);
          const financials = calculateMissionFinancials(missionObj, clientTables || [], providerTables || [], clientData);

          const newRevenue = parseFloat((financials.client.total - financials.tollValue).toFixed(2));
          const newCost = parseFloat((financials.provider.total - financials.tollValue).toFixed(2));

          const oldRevenue = m.revenue_value || 0;
          const oldCost = m.cost_value || 0;
          const revDiff = Math.abs(newRevenue - oldRevenue);
          const costDiff = Math.abs(newCost - oldCost);

          if (revDiff > 0.01 || costDiff > 0.01) {
            const { error: upErr } = await supabaseAdmin.from('missions').update({
              revenue_value: newRevenue,
              cost_value: newCost,
            }).eq('id', m.id);

            if (upErr) { errors.push(`${m.id}: ${upErr.message}`); continue; }

            details.push({
              id: m.id,
              client: m.client,
              provider: m.provider,
              agents: [m.agent1, m.agent2].filter(Boolean).length,
              oldRev: oldRevenue, newRev: newRevenue,
              oldCost: oldCost, newCost: newCost,
              clientTable: financials.client.tableName || '-',
              providerTable: financials.provider.tableName || '-',
              providerLog: financials.provider.detectionLog,
            });
            updated++;
          } else {
            skipped++;
          }
        } catch (e: any) {
          errors.push(`${m.id}: ${e.message}`);
        }
      }

      res.json({
        success: true,
        total: (missions || []).length,
        updated,
        skipped,
        errors: errors.length,
        errorDetails: errors.slice(0, 10),
        updatedMissions: details,
      });
    } catch (e: any) {
      console.error("Erro no recálculo:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/client-registries/init", async (_req: Request, res: Response) => {
    try {
      const dbUrl = process.env.DATABASE_URL;
      if (!dbUrl) { res.json({ ok: false, error: "No DATABASE_URL" }); return; }
      const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
      await pool.query(`
        CREATE TABLE IF NOT EXISTS client_registries (
          id SERIAL PRIMARY KEY,
          client_id TEXT NOT NULL,
          type TEXT NOT NULL,
          name TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(client_id, type, name)
        );
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS client_mission_notes (
          id SERIAL PRIMARY KEY,
          mission_id TEXT NOT NULL UNIQUE,
          client_id TEXT NOT NULL,
          motivo TEXT DEFAULT '',
          contrato TEXT DEFAULT '',
          operacao TEXT DEFAULT '',
          tsp TEXT DEFAULT '',
          responsavel TEXT DEFAULT '',
          obs TEXT DEFAULT '',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      await pool.query(`ALTER TABLE client_mission_notes ADD COLUMN IF NOT EXISTS responsavel TEXT DEFAULT ''`).catch(() => {});
      await pool.query(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS operational_report TEXT`).catch(() => {});
      await pool.query(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS provider_start_km DOUBLE PRECISION`).catch(() => {});
      await pool.query(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS provider_end_km DOUBLE PRECISION`).catch(() => {});
      await pool.query(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS provider_start_time TIMESTAMPTZ`).catch(() => {});
      await pool.query(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS provider_end_time TIMESTAMPTZ`).catch(() => {});
      await pool.query(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS provider_ops_edited BOOLEAN DEFAULT FALSE`).catch(() => {});
      await pool.query(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS revenue_edit_reason TEXT`).catch(() => {});
      await pool.query(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS cost_edit_reason TEXT`).catch(() => {});
      await pool.query(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS parent_mission_id TEXT`).catch(() => {});
      await pool.query(`
        CREATE TABLE IF NOT EXISTS financial_invoices (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          client TEXT NOT NULL,
          number TEXT NOT NULL,
          amount DOUBLE PRECISION NOT NULL DEFAULT 0,
          date TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'EMITIDA',
          notes TEXT DEFAULT '',
          created_by TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      await pool.end();
      console.log("Client registries tables created/verified.");
      res.json({ ok: true });
    } catch (e: any) {
      console.error("Error creating client registries tables:", e.message);
      res.json({ ok: true, note: e.message });
    }
  });

  const runHistoryCleanup = async () => {
      try {
          const threeMonthsAgo = new Date();
          threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
          const cutoffDate = threeMonthsAgo.toISOString();

          const BATCH_SIZE = 500;
          let historyDeleted = 0;
          let logsDeleted = 0;

          let batch;
          do {
              const { data, error } = await supabaseAdmin
                  .from('mission_history')
                  .select('id')
                  .lt('changed_at', cutoffDate)
                  .limit(BATCH_SIZE);
              if (error || !data || data.length === 0) break;
              batch = data;
              const ids = batch.map((r: any) => r.id);
              const { error: delErr } = await supabaseAdmin
                  .from('mission_history')
                  .delete()
                  .in('id', ids);
              if (delErr) { console.error('[CLEANUP] Erro deletando mission_history:', delErr.message); break; }
              historyDeleted += ids.length;
              if (ids.length < BATCH_SIZE) break;
              await new Promise(r => setTimeout(r, 1000));
          } while (batch && batch.length === BATCH_SIZE);

          do {
              const { data, error } = await supabaseAdmin
                  .from('mission_logs')
                  .select('id')
                  .lt('created_at', cutoffDate)
                  .limit(BATCH_SIZE);
              if (error || !data || data.length === 0) break;
              batch = data;
              const ids = batch.map((r: any) => r.id);
              const { error: delErr } = await supabaseAdmin
                  .from('mission_logs')
                  .delete()
                  .in('id', ids);
              if (delErr) { console.error('[CLEANUP] Erro deletando mission_logs:', delErr.message); break; }
              logsDeleted += ids.length;
              if (ids.length < BATCH_SIZE) break;
              await new Promise(r => setTimeout(r, 1000));
          } while (batch && batch.length === BATCH_SIZE);

          const results = {
              mission_history: `${historyDeleted} registros removidos`,
              mission_logs: `${logsDeleted} registros removidos`,
              cutoff_date: cutoffDate,
              executed_at: new Date().toISOString()
          };

          console.log('[CLEANUP] Limpeza trimestral executada:', JSON.stringify(results));

          await supabaseAdmin.from('system_logs').insert([{
              user_name: 'Sistema',
              action_type: 'CLEANUP_TRIMESTRAL',
              entity: 'Database',
              entity_id: 'auto',
              details: JSON.stringify(results)
          }]);

          return results;
      } catch (e: any) {
          console.error('[CLEANUP] Erro na limpeza trimestral:', e.message);
          return { error: e.message };
      }
  };

  const checkAndRunCleanup = async () => {
      try {
          const { data } = await supabaseAdmin
              .from('system_logs')
              .select('created_at')
              .eq('action_type', 'CLEANUP_TRIMESTRAL')
              .order('created_at', { ascending: false })
              .limit(1);

          if (data && data.length > 0) {
              const lastRun = new Date(data[0].created_at);
              const daysSince = (Date.now() - lastRun.getTime()) / (1000 * 60 * 60 * 24);
              if (daysSince < 85) {
                  console.log(`[CLEANUP] Última limpeza foi há ${daysSince.toFixed(0)} dias. Próxima em ~${(90 - daysSince).toFixed(0)} dias.`);
                  return;
              }
          }

          console.log('[CLEANUP] Iniciando limpeza trimestral automática...');
          await runHistoryCleanup();
      } catch (e: any) {
          console.error('[CLEANUP] Erro ao verificar necessidade de limpeza:', e.message);
      }
  };

  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  setTimeout(() => {
      checkAndRunCleanup();
      setInterval(checkAndRunCleanup, ONE_DAY_MS);
  }, 5 * 60 * 1000);

  app.post("/api/vendor-verification/:missionId", async (req: Request, res: Response) => {
      try {
          const { missionId } = req.params;
          const { vendor_os_number, invoice_number, release_date, payment_date, verified_by, verified_at, cost_value, toll_value_provider } = req.body;

          const corePayload: any = {};
          if (vendor_os_number !== undefined) corePayload.vendor_os_number = vendor_os_number;
          if (invoice_number !== undefined) corePayload.invoice_number = invoice_number;
          if (release_date !== undefined) corePayload.release_date = release_date;
          if (payment_date !== undefined) corePayload.payment_date = payment_date;
          if (cost_value !== undefined) corePayload.cost_value = cost_value;
          if (toll_value_provider !== undefined) corePayload.toll_value_provider = toll_value_provider;

          if (Object.keys(corePayload).length > 0) {
              const { error: coreErr } = await supabaseAdmin.from('missions').update(corePayload).eq('id', missionId);
              if (coreErr && !(coreErr.message.includes('column') && coreErr.message.includes('does not exist'))) {
                  throw coreErr;
              }
          }

          if (verified_by !== undefined || verified_at !== undefined) {
              const verPayload: any = {};
              if (verified_by !== undefined) verPayload.verified_by = verified_by;
              if (verified_at !== undefined) verPayload.verified_at = verified_at;
              const { error: verErr } = await supabaseAdmin.from('missions').update(verPayload).eq('id', missionId);
              if (verErr && verErr.message.includes('column') && verErr.message.includes('does not exist')) {
                  console.log('[VENDOR-VERIFICATION] verified_by/verified_at columns missing, creating them...');
                  try {
                      await supabaseAdmin.rpc('exec_sql', { sql: 'ALTER TABLE missions ADD COLUMN IF NOT EXISTS verified_by TEXT; ALTER TABLE missions ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;' });
                      await supabaseAdmin.from('missions').update(verPayload).eq('id', missionId);
                  } catch (alterErr: any) {
                      console.warn('[VENDOR-VERIFICATION] Could not auto-create columns:', alterErr.message);
                  }
              } else if (verErr) {
                  throw verErr;
              }
          }

          await supabaseAdmin.from('system_logs').insert([{
              user_name: verified_by || 'Sistema',
              action_type: 'VENDOR_VERIFICATION',
              entity: 'Mission',
              entity_id: missionId,
              details: JSON.stringify({ ...corePayload, verified_by, verified_at })
          }]);

          res.json({ ok: true });
      } catch (e: any) {
          console.error('[VENDOR-VERIFICATION] Erro:', e.message);
          res.status(500).json({ ok: false, error: e.message });
      }
  });

  app.get("/api/vendor-verification/:missionId", async (req: Request, res: Response) => {
      try {
          const { missionId } = req.params;

          const { data: mission, error } = await supabaseAdmin
              .from('missions')
              .select('vendor_os_number, invoice_number, release_date, payment_date, verified_by, verified_at')
              .eq('id', missionId)
              .single();

          if (!error && mission) {
              return res.json({ ok: true, data: mission });
          }

          const { data: logs } = await supabaseAdmin
              .from('system_logs')
              .select('details')
              .eq('action_type', 'VENDOR_VERIFICATION')
              .eq('entity_id', missionId)
              .order('created_at', { ascending: false })
              .limit(1);

          if (logs && logs.length > 0) {
              const details = typeof logs[0].details === 'string' ? JSON.parse(logs[0].details) : logs[0].details;
              return res.json({ ok: true, data: details, source: 'system_logs' });
          }

          res.json({ ok: true, data: null });
      } catch (e: any) {
          res.json({ ok: true, data: null });
      }
  });

  app.post("/api/admin/fix-mission-toll", async (req: Request, res: Response) => {
    try {
      const { missionId, tollValue, revenueValue } = req.body;
      if (!missionId) return res.status(400).json({ error: 'missionId obrigatório' });
      const updates: any = {};
      if (tollValue !== undefined) updates.toll_value = tollValue;
      if (revenueValue !== undefined) updates.revenue_value = revenueValue;
      const setClauses = Object.entries(updates).map(([k, v]) => `${k} = ${v}`).join(', ');
      const sql = `UPDATE missions SET ${setClauses} WHERE id = ${parseInt(missionId)}`;
      const { error: rpcErr } = await supabaseAdmin.rpc('exec_sql', { sql });
      if (rpcErr) throw rpcErr;
      const verifySql = `SELECT id, toll_value, toll_value_provider, revenue_value, cost_value FROM missions WHERE id = ${parseInt(missionId)}`;
      const { data: verifyData, error: verifyErr } = await supabaseAdmin.rpc('exec_sql', { sql: verifySql });
      console.log('[fix-toll] verify:', verifyData, verifyErr?.message);
      res.json({ ok: true, sql, verifyData });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post("/api/admin/inject-operacional-email", async (_req: Request, res: Response) => {
    try {
      const OPERACIONAL = 'operacional@grupotmseg.com.br';
      const log: string[] = [];

      const addEmail = (current: string | null | undefined, opEmail: string): string => {
        if (!current || !current.trim()) return opEmail;
        const emails = current.split(/[,;]\s*/).map(e => e.trim().toLowerCase()).filter(Boolean);
        if (emails.includes(opEmail.toLowerCase())) return current;
        return current.trim() + ', ' + opEmail;
      };

      const { data: clients } = await supabaseAdmin.from('clients').select('id, name, operational_email, email');
      let clientUpdated = 0;
      for (const c of (clients || [])) {
        const updates: any = {};
        const opField = c.operational_email || c.email || '';
        const emailField = c.email || '';
        
        if (opField && !opField.toLowerCase().includes(OPERACIONAL.toLowerCase())) {
          updates.operational_email = addEmail(c.operational_email || c.email, OPERACIONAL);
        } else if (!opField) {
          updates.operational_email = OPERACIONAL;
        }
        
        if (emailField && !emailField.toLowerCase().includes(OPERACIONAL.toLowerCase())) {
          if (!updates.operational_email) {
            updates.operational_email = addEmail(c.operational_email || c.email, OPERACIONAL);
          }
        }

        if (Object.keys(updates).length > 0) {
          await supabaseAdmin.from('clients').update(updates).eq('id', c.id);
          clientUpdated++;
          log.push(`Cliente "${c.name}" → operational_email atualizado`);
        }
      }

      const { data: providers } = await supabaseAdmin.from('providers').select('id, name, os_email, email');
      let providerUpdated = 0;
      for (const p of (providers || [])) {
        const updates: any = {};
        const osField = p.os_email || p.email || '';
        
        if (osField && !osField.toLowerCase().includes(OPERACIONAL.toLowerCase())) {
          updates.os_email = addEmail(p.os_email || p.email, OPERACIONAL);
        } else if (!osField) {
          updates.os_email = OPERACIONAL;
        }

        if (Object.keys(updates).length > 0) {
          await supabaseAdmin.from('providers').update(updates).eq('id', p.id);
          providerUpdated++;
          log.push(`Fornecedor "${p.name}" → os_email atualizado`);
        }
      }

      res.json({ 
        ok: true, 
        clientsTotal: clients?.length || 0,
        clientsUpdated: clientUpdated,
        providersTotal: providers?.length || 0,
        providersUpdated: providerUpdated,
        log 
      });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post("/api/admin/cleanup-history", async (_req: Request, res: Response) => {
      try {
          const results = await runHistoryCleanup();
          res.json({ ok: true, ...results });
      } catch (e: any) {
          res.json({ ok: false, error: e.message });
      }
  });

  app.get("/api/admin/cleanup-preview", async (_req: Request, res: Response) => {
      try {
          const threeMonthsAgo = new Date();
          threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
          const cutoffDate = threeMonthsAgo.toISOString();

          const { count: historyCount } = await supabaseAdmin
              .from('mission_history')
              .select('id', { count: 'exact', head: true })
              .lt('changed_at', cutoffDate);

          const { count: missionLogsCount } = await supabaseAdmin
              .from('mission_logs')
              .select('id', { count: 'exact', head: true })
              .lt('created_at', cutoffDate);

          const { count: totalHistory } = await supabaseAdmin
              .from('mission_history')
              .select('id', { count: 'exact', head: true });

          const { count: totalLogs } = await supabaseAdmin
              .from('mission_logs')
              .select('id', { count: 'exact', head: true });

          res.json({
              cutoff_date: cutoffDate,
              mission_history: { to_delete: historyCount || 0, total: totalHistory || 0 },
              mission_logs: { to_delete: missionLogsCount || 0, total: totalLogs || 0 }
          });
      } catch (e: any) {
          res.json({ ok: false, error: e.message });
      }
  });

  app.post("/api/migrations/provider-ops-columns", async (_req: Request, res: Response) => {
    try {
      const sbUrl = 'https://ajhmmjuewdsukecaimik.supabase.co';
      const sbKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqaG1tanVld2RzdWtlY2FpbWlrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDE3NTEyMSwiZXhwIjoyMDc5NzUxMTIxfQ.0Ql-GHBBFrNbe7iYOwoPx8cZJBhDHMfClaF3AGfIkYA';
      const headers = { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };

      const columns = [
        { name: 'provider_start_km', type: 'double precision' },
        { name: 'provider_end_km', type: 'double precision' },
        { name: 'provider_start_time', type: 'timestamptz' },
        { name: 'provider_end_time', type: 'timestamptz' },
        { name: 'provider_ops_edited', type: 'boolean default false' },
        { name: 'revenue_edit_reason', type: 'text' },
        { name: 'cost_edit_reason', type: 'text' },
        { name: 'vendor_os_number', type: 'text' },
        { name: 'invoice_number', type: 'text' },
        { name: 'release_date', type: 'text' },
        { name: 'payment_date', type: 'text' },
        { name: 'verified_by', type: 'text' },
        { name: 'verified_at', type: 'timestamptz' }
      ];

      const results: string[] = [];
      for (const col of columns) {
        try {
          const rpcRes = await fetch(`${sbUrl}/rest/v1/rpc/`, {
            method: 'POST',
            headers,
            body: JSON.stringify({})
          });
          results.push(`${col.name}: attempted`);
        } catch (e: any) {
          results.push(`${col.name}: ${e.message}`);
        }
      }

      // Use direct SQL via the Supabase management/SQL endpoint
      const sqlStatements = columns.map(c => `ALTER TABLE missions ADD COLUMN IF NOT EXISTS ${c.name} ${c.type}`).join('; ');
      
      // Try via pg connection to Supabase directly
      const supabasePgUrl = `postgresql://postgres.ajhmmjuewdsukecaimik:${process.env.SUPABASE_DB_PASSWORD || ''}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`;
      try {
        const pool = new pg.Pool({ connectionString: supabasePgUrl, ssl: { rejectUnauthorized: false } });
        for (const col of columns) {
          await pool.query(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`).catch(() => {});
        }
        await pool.end();
        res.json({ ok: true, method: 'pg_direct', columns: columns.map(c => c.name) });
      } catch (pgErr: any) {
        res.json({ ok: false, error: pgErr.message, hint: 'Set SUPABASE_DB_PASSWORD secret or run ALTER TABLE manually in Supabase SQL Editor' });
      }
    } catch (e: any) {
      res.json({ ok: false, error: e.message });
    }
  });

  app.post("/api/missions/fix-ceva-logitech-values", async (_req: Request, res: Response) => {
    try {
      const sbUrl = 'https://ajhmmjuewdsukecaimik.supabase.co';
      const sbKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqaG1tanVld2RzdWtlY2FpbWlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNzUxMjEsImV4cCI6MjA3OTc1MTEyMX0.5bXRWTyb1HxLimt3lqJTBfjzDoumux7TXlW4lycXrPk';
      const headers = { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };

      const missionsRes = await fetch(`${sbUrl}/rest/v1/missions?client=ilike.*CEVA*&or=(destination.ilike.*200KM*,destination.ilike.*200%20KM*,destination.ilike.*LOGITECH*)&select=id,revenue_value,cost_value,toll_value,destination,origin,client,provider,status`, { headers });
      const missions = await missionsRes.json();

      const clientTablesRes = await fetch(`${sbUrl}/rest/v1/client_price_tables?client=ilike.*CEVA*&select=*`, { headers });
      const clientTables = await clientTablesRes.json();

      const provTablesRes = await fetch(`${sbUrl}/rest/v1/provider_cost_tables?select=*`, { headers });
      const providerTables = await provTablesRes.json();

      const findTable = (tables: any[], keyword: string) => {
        const norm = keyword.toUpperCase();
        return tables.find((t: any) => {
          const op = (t.operation_type || '').toUpperCase();
          return op.includes(norm);
        });
      };

      let fixed = 0;
      const details: any[] = [];

      for (const m of missions) {
        const dest = (m.destination || '').toUpperCase();
        let targetKeyword = 'LOGITECH';
        if (dest.includes('200KM') || dest.includes('200 KM')) targetKeyword = '200KM';
        if (dest.includes('LOGITECH')) targetKeyword = 'LOGITECH';

        let revTable = findTable(clientTables, targetKeyword);
        if (!revTable && targetKeyword === '200KM') revTable = findTable(clientTables, 'LOGITECH');
        if (!revTable && targetKeyword === 'LOGITECH') revTable = findTable(clientTables, '200KM');

        if (!revTable) continue;

        const correctRevenue = revTable.activation_fee || 0;
        const storedRevenue = parseFloat(m.revenue_value) || 0;

        if (Math.abs(storedRevenue - correctRevenue) > 5) {
          const providerName = (m.provider || '').toUpperCase().trim();
          let provTable = providerTables.find((t: any) => {
            const op = (t.operation_type || '').toUpperCase();
            const prov = (t.provider || '').toUpperCase().trim();
            return prov === providerName && (op.includes('LOGITECH') || op.includes('200KM') || op.includes('200 KM'));
          });

          let correctCost = parseFloat(m.cost_value) || 0;
          if (provTable) {
            correctCost = provTable.activation_cost || correctCost;
          }

          await fetch(`${sbUrl}/rest/v1/missions?id=eq.${m.id}`, {
            method: 'PATCH',
            headers: { ...headers, 'Prefer': 'return=minimal' },
            body: JSON.stringify({ revenue_value: correctRevenue, cost_value: correctCost })
          });

          fixed++;
          details.push({
            id: m.id,
            oldRevenue: storedRevenue,
            newRevenue: correctRevenue,
            oldCost: parseFloat(m.cost_value) || 0,
            newCost: correctCost,
            table: revTable.operation_type
          });
        }
      }

      res.json({ ok: true, fixed, total: missions.length, details });
    } catch (e: any) {
      console.error("Fix CEVA Logitech error:", e.message);
      res.json({ ok: false, error: e.message });
    }
  });

  app.post("/api/missions/ensure-report-column", async (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  const ensureReportsTable = async () => {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) return;
    const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, max: 2 });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS operational_reports (
        id SERIAL PRIMARY KEY,
        mission_id TEXT NOT NULL UNIQUE,
        report_html TEXT NOT NULL DEFAULT '',
        acionado_por TEXT DEFAULT '',
        descritivo TEXT DEFAULT '',
        whatsapp_raw TEXT DEFAULT '',
        photos JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await pool.end();
  };
  ensureReportsTable().catch(e => console.warn('Erro ao criar tabela operational_reports:', e.message));

  app.get("/api/missions/:id/operational-report", async (req: Request, res: Response) => {
    let pool;
    try {
      const dbUrl = process.env.DATABASE_URL;
      if (!dbUrl) { res.json({ operational_report: null }); return; }
      pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, max: 2 });
      const result = await pool.query('SELECT * FROM operational_reports WHERE mission_id = $1', [req.params.id]);
      if (result.rows.length > 0) {
        const row = result.rows[0];
        res.json({
          operational_report: row.report_html,
          acionado_por: row.acionado_por || '',
          descritivo: row.descritivo || '',
          whatsapp_raw: row.whatsapp_raw || '',
          photos: row.photos || []
        });
      } else {
        res.json({ operational_report: null });
      }
    } catch (e: any) {
      res.json({ operational_report: null, error: e.message });
    } finally {
      if (pool) await pool.end();
    }
  });

  app.patch("/api/missions/:id/operational-report", async (req: Request, res: Response) => {
    let pool;
    try {
      const dbUrl = process.env.DATABASE_URL;
      if (!dbUrl) { res.status(500).json({ ok: false, error: 'No DATABASE_URL' }); return; }
      pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, max: 2 });
      const { operational_report, acionado_por, descritivo, whatsapp_raw, photos } = req.body;
      await pool.query(`
        INSERT INTO operational_reports (mission_id, report_html, acionado_por, descritivo, whatsapp_raw, photos, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (mission_id)
        DO UPDATE SET report_html = $2, acionado_por = $3, descritivo = $4, whatsapp_raw = $5, photos = $6, updated_at = NOW()
      `, [req.params.id, operational_report || '', acionado_por || '', descritivo || '', whatsapp_raw || '', JSON.stringify(photos || [])]);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    } finally {
      if (pool) await pool.end();
    }
  });

  const getDbPool = () => {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) throw new Error("No DATABASE_URL");
    return new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, max: 3 });
  };

  app.get("/api/client-registries/:clientId/:type", async (req: Request, res: Response) => {
    let pool;
    try {
      const { clientId, type } = req.params;
      pool = getDbPool();
      const result = await pool.query('SELECT * FROM client_registries WHERE client_id = $1 AND type = $2 ORDER BY name', [clientId, type]);
      res.json(result.rows);
    } catch (e: any) {
      res.json([]);
    } finally { pool?.end().catch(() => {}); }
  });

  app.post("/api/client-registries", async (req: Request, res: Response) => {
    let pool;
    try {
      const { client_id, type, name } = req.body;
      if (!client_id || !type || !name) return res.status(400).json({ error: "Campos obrigatórios" });
      pool = getDbPool();
      const result = await pool.query(
        'INSERT INTO client_registries (client_id, type, name) VALUES ($1, $2, $3) ON CONFLICT (client_id, type, name) DO NOTHING RETURNING *',
        [client_id, type, name.trim()]
      );
      res.json(result.rows[0] || { client_id, type, name: name.trim() });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    } finally { pool?.end().catch(() => {}); }
  });

  app.delete("/api/client-registries/:id", async (req: Request, res: Response) => {
    let pool;
    try {
      pool = getDbPool();
      await pool.query('DELETE FROM client_registries WHERE id = $1', [req.params.id]);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    } finally { pool?.end().catch(() => {}); }
  });

  app.get("/api/client-mission-notes/:missionId", async (req: Request, res: Response) => {
    let pool;
    try {
      pool = getDbPool();
      const result = await pool.query('SELECT * FROM client_mission_notes WHERE mission_id = $1', [req.params.missionId]);
      res.json(result.rows[0] || null);
    } catch (e: any) {
      res.json(null);
    } finally { pool?.end().catch(() => {}); }
  });

  app.post("/api/client-mission-notes", async (req: Request, res: Response) => {
    let pool;
    try {
      const { mission_id, client_id, motivo, contrato, operacao, tsp, responsavel, obs } = req.body;
      if (!mission_id || !client_id) return res.status(400).json({ error: "Campos obrigatórios" });
      pool = getDbPool();
      const result = await pool.query(
        `INSERT INTO client_mission_notes (mission_id, client_id, motivo, contrato, operacao, tsp, responsavel, obs, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (mission_id) DO UPDATE SET motivo=$3, contrato=$4, operacao=$5, tsp=$6, responsavel=$7, obs=$8, updated_at=NOW()
         RETURNING *`,
        [mission_id, client_id, motivo || '', contrato || '', operacao || '', tsp || '', responsavel || '', obs || '']
      );
      res.json(result.rows[0]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    } finally { pool?.end().catch(() => {}); }
  });

  app.post("/api/investment/init", async (_req: Request, res: Response) => {
    let pool;
    try {
      pool = getDbPool();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS account_balance_snapshots (
          id SERIAL PRIMARY KEY,
          account_id TEXT NOT NULL,
          balance NUMERIC(15,2) NOT NULL DEFAULT 0,
          notes TEXT DEFAULT '',
          created_by TEXT DEFAULT '',
          recorded_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_abs_account ON account_balance_snapshots(account_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_abs_recorded ON account_balance_snapshots(recorded_at)`);
      res.json({ ok: true });
    } catch (e: any) {
      res.json({ ok: true, note: e.message });
    } finally { pool?.end().catch(() => {}); }
  });

  app.get("/api/investment/snapshots/:accountId", async (req: Request, res: Response) => {
    let pool;
    try {
      pool = getDbPool();
      const { accountId } = req.params;
      const days = parseInt(req.query.days as string) || 365;
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const result = await pool.query(
        'SELECT * FROM account_balance_snapshots WHERE account_id = $1 AND recorded_at >= $2 ORDER BY recorded_at ASC',
        [accountId, since]
      );
      res.json(result.rows);
    } catch (e: any) {
      res.json([]);
    } finally { pool?.end().catch(() => {}); }
  });

  app.get("/api/investment/snapshots-all", async (req: Request, res: Response) => {
    let pool;
    try {
      pool = getDbPool();
      const days = parseInt(req.query.days as string) || 365;
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const result = await pool.query(
        'SELECT * FROM account_balance_snapshots WHERE recorded_at >= $1 ORDER BY recorded_at ASC',
        [since]
      );
      res.json(result.rows);
    } catch (e: any) {
      res.json([]);
    } finally { pool?.end().catch(() => {}); }
  });

  app.post("/api/investment/snapshots", async (req: Request, res: Response) => {
    let pool;
    try {
      pool = getDbPool();
      const { account_id, balance, notes, created_by } = req.body;
      const result = await pool.query(
        'INSERT INTO account_balance_snapshots (account_id, balance, notes, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
        [account_id, balance, notes || '', created_by || '']
      );
      res.json(result.rows[0]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    } finally { pool?.end().catch(() => {}); }
  });

  app.delete("/api/investment/snapshots/:id", async (req: Request, res: Response) => {
    let pool;
    try {
      pool = getDbPool();
      await pool.query('DELETE FROM account_balance_snapshots WHERE id = $1', [req.params.id]);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    } finally { pool?.end().catch(() => {}); }
  });

  app.get("/api/client-mission-notes/bulk/:clientId", async (req: Request, res: Response) => {
    let pool;
    try {
      pool = getDbPool();
      const result = await pool.query('SELECT * FROM client_mission_notes WHERE client_id = $1', [req.params.clientId]);
      res.json(result.rows);
    } catch (e: any) {
      res.json([]);
    } finally { pool?.end().catch(() => {}); }
  });

  app.post("/api/email/send-verification", async (req: Request, res: Response) => {
    try {
      const { email, userName } = req.body;
      if (!email) return res.status(400).json({ error: "E-mail obrigatório" });

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const sessionId = `${email}_${Date.now()}`;

      verificationCodes.set(sessionId, {
        code,
        expiresAt: Date.now() + 10 * 60 * 1000,
        email
      });

      for (const [key, val] of verificationCodes.entries()) {
        if (val.expiresAt < Date.now()) verificationCodes.delete(key);
      }

      const sent = await sendVerificationCodeEmail(email, userName || 'Usuário', code);

      if (!sent) {
        return res.json({ sessionId, message: "E-mail não pôde ser enviado. Use o código exibido na tela.", fallbackCode: code });
      }

      res.json({ sessionId, message: "Código enviado com sucesso" });
    } catch (e: any) {
      console.error("Email verification error:", e);
      res.status(500).json({ error: e.message || "Erro interno ao enviar e-mail" });
    }
  });

  app.post("/api/email/verify-code", async (req: Request, res: Response) => {
    try {
      const { sessionId, code } = req.body;
      if (!sessionId || !code) return res.status(400).json({ verified: false, error: "Dados incompletos" });

      const session = verificationCodes.get(sessionId);
      if (!session) return res.status(400).json({ verified: false, error: "Sessão expirada. Solicite um novo código." });

      if (session.expiresAt < Date.now()) {
        verificationCodes.delete(sessionId);
        return res.status(400).json({ verified: false, error: "Código expirado. Solicite um novo código." });
      }

      if (session.code !== code.trim()) {
        return res.status(400).json({ verified: false, error: "Código incorreto. Tente novamente." });
      }

      verificationCodes.delete(sessionId);
      res.json({ verified: true });
    } catch (e: any) {
      res.status(500).json({ verified: false, error: e.message });
    }
  });

  app.post("/api/billing/recalculate-all", async (req: Request, res: Response) => {
    try {
      const { dryRun = true } = req.body;

      const { data: missions, error: mErr } = await supabaseAdmin.from('missions').select('*');
      if (mErr) throw mErr;

      const { data: clientTables, error: ctErr } = await supabaseAdmin.from('client_price_tables').select('*');
      if (ctErr) throw ctErr;

      const { data: providerTables, error: ptErr } = await supabaseAdmin.from('provider_cost_tables').select('*');
      if (ptErr) throw ptErr;

      const { data: clients, error: clErr } = await supabaseAdmin.from('clients').select('*');
      if (clErr) throw clErr;

      const now = new Date();
      const results: any[] = [];
      let corrected = 0;
      let skipped = 0;
      let errors = 0;

      for (const raw of (missions || [])) {
        try {
          const m: any = {
            ...raw,
            createdAt: raw.created_at,
            lastUpdate: raw.last_update,
            startTime: raw.start_time,
            endTime: raw.end_time,
            startKm: raw.start_km,
            endKm: raw.end_km,
            totalDistance: raw.total_distance,
            traveledDistance: raw.traveled_distance,
            mapLink: raw.map_link,
            estimatedTime: raw.estimated_time,
            currentLocation: raw.current_location,
            vehicleId: raw.vehicle_id,
            revenue_value: raw.revenue_value,
            cost_value: raw.cost_value,
            toll_value: raw.toll_value,
            toll_value_provider: raw.toll_value_provider,
            billing_approved: raw.billing_approved,
            mission_type: raw.mission_type || 'Caracterizada',
          };

          const clientData = (clients || []).find((c: any) => c.name?.toUpperCase() === (m.client || '').toUpperCase()) || null;

          if (raw.billing_approved || raw.billing_verified_by) { skipped++; continue; }
          if ((Number(raw.revenue_value) || 0) > 0 || (Number(raw.cost_value) || 0) > 0) { skipped++; continue; }

          const calc = calculateMissionFinancials(m, clientTables || [], providerTables || [], clientData, now);
          if (!calc) { skipped++; continue; }

          const storedRev = Number(raw.revenue_value) || 0;
          const storedCost = Number(raw.cost_value) || 0;
          const storedToll = Number(raw.toll_value) || 0;
          const storedTollProv = Number(raw.toll_value_provider) || storedToll;

          const calcRevService = calc.clientTotal - storedToll;
          const calcCostService = calc.providerTotal - storedTollProv;

          const revDiff = Math.abs(storedRev - calcRevService);
          const costDiff = Math.abs(storedCost - calcCostService);

          if (revDiff > 5 || costDiff > 5) {
            const entry: any = {
              osId: raw.id,
              client: raw.client || '-',
              provider: raw.provider || '-',
              storedRev,
              calcRev: calcRevService,
              revDiff: Math.round(revDiff * 100) / 100,
              storedCost,
              calcCost: calcCostService,
              costDiff: Math.round(costDiff * 100) / 100,
              status: raw.status,
              approved: raw.billing_approved || false,
            };

            if (!dryRun) {
              const updatePayload: any = {
                revenue_value: calcRevService,
                cost_value: calcCostService,
                last_update: now.toISOString(),
              };

              let { error: upErr } = await supabaseAdmin.from('missions').update(updatePayload).eq('id', raw.id);
              if (upErr) {
                entry.updateError = upErr.message;
                errors++;
              } else {
                entry.updated = true;
                corrected++;
              }
            } else {
              entry.wouldUpdate = true;
              corrected++;
            }

            results.push(entry);
          } else {
            skipped++;
          }
        } catch (calcErr: any) {
          errors++;
          results.push({ osId: raw.id, error: calcErr.message });
        }
      }

      res.json({
        total: (missions || []).length,
        divergent: results.length,
        corrected,
        skipped,
        errors,
        dryRun,
        results,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ==========================================
  // TOLL API (RapidAPI - territorial/pedagio v1)
  // ==========================================
  const RAPIDAPI_TOLL_KEY = process.env.RAPIDAPI_TOLL_KEY || '';
  const RAPIDAPI_TOLL_HOST = 'territorial-pedagio-v1.p.rapidapi.com';

  const callTollAPI = async (fromCoord: string, toCoord: string, vehicleType: string = 'auto2eixos') => {
    const response = await fetch(`https://${RAPIDAPI_TOLL_HOST}/json/`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-rapidapi-key': RAPIDAPI_TOLL_KEY,
        'x-rapidapi-host': RAPIDAPI_TOLL_HOST,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tollbooth.route',
        params: [{
          from_cord: fromCoord,
          dest_cord: toCoord,
          tipo_veic: vehicleType,
        }],
        id: 'jsonrpc',
      }),
    });
    return response;
  };

  app.get('/api/toll/status', async (_req: Request, res: Response) => {
    try {
      if (!RAPIDAPI_TOLL_KEY) {
        return res.status(400).json({ success: false, error: 'RAPIDAPI_TOLL_KEY não configurada' });
      }
      const response = await callTollAPI('(-23.5505, -46.6333)', '(-22.9068, -43.1729)');
      if (response.ok) {
        return res.json({ success: true });
      }
      const errorBody = await response.text();
      return res.status(response.status).json({ success: false, error: `RapidAPI retornou ${response.status}: ${errorBody}` });
    } catch (e: any) {
      return res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post('/api/toll/calculate', async (req: Request, res: Response) => {
    try {
      if (!RAPIDAPI_TOLL_KEY) {
        return res.json({ success: false, apiError: 'RAPIDAPI_TOLL_KEY não configurada no servidor' });
      }

      const { origin, destination, originCoords, destinationCoords } = req.body;

      let fromCoord = '';
      let toCoord = '';

      if (originCoords && destinationCoords) {
        fromCoord = `(${originCoords.lat}, ${originCoords.lng})`;
        toCoord = `(${destinationCoords.lat}, ${destinationCoords.lng})`;
      } else if (origin && destination) {
        const geocode = async (address: string) => {
          const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${process.env.GOOGLE_MAPS_API_KEY || ''}`;
          const resp = await fetch(url);
          const data = await resp.json();
          if (data.results && data.results.length > 0) {
            return data.results[0].geometry.location;
          }
          return null;
        };

        const [orig, dest] = await Promise.all([geocode(origin), geocode(destination)]);
        if (!orig || !dest) {
          return res.json({ success: false, apiError: 'Não foi possível geocodificar origem/destino' });
        }
        fromCoord = `(${orig.lat}, ${orig.lng})`;
        toCoord = `(${dest.lat}, ${dest.lng})`;
      } else {
        return res.json({ success: false, apiError: 'Origem e destino são obrigatórios' });
      }

      const response = await callTollAPI(fromCoord, toCoord);

      if (!response.ok) {
        const errText = await response.text();
        console.error('RapidAPI Pedágio error:', response.status, errText);
        return res.json({ success: false, apiError: `API de pedágio retornou erro ${response.status}` });
      }

      const tollData = await response.json();

      let tolls: { name: string; value: number; road?: string }[] = [];
      let tollValue = 0;

      const extractTolls = (data: any) => {
        if (data.result && Array.isArray(data.result)) {
          return data.result;
        }
        if (Array.isArray(data)) return data;
        if (data.pedagios && Array.isArray(data.pedagios)) return data.pedagios;
        if (data.tolls && Array.isArray(data.tolls)) return data.tolls;
        return null;
      };

      const tollArray = extractTolls(tollData);

      if (tollArray) {
        tolls = tollArray.map((t: any) => ({
          name: t.concessionaria || t.concessionária || t.praca || t.praça || t.nome || t.name || 'Praça de Pedágio',
          value: parseFloat(t.valor || t.value || t.tarifa || t.price || 0),
          road: t.rodovia || t.estrada || t.road || t.highway || '',
        }));
        tollValue = tolls.reduce((sum, t) => sum + t.value, 0);
      } else if (tollData.result && typeof tollData.result === 'object') {
        if (tollData.result.valor_total !== undefined) {
          tollValue = parseFloat(tollData.result.valor_total) || 0;
        } else if (tollData.result.total !== undefined) {
          tollValue = parseFloat(tollData.result.total) || 0;
        }
      }

      return res.json({
        success: tollValue > 0,
        tollValue: parseFloat(tollValue.toFixed(2)),
        tollCount: tolls.length,
        tolls,
        provider: 'rapidapi-pedagio',
      });
    } catch (e: any) {
      console.error('Erro ao consultar RapidAPI Pedágio:', e);
      return res.json({ success: false, apiError: `Erro interno: ${e.message}` });
    }
  });

  // ═══════════════════════════════════════════════════════
  // TOLL ESTIMATION VIA GEMINI AI
  // ═══════════════════════════════════════════════════════

  app.post('/api/toll/gemini-estimate', async (req: Request, res: Response) => {
    try {
      const { origin, destination } = req.body;
      if (!origin || !destination) {
        return res.json({ success: false, error: 'Origem e destino são obrigatórios' });
      }

      const prompt = `Você é um engenheiro de tráfego rodoviário brasileiro com conhecimento detalhado de TODAS as praças de pedágio do Brasil.

TAREFA: Identificar as praças de pedágio no trajeto de "${origin}" até "${destination}" para veículo LEVE (carro/SUV - 2 eixos).

REGRAS CRÍTICAS DE ANÁLISE:

1. ROTA REAL: Identifique a rota REAL mais provável entre os dois pontos. Use vias urbanas quando os pontos estão na mesma região metropolitana. NÃO assuma que o veículo pegará rodovias pedagiadas se a rota urbana é mais curta e direta.

2. ROTAS METROPOLITANAS SEM PEDÁGIO: Muitas rotas dentro de regiões metropolitanas NÃO passam por pedágio. Exemplos:
   - Guarulhos → Pinheiros (SP): Via Marginal Tietê/Pinheiros, SEM pedágio
   - Zona Leste SP → Zona Oeste SP: Via vias urbanas, SEM pedágio
   - Osasco → Santo André: Via vias urbanas, SEM pedágio
   - Trajetos dentro da mesma cidade ou região metropolitana próxima geralmente NÃO têm pedágio
   Se a rota mais provável é urbana e sem pedágio, retorne "pracas": [] e "totalEstimado": 0

3. PRAÇAS CORRETAS POR RODOVIA: Só inclua praças que REALMENTE existem na rodovia e trecho percorrido. Não confunda:
   - Praças da Rodovia Ayrton Senna (SP-070) com praças da Dutra (BR-116)
   - Praças do Rodoanel com praças de rodovias radiais
   - Praças da Anchieta-Imigrantes com praças da Régis Bittencourt
   
4. SENTIDO CORRETO: Verifique se a praça cobra no sentido em que o veículo está trafegando. Muitas praças têm cobrança unidirecional.

5. SISTEMA ANCHIETA-IMIGRANTES (SAI): Se o trajeto usar este sistema, identifique se está SUBINDO (Santos→SP) ou DESCENDO (SP→Santos) a serra.

6. VALORES: Use tarifas atualizadas 2025/2026, categoria 1 (2 eixos, rodagem simples).

7. CONFIANÇA: "alta" = certeza absoluta dos valores e praças; "media" = praças corretas mas valores podem variar ±10%; "baixa" = incerteza sobre rota ou praças.

RESPONDA EXCLUSIVAMENTE no JSON abaixo, sem markdown, sem texto adicional:

{
  "totalEstimado": 0.00,
  "pracas": [
    { "nome": "Nome da praça", "rodovia": "SP-XXX ou BR-XXX", "valor": 0.00, "sentido": "sentido da cobrança", "cobrancaUnica": true/false }
  ],
  "observacoes": "Justificativa da rota escolhida e praças identificadas",
  "confianca": "alta/media/baixa"
}`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { maxOutputTokens: 4096, temperature: 0.1 }
      });

      const rawText = (response.text || '').trim();
      
      let parsed: any = null;
      try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        }
      } catch (parseErr) {
        console.error('Erro ao parsear resposta Gemini pedágio:', parseErr, rawText);
      }

      if (parsed && typeof parsed.totalEstimado === 'number') {
        return res.json({
          success: true,
          tollValue: parseFloat(parsed.totalEstimado.toFixed(2)),
          tollCount: Array.isArray(parsed.pracas) ? parsed.pracas.length : 0,
          tolls: (parsed.pracas || []).map((p: any) => ({
            name: p.nome || 'Praça',
            value: parseFloat(p.valor) || 0,
            road: p.rodovia || '',
            sentido: p.sentido || '',
            cobrancaUnica: p.cobrancaUnica || false,
          })),
          observacoes: parsed.observacoes || '',
          confianca: parsed.confianca || 'baixa',
          provider: 'gemini-ai',
        });
      }

      return res.json({ success: false, error: 'Não foi possível extrair dados da resposta da IA', raw: rawText.substring(0, 500) });
    } catch (e: any) {
      console.error('Erro Gemini pedágio:', e);
      return res.json({ success: false, error: `Erro ao consultar IA: ${e.message}` });
    }
  });

  // ═══════════════════════════════════════════════════════
  // ASAAS INTEGRATION ROUTES
  // ═══════════════════════════════════════════════════════

  app.get("/api/asaas/status", (_req: Request, res: Response) => {
    res.json({ configured: isAsaasConfigured() });
  });

  app.post("/api/asaas/create-charge", async (req: Request, res: Response) => {
    try {
      const { clientName, clientCpfCnpj, clientEmail, value, dueDate, description, invoiceNumber, issuerCompany, charges } = req.body;

      if (charges && Array.isArray(charges) && charges.length > 0) {
        if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
          return res.status(400).json({ error: 'Vencimento inválido' });
        }
        const validCharges = charges.filter((c: any) => {
          const cleanCnpj = String(c.cpfCnpj || '').replace(/\D/g, '');
          const val = parseFloat(c.value);
          return cleanCnpj.length >= 11 && !isNaN(val) && val > 0;
        });
        if (validCharges.length === 0) {
          return res.status(400).json({ error: 'Nenhuma subconta válida encontrada. Verifique CNPJ e valores.' });
        }

        const results: any[] = [];
        for (let i = 0; i < validCharges.length; i++) {
          const charge = validCharges[i];
          const cleanCnpj = String(charge.cpfCnpj).replace(/\D/g, '');

          const customer = await findOrCreateCustomer({
            name: charge.name || clientName || 'Cliente',
            cpfCnpj: cleanCnpj,
            email: charge.email || clientEmail || undefined,
            company: issuerCompany,
          });

          const externalRef = invoiceNumber ? `NF-${invoiceNumber}-S${i + 1}-${cleanCnpj.slice(-4)}` : `TMSEG-${Date.now()}-S${i + 1}-${cleanCnpj.slice(-4)}`;
          const descText = description || `Referente aos serviços de Intermediação de Escolta Armada e Fiscal de Rota — ${issuerCompany || 'Grupo TM SEG'}`;

          const payment = await createPayment({
            customerId: customer.id,
            value: parseFloat(charge.value),
            dueDate,
            description: descText,
            externalReference: externalRef,
            billingType: 'UNDEFINED',
            company: issuerCompany,
          });

          let pixData = null;
          let bankSlipData = null;
          try { pixData = await getPaymentPixQrCode(payment.id, issuerCompany); } catch (_) {}
          try { bankSlipData = await getPaymentBankSlip(payment.id, issuerCompany); } catch (_) {}

          console.log(`[Asaas] Cobrança split criada: ${payment.id} | ${charge.name || clientName} | CNPJ: ${cleanCnpj} | R$ ${charge.value} | Venc: ${dueDate}`);

          results.push({
            payment: {
              id: payment.id, status: payment.status, statusBr: mapAsaasStatus(payment.status),
              value: payment.value, dueDate: payment.dueDate,
              invoiceUrl: payment.invoiceUrl || null, bankSlipUrl: payment.bankSlipUrl || null,
              externalReference: externalRef,
            },
            pix: pixData ? { qrCodeBase64: pixData.encodedImage, copyPaste: pixData.payload } : null,
            bankSlip: bankSlipData ? { barCode: bankSlipData.barCode, digitableLine: bankSlipData.identificationField, nossoNumero: bankSlipData.nossoNumero } : null,
            customer: { id: customer.id, name: customer.name, cpfCnpj: cleanCnpj },
          });
        }
        return res.json({ success: true, split: true, charges: results, totalValue: results.reduce((s, r) => s + r.payment.value, 0) });
      }

      if (!clientCpfCnpj || !value || !dueDate) {
        return res.status(400).json({ error: 'CNPJ do cliente, valor e vencimento são obrigatórios' });
      }

      const customer = await findOrCreateCustomer({
        name: clientName || 'Cliente',
        cpfCnpj: clientCpfCnpj,
        email: clientEmail || undefined,
        company: issuerCompany,
      });

      const externalRef = invoiceNumber ? `NF-${invoiceNumber}` : `TMSEG-${Date.now()}`;
      const descText = description || `Referente aos serviços de Intermediação de Escolta Armada e Fiscal de Rota — ${issuerCompany || 'Grupo TM SEG'}`;

      const payment = await createPayment({
        customerId: customer.id,
        value: parseFloat(value),
        dueDate,
        description: descText,
        externalReference: externalRef,
        billingType: 'UNDEFINED',
        company: issuerCompany,
      });

      let pixData = null;
      let bankSlipData = null;
      try { pixData = await getPaymentPixQrCode(payment.id, issuerCompany); } catch (e) { console.log('[Asaas] PIX QR não disponível para esta cobrança'); }
      try { bankSlipData = await getPaymentBankSlip(payment.id, issuerCompany); } catch (e) { console.log('[Asaas] Boleto não disponível para esta cobrança'); }

      console.log(`[Asaas] Cobrança criada: ${payment.id} | ${clientName} | R$ ${value} | Venc: ${dueDate}`);

      res.json({
        success: true,
        payment: {
          id: payment.id,
          status: payment.status,
          statusBr: mapAsaasStatus(payment.status),
          value: payment.value,
          dueDate: payment.dueDate,
          invoiceUrl: payment.invoiceUrl || null,
          bankSlipUrl: payment.bankSlipUrl || null,
          externalReference: externalRef,
        },
        pix: pixData ? {
          qrCodeBase64: pixData.encodedImage,
          copyPaste: pixData.payload,
          expirationDate: pixData.expirationDate,
        } : null,
        bankSlip: bankSlipData ? {
          barCode: bankSlipData.barCode,
          digitableLine: bankSlipData.identificationField,
          nossoNumero: bankSlipData.nossoNumero,
        } : null,
        customer: { id: customer.id, name: customer.name },
      });
    } catch (err: any) {
      console.error('[Asaas] Erro ao criar cobrança:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/asaas/payment/:id", async (req: Request, res: Response) => {
    try {
      const company = req.query.company as string || undefined;
      const payment = await getPayment(req.params.id, company);
      let pixData = null;
      let bankSlipData = null;
      if (payment.status === 'PENDING' || payment.status === 'OVERDUE') {
        try { pixData = await getPaymentPixQrCode(payment.id, company); } catch (_) {}
        try { bankSlipData = await getPaymentBankSlip(payment.id, company); } catch (_) {}
      }
      res.json({
        payment: { ...payment, statusBr: mapAsaasStatus(payment.status) },
        pix: pixData ? { qrCodeBase64: pixData.encodedImage, copyPaste: pixData.payload } : null,
        bankSlip: bankSlipData ? { barCode: bankSlipData.barCode, digitableLine: bankSlipData.identificationField } : null,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/asaas/payments", async (req: Request, res: Response) => {
    try {
      const { status, externalReference, offset, limit, company } = req.query;
      const result = await listPayments({
        status: status as string || undefined,
        externalReference: externalReference as string || undefined,
        offset: parseInt(offset as string) || 0,
        limit: parseInt(limit as string) || 50,
        company: company as string || undefined,
      });
      const payments = result.data.map(p => ({ ...p, statusBr: mapAsaasStatus(p.status) }));
      res.json({ payments, totalCount: result.totalCount });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/asaas/sync-payment-status", async (req: Request, res: Response) => {
    try {
      const { paymentId, invoiceId, company } = req.body;
      if (!paymentId) return res.status(400).json({ error: 'paymentId obrigatório' });

      const payment = await getPayment(paymentId, company);
      const statusBr = mapAsaasStatus(payment.status);
      const isPaid = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(payment.status);

      if (invoiceId) {
        const { data: inv } = await supabase.from('financial_invoices').select('id, asaas_payment_id').eq('id', invoiceId).single();
        if (!inv || (inv.asaas_payment_id && inv.asaas_payment_id !== paymentId)) {
          return res.status(400).json({ error: 'Invoice não vinculada a este paymentId' });
        }
        const newStatus = isPaid ? 'PAGA' : payment.status === 'OVERDUE' ? 'VENCIDA' : 'EMITIDA';
        await supabase.from('financial_invoices').update({
          status: newStatus,
          asaas_status: payment.status,
        }).eq('id', invoiceId);

        if (isPaid) {
          const { data: inv } = await supabase.from('financial_invoices').select('number, client').eq('id', invoiceId).single();
          if (inv?.number) {
            await supabase.from('financial_transactions')
              .update({ status: 'PAID', paid_date: new Date().toISOString().split('T')[0] })
              .ilike('description', `%${inv.number}%`)
              .eq('status', 'PENDING');
            console.log(`[Asaas] Baixa automática: NF ${inv.number} — ${inv.client}`);
          }
        }
      }

      res.json({ status: payment.status, statusBr, isPaid, value: payment.value });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/asaas/payment/:id", async (req: Request, res: Response) => {
    try {
      const company = req.query.company as string || undefined;
      await deletePayment(req.params.id, company);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Webhook do Asaas para baixa automática
  app.post("/api/asaas/webhook", async (req: Request, res: Response) => {
    try {
      const { event, payment } = req.body;
      console.log(`[Asaas Webhook] Evento: ${event} | Payment: ${payment?.id}`);

      if (['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'].includes(event) && payment?.externalReference) {
        const nfNumber = payment.externalReference.replace('NF-', '').replace('TMSEG-', '');
        const { data: invoices } = await supabase.from('financial_invoices')
          .select('id, number, client')
          .or(`number.eq.${nfNumber},asaas_payment_id.eq.${payment.id}`);

        if (invoices && invoices.length > 0) {
          for (const inv of invoices) {
            await supabase.from('financial_invoices').update({
              status: 'PAGA',
              asaas_status: 'RECEIVED',
            }).eq('id', inv.id);

            await supabase.from('financial_transactions')
              .update({ status: 'PAID', paid_date: new Date().toISOString().split('T')[0] })
              .ilike('description', `%${inv.number}%`)
              .eq('status', 'PENDING');

            console.log(`[Asaas Webhook] Baixa automática: NF ${inv.number} — ${inv.client}`);
          }
        }
      }
      res.json({ received: true });
    } catch (err: any) {
      console.error('[Asaas Webhook] Erro:', err.message);
      res.json({ received: true, error: err.message });
    }
  });

  return httpServer;
}
