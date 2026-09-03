import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import {
  hasAdminOrDirectorApproval,
  isRestrictedPlinioUser,
} from '../lib/plinioMissionRestrictions';
import {
  parseEmailRecipients,
  rejectedRequestedRecipients,
} from '../lib/email/recipientList';

describe('Permissões financeiras do Plínio', () => {
  it('T01 identifica a conta homologada por ID, e-mail ou nome completo', () => {
    assert.equal(isRestrictedPlinioUser({ id: 9 }), true);
    assert.equal(isRestrictedPlinioUser({ email: ' PLINIO@GRUPOTMSEG.COM.BR ' }), true);
    assert.equal(isRestrictedPlinioUser({ name: 'Plínio Alves Prado dos Santos' }), true);
    assert.equal(isRestrictedPlinioUser({ name: 'Plinio Silva' }), false);
  });

  it('T02 libera atuação somente após Diretoria ou Administrador', () => {
    assert.equal(hasAdminOrDirectorApproval([{ role: 'controller', stage: 'controller' }]), false);
    assert.equal(hasAdminOrDirectorApproval([{ role: 'financeiro', stage: 'financeiro' }]), false);
    assert.equal(hasAdminOrDirectorApproval([{ role: 'administrador', stage: 'financeiro' }]), true);
    assert.equal(hasAdminOrDirectorApproval([{ role: 'diretoria', stage: 'diretoria' }]), true);
  });

  it('T03 bloqueia aprovação e pedágio cliente também no handler', () => {
    const source = fs.readFileSync('components/MissionFinancialModal.tsx', 'utf8');
    assert.match(source, /if \(isPlinio && approve\)/);
    assert.match(source, /disabled=\{isPlinio \|\| isUpdating/);
    assert.match(source, /readOnly=\{clientFinanceInputLocked\}/);
    assert.match(source, /readOnly=\{plinioProviderEditBlocked\}/);
    assert.match(source, /isPlinio && plinioHasAuthorizedApproval/);
  });

  it('T04 não classifica mais Plínio como Diretoria ou re-aprovador', () => {
    const source = fs.readFileSync('components/MissionFinancialModal.tsx', 'utf8');
    const approvalStatus = source.slice(
      source.indexOf('const currentApprovalStatus'),
      source.indexOf('const applyOfficialTableToDb'),
    );
    assert.doesNotMatch(approvalStatus, /uName\.includes\('plinio'\)/);
  });

  it('T05 exclui Plínio do gate operacional que grava pedágio do cliente', () => {
    const source = fs.readFileSync('components/UpdateMissionModal.tsx', 'utf8');
    assert.match(source, /isRestrictedPlinioUser\(currentUser\)/);
    assert.match(source, /const allowedFirstNames = \['barbara', 'simone'\]/);
    assert.match(source, /if \(isPlinio\) \{\s*showNotification\('Sem Permissão'/);
    assert.match(source, /kind === 'completed' && !mission\.billing_approved && !isPlinio/);
    assert.doesNotMatch(source, /name\.includes\('plinio'\) \|\| name\.includes\('plínio'\)/);
  });

  it('T06 restringe o UPDATE de Plínio aos campos do fornecedor', () => {
    const source = fs.readFileSync('components/MissionFinancialModal.tsx', 'utf8');
    const start = source.indexOf('const fullPayload = isPlinio');
    const end = source.indexOf('let result = await supabase', start);
    const payloadBlock = source.slice(start, end);

    assert.ok(start >= 0 && end > start);
    assert.match(payloadBlock, /cost_value:/);
    assert.match(payloadBlock, /toll_value_provider:/);
    assert.match(payloadBlock, /displacement_value_provider:/);
    assert.doesNotMatch(payloadBlock, /\n\s+toll_value:/);
    assert.doesNotMatch(payloadBlock, /\n\s+revenue_value:/);
    assert.doesNotMatch(payloadBlock, /\n\s+billing_approved:/);
    assert.match(source, /const providerSelectorDisabled = plinioProviderEditBlocked/);
  });
});

describe('Destinatários de medição, boleto e faturamento', () => {
  it('T07 normaliza a lista cadastrada da Transamazon sem perder Aparecida', () => {
    const recipients = parseEmailRecipients(
      'william.silva@transamazon.com.br; APARECIDA.BORGES@TRANSAMAZON.COM.BR,\n'
      + 'aparecida.borges@transamazon.com.br',
    );
    assert.deepEqual(recipients, [
      'william.silva@transamazon.com.br',
      'aparecida.borges@transamazon.com.br',
    ]);
  });

  it('T08 acusa destinatário solicitado que o SMTP não aceitou', () => {
    const requested = ['william.silva@transamazon.com.br', 'aparecida.borges@transamazon.com.br'];
    assert.deepEqual(
      rejectedRequestedRecipients(
        requested,
        ['william.silva@transamazon.com.br'],
        ['aparecida.borges@transamazon.com.br'],
      ),
      ['aparecida.borges@transamazon.com.br'],
    );
  });

  it('T09 cobrança usa e-mails de medição cadastrados como sugestão', () => {
    const source = fs.readFileSync('components/FinancialInvoiceControl.tsx', 'utf8');
    assert.match(source, /select\('medicao_email, email, operational_email'\)/);
    assert.match(source, /client\?\.medicao_email \|\| client\?\.email/);
    assert.match(source, /parseEmailRecipients\(typedRecipients\)/);
  });

  it('T10 APIs verificam os destinatários aceitos e rejeitados pelo SMTP', () => {
    const billing = fs.readFileSync('server/emailService.ts', 'utf8');
    const medicao = fs.readFileSync('lib/billing/sendMedicaoEmailServer.ts', 'utf8');
    const api = fs.readFileSync('api/billing-send-medicao.ts', 'utf8');
    assert.match(billing, /rejectedRequestedRecipients\(recipients/);
    assert.match(medicao, /rejectedRequestedRecipients\(recipients/);
    assert.match(api, /rejected: result\.rejected/);
  });
});
