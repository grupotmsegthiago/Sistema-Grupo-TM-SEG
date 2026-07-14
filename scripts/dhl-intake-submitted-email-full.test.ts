/**
 * Garante que o e-mail de "fornecedor concluiu preenchimento" (caminho Vercel)
 * lista TODOS os campos de escoltistas e veículo.
 *
 * Rodar: npx tsx --test scripts/dhl-intake-submitted-email-full.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDhlIntakeSubmittedEmailHtml } from '../lib/email/dhlIntakeEmails.ts';

test('buildDhlIntakeSubmittedEmailHtml inclui todos os campos de agentes e veículo', () => {
  const html = buildDhlIntakeSubmittedEmailHtml({
    providerName: 'MW',
    osNumber: 'GTM-6426',
    seNumber: '183565',
    origin: 'BETIM - MG',
    destination: 'São Paulo - SP',
    scheduledAt: '14/07/2026, 21:40:00',
    agent1: {
      nome: 'CESAR AUGUSTO',
      cpf: '00046619070',
      rg: '1234567',
      orgao_emissor: 'SSP/RS',
      cnh: '1548863315',
      cnh_categoria: 'AB',
      cnh_vencimento: '2028-01-01',
      cnv_numero: 'CNV-1',
      cnv_validade: '2027-01-01',
      rua: 'Rua A',
      numero: '10',
      complemento: 'Casa',
      bairro: 'Centro',
      cidade: 'Porto Alegre',
      uf: 'RS',
      cep: '90000-000',
      celular: '51 99993-3177',
      admissao: '2023-01-01',
    },
    agent2: {
      nome: 'Paulo André',
      cpf: '76472884072',
      rg: '7654321',
      orgaoEmissor: 'SSP/RS',
      cnh: '01664307114',
      cnhCategoria: 'B',
      cnhVencimento: '2029-01-01',
      cnvNumero: 'CNV-2',
      cnvValidade: '2028-01-01',
      rua: 'Rua B',
      numero: '20',
      bairro: 'Bairro',
      cidade: 'Canoas',
      uf: 'RS',
      cep: '92000-000',
      celular: '(51) 98345-3195',
      admissao: '2022-01-01',
    },
    vehicle: {
      placa: 'IYT1G31',
      renavam: '998877',
      marca: 'FIAT',
      modelo: 'TORO',
      ano: '2022',
      cor: 'BRANCA',
      tecnologia: 'OMNILINK',
      id_rastreador: 'ID-123',
      comunicacao: 'GPRS',
    },
    mirrorProofUrl: 'https://example.com/proof.png',
    mirrorProofFilename: 'proof.png',
    isDhl: true,
  });

  assert.ok(html.includes('CESAR AUGUSTO'));
  assert.ok(html.includes('Paulo André'));
  for (const label of [
    'RG', 'Órgão emissor / UF', 'Categoria CNH', 'Vencimento CNH',
    'CNV Número', 'Validade CNV', 'Rua', 'Bairro', 'Cidade', 'UF', 'CEP', 'Admissão',
    'Renavam', 'Marca', 'Modelo', 'Ano', 'Cor', 'ID Rastreador', 'Comunicação',
  ]) {
    assert.ok(html.includes(label), `deve incluir campo ${label}`);
  }
  assert.ok(html.includes('IYT1G31'));
  assert.ok(html.includes('OMNILINK'));
  assert.ok(html.includes('Porto Alegre'));
  assert.ok(html.includes('SSP/RS'));
  assert.ok(html.includes('Abrir comprovante'));
  assert.ok(!html.includes('Placa/CNH'), 'não deve usar rótulo antigo Placa/CNH');
});
