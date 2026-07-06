/** Reexporta funções SMTP usadas pelos handlers Vercel (server/emailService). */
export {
  sendMissionEmailToClient,
  sendMissionEmailToProvider,
  sendDhlSupplierIntakeEmail,
  sendDhlIntakeSubmittedEmail,
} from '../../server/emailService.js';
