// Testes de isolamento da identidade DHL no link público de cadastro de fornecedor.
//
// O link /fornecedor/dhl atende TODOS os clientes, mas a identidade amarela
// (#FFCC00), o campo "Nº S.E." e as instruções técnicas de espelhamento por
// tecnologia são EXCLUSIVAS da DHL. Estes testes garantem que, com isDhl=false,
// nenhum conteúdo da DHL vaza para fornecedores de outros clientes.
//
// Rodar: npx tsx --test scripts/dhl-intake-isolation.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  transporter,
  sendDhlSupplierIntakeEmail,
  sendDhlIntakeSubmittedEmail,
  sendDhlIntakeReminderProviderEmail,
} from '../server/emailService';
import { isDhlMission } from '../server/dhlSupplierIntake';

// Intercepta transporter.sendMail para capturar o HTML sem disparar SMTP real.
type CapturedMail = { subject?: string; html?: string; [k: string]: any };
let lastMail: CapturedMail | null = null;
(transporter as any).sendMail = async (opts: CapturedMail) => {
  lastMail = opts;
  return { messageId: 'test', accepted: [opts.to] } as any;
};

const baseAgent = {
  nome: 'FULANO DE TAL', cpf: '111.111.111-11', rg: '1', orgao_emissor: 'SSP/SP',
  cnh: '1', cnh_categoria: 'AB', cnh_vencimento: '2030-01-01', cnv_numero: '1',
  cnv_validade: '2030-01-01', rua: 'Rua A', numero: '1', complemento: '', bairro: 'Centro',
  cidade: 'São Paulo', uf: 'SP', cep: '01000-000', celular: '(11) 90000-0000', admissao: '2024-01-01',
};
const baseVehicle = {
  placa: 'ABC1D23', renavam: '1', marca: 'VW', modelo: 'Gol', ano: '2024', cor: 'Preto',
  tecnologia: 'OMNILINK', id_rastreador: 'X', comunicacao: 'GPRS',
};

// Asserções compartilhadas: HTML não-DHL não pode conter nenhum marcador da DHL.
function assertNoDhlIdentity(html: string) {
  assert.ok(!html.includes('#FFCC00'), 'HTML não-DHL não pode conter a cor amarela #FFCC00');
  assert.ok(!html.includes('Nº S.E.'), 'HTML não-DHL não pode conter o campo "Nº S.E."');
  assert.ok(!html.includes('S.E. DHL'), 'HTML não-DHL não pode conter "S.E. DHL"');
  // Instruções técnicas por tecnologia (contas/IPs/portas da DHL) não podem vazar.
  assert.ok(!html.includes('131.255.103.146'), 'HTML não-DHL não pode conter o IP de espelhamento da DHL');
  assert.ok(!html.includes('DHL LOGISTICS (BRASIL)'), 'HTML não-DHL não pode conter a conta de espelhamento DHL');
  assert.ok(!html.includes('00.233.065/0001-87'), 'HTML não-DHL não pode conter o CNPJ da DHL');
}

test('sendDhlSupplierIntakeEmail com isDhl=false não vaza identidade DHL e usa instrução genérica', async () => {
  lastMail = null;
  await sendDhlSupplierIntakeEmail({
    to: 'fornecedor@exemplo.com', providerName: 'FORNECEDOR XPTO', osNumber: 'GTM-001',
    seNumber: 'SE-999', origin: 'A', destination: 'B', scheduledAt: '01/01/2026 10:00',
    link: 'https://app.exemplo.com/fornecedor/dhl?token=abc', isDhl: false,
  });
  assert.ok(lastMail?.html, 'e-mail deve ter sido capturado');
  const html = lastMail!.html!;
  assertNoDhlIdentity(html);
  // Usa a instrução genérica de espelhamento, não as instruções técnicas por tecnologia.
  assert.ok(
    html.includes('Realize o espelhamento do sinal de rastreamento conforme orientação do Operacional TM Seg'),
    'deve usar a instrução genérica de espelhamento',
  );
  // O assunto não pode expor a S.E. da DHL.
  assert.ok(!String(lastMail!.subject || '').includes('S.E.'), 'assunto não-DHL não deve citar S.E.');
});

test('sendDhlSupplierIntakeEmail com isDhl=true mantém identidade DHL (controle positivo)', async () => {
  lastMail = null;
  await sendDhlSupplierIntakeEmail({
    to: 'fornecedor@exemplo.com', providerName: 'FORNECEDOR XPTO', osNumber: 'GTM-001',
    seNumber: 'SE-999', origin: 'A', destination: 'B', scheduledAt: '01/01/2026 10:00',
    link: 'https://app.exemplo.com/fornecedor/dhl?token=abc', isDhl: true,
  });
  const html = lastMail!.html!;
  assert.ok(html.includes('#FFCC00'), 'e-mail DHL deve manter a cor amarela');
  assert.ok(html.includes('Nº S.E.'), 'e-mail DHL deve conter o campo Nº S.E.');
  assert.ok(html.includes('131.255.103.146'), 'e-mail DHL deve conter as instruções técnicas de espelhamento');
});

test('sendDhlIntakeSubmittedEmail com isDhl=false não vaza identidade DHL', async () => {
  lastMail = null;
  await sendDhlIntakeSubmittedEmail({
    to: 'operacional@exemplo.com', providerName: 'FORNECEDOR XPTO', osNumber: 'GTM-002',
    seNumber: 'SE-888', origin: 'A', destination: 'B', scheduledAt: '01/01/2026 10:00',
    agent1: baseAgent, agent2: baseAgent, vehicle: baseVehicle,
    mirrorProofUrl: null, mirrorProofFilename: null, isDhl: false,
  });
  const html = lastMail!.html!;
  assertNoDhlIdentity(html);
  assert.ok(!String(lastMail!.subject || '').includes('[DHL]'), 'assunto não-DHL não deve começar com [DHL]');
});

test('sendDhlIntakeReminderProviderEmail com isDhl=false não vaza identidade DHL', async () => {
  lastMail = null;
  await sendDhlIntakeReminderProviderEmail({
    to: 'fornecedor@exemplo.com', providerName: 'FORNECEDOR XPTO', osNumber: 'GTM-003',
    seNumber: 'SE-777', origin: 'A', destination: 'B', scheduledAt: '01/01/2026 10:00',
    expiresAt: '10/01/2026', link: 'https://app.exemplo.com/fornecedor/dhl?token=abc',
    firstOpenedAt: null, reason: 'expiry_approaching', isDhl: false,
  });
  const html = lastMail!.html!;
  assertNoDhlIdentity(html);
  assert.ok(!String(lastMail!.subject || '').includes('S.E.'), 'assunto não-DHL não deve citar S.E.');
});

test('isDhlMission classifica o cliente da OS corretamente (base do isDhl do GET público)', () => {
  // O GET /api/dhl/intake/public/:token retorna isDhl: isDhlMission(mission.client).
  assert.equal(isDhlMission('DHL SUPPLY CHAIN (BRAZIL) LTDA'), true);
  assert.equal(isDhlMission('dhl logistics (brasil) ltda'), true);
  assert.equal(isDhlMission('FSM TRANSPORTES LTDA'), false);
  assert.equal(isDhlMission('UNIKA LOGISTICA'), false);
  assert.equal(isDhlMission('CLIENTE QUALQUER'), false);
  assert.equal(isDhlMission(null), false);
  assert.equal(isDhlMission(undefined), false);
  assert.equal(isDhlMission(''), false);
});
