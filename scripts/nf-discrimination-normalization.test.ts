import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ASAAS_SERVICE_DESCRIPTION_MAX_LENGTH,
  normalizeAsaasNfDiscrimination,
  truncateAsaasServiceDescription,
} from '../lib/nfDiscrimination.ts';

function combined(result: ReturnType<typeof normalizeAsaasNfDiscrimination>): string {
  return [result.serviceDescription, result.observations].filter(Boolean).join('|');
}

function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

describe('Hotfix NFS-e — discriminação Asaas', () => {
  it('T01 — descrição simples não muda conteúdo válido', () => {
    const description = 'Serviços de intermediação de escolta armada';
    assert.deepEqual(normalizeAsaasNfDiscrimination({ serviceDescription: description }), {
      serviceDescription: description,
    });
  });

  it('T02 — remove descrição duplicada do início de observations', () => {
    const description = 'CONTRATAÇÃO E INTERMEDIAÇÃO DE CONTRATOS';
    const result = normalizeAsaasNfDiscrimination({
      serviceDescription: description,
      observations: description,
    });
    assert.equal(occurrences(combined(result), description), 1);
    assert.equal(result.observations, undefined);
  });

  it('T03 — preserva período, rastreio e observações adicionais', () => {
    const description = 'CONTRATAÇÃO E INTERMEDIAÇÃO DE CONTRATOS';
    const result = normalizeAsaasNfDiscrimination({
      serviceDescription: description,
      observations:
        `${description} - Referente ao mês de Agosto/2026\n` +
        'Ref. rastreio: TMSEG-MASCARADO\nObservação necessária',
    });
    assert.equal(
      result.serviceDescription,
      `${description}|Referente ao mês de Agosto/2026|` +
        'Ref. rastreio: TMSEG-MASCARADO|Observação necessária',
    );
    assert.equal(result.observations, undefined);
  });

  it('T04 — consolida tudo em serviceDescription e impede CR/LF inserido pelo Asaas', () => {
    const result = normalizeAsaasNfDiscrimination({
      serviceDescription: 'Linha 1\r\nLinha 2',
      observations: 'Complemento 1\rComplemento 2\nComplemento 3',
    });
    assert.equal(
      result.serviceDescription,
      'Linha 1|Linha 2|Complemento 1|Complemento 2|Complemento 3',
    );
    assert.equal(result.observations, undefined);
    assert.doesNotMatch(combined(result), /[\r\n]/);
  });

  it('T05 — preserva acentos UTF-8', () => {
    const text = 'Contratação, intermediação e serviços de gestão';
    const result = normalizeAsaasNfDiscrimination({ serviceDescription: text });
    assert.equal(result.serviceDescription, text);
  });

  it('T06 — preserva reservados para escape XML pelo Asaas sem pré-escape', () => {
    const text = 'Consultoria A & B <escopo> "mensal"';
    const result = normalizeAsaasNfDiscrimination({ serviceDescription: text });
    assert.equal(result.serviceDescription, text);
    assert.equal(JSON.parse(JSON.stringify(result)).serviceDescription, text);
    assert.doesNotMatch(result.serviceDescription, /&amp;|&lt;|&gt;/);
    assert.throws(
      () => normalizeAsaasNfDiscrimination({ serviceDescription: `Inválido\u0001` }),
      /incompatível com XML/,
    );
  });

  it('T07 — aceita o limite Asaas e corta o excesso em 250 sem bloquear', () => {
    const description = 'D'.repeat(100);
    const observations = 'O'.repeat(ASAAS_SERVICE_DESCRIPTION_MAX_LENGTH - 101);
    const result = normalizeAsaasNfDiscrimination({
      serviceDescription: description,
      observations,
    });
    assert.equal(result.serviceDescription.length, ASAAS_SERVICE_DESCRIPTION_MAX_LENGTH);

    const overflowCombined = normalizeAsaasNfDiscrimination({
      serviceDescription: description,
      observations: `${observations}X`,
    });
    assert.ok(overflowCombined.serviceDescription.length <= ASAAS_SERVICE_DESCRIPTION_MAX_LENGTH);
    assert.match(overflowCombined.serviceDescription, /^D{100}/);

    const overflowSingle = normalizeAsaasNfDiscrimination({
      serviceDescription: 'D'.repeat(ASAAS_SERVICE_DESCRIPTION_MAX_LENGTH + 1),
    });
    assert.equal(overflowSingle.serviceDescription.length, ASAAS_SERVICE_DESCRIPTION_MAX_LENGTH);
    assert.equal(overflowSingle.serviceDescription, 'D'.repeat(ASAAS_SERVICE_DESCRIPTION_MAX_LENGTH));
    assert.equal(
      truncateAsaasServiceDescription('A'.repeat(300)).length,
      ASAAS_SERVICE_DESCRIPTION_MAX_LENGTH,
    );
  });

  it('T08 — código municipal 07930 permanece exatamente igual', () => {
    const service = fs.readFileSync('server/asaasService.ts', 'utf8');
    assert.match(service, /municipalServiceCode:\s*'07930'/);
    assert.match(service, /body\.municipalServiceCode = AMAZON_NF_DEFAULTS\.municipalServiceCode/);
    assert.doesNotMatch(
      fs.readFileSync('lib/nfDiscrimination.ts', 'utf8'),
      /municipalServiceCode/,
    );
  });

  it('T09 — payload da cobrança/boleto continua fora da normalização fiscal', () => {
    const charge = fs.readFileSync('lib/asaasCreateChargeCore.ts', 'utf8');
    assert.match(charge, /createPayment\(\{[\s\S]*?billingType:\s*'UNDEFINED'/);
    assert.match(charge, /description:\s*noBoleto[\s\S]*?:\s*descText/);
    assert.doesNotMatch(charge, /normalizeAsaasNfDiscrimination/);
  });

  it('T10 — primeira emissão e retry convergem em scheduleInvoice normalizado', () => {
    const service = fs.readFileSync('server/asaasService.ts', 'utf8');
    const worker = fs.readFileSync('server/nfRetryWorker.ts', 'utf8');
    assert.match(service, /export async function scheduleInvoice/);
    assert.match(service, /normalizeAsaasNfDiscrimination\(\{/);
    assert.match(service, /asaasFetch\('\/invoices'/);
    assert.match(worker, /const scheduleOpts = \{/);
    assert.match(worker, /scheduleInvoice\(scheduleOpts\)/);
  });

  it('T11 — fixture mascarada real não repete a descrição principal', () => {
    const description =
      'CONTRATAÇÃO E INTERMEDIAÇÃO DE CONTRATOS E AGENCIAMENTO DE VENDAS';
    const before = {
      serviceDescription: description,
      observations:
        `${description} - Referente ao Mês Completo de Agosto/2026\r\n` +
        'Ref. rastreio: TMSEG-MASCARADO\r\n' +
        'CNAE/Serviço municipal: 07930 — Monitoramento e rastreamento',
    };
    const after = normalizeAsaasNfDiscrimination(before);
    assert.equal(occurrences(combined(after), description), 1);
    assert.equal(
      after.serviceDescription,
      `${description}|Referente ao Mês Completo de Agosto/2026|` +
        'Ref. rastreio: TMSEG-MASCARADO',
    );
    assert.equal(after.observations, undefined);
    assert.doesNotMatch(after.serviceDescription, /CNAE\/Serviço municipal|[\r\n\u2013\u2014]/);
  });

  it('T12 — payload real pós-rejeição cabe em 250 e não permite separador Asaas', () => {
    const result = normalizeAsaasNfDiscrimination({
      serviceDescription:
        'CONTRATAÇÃO E INTERMEDIAÇÃO DE CONTRATOS E AGENCIAMENTO DE VENDAS - Referente ao 2ª Quinzena de Agosto/2026',
      observations:
        'Ref. rastreio: TMSEG-20260902-172347-JP4T|' +
        'CNAE/Serviço municipal: 07930 — 07930 - Monitoramento e rastreamento a distância de veículos, cargas, pessoas e semoventes',
    });

    assert.deepEqual(result, {
      serviceDescription:
        'CONTRATAÇÃO E INTERMEDIAÇÃO DE CONTRATOS E AGENCIAMENTO DE VENDAS - Referente ao 2ª Quinzena de Agosto/2026|' +
        'Ref. rastreio: TMSEG-20260902-172347-JP4T',
    });
    assert.ok(result.serviceDescription.length <= ASAAS_SERVICE_DESCRIPTION_MAX_LENGTH);
  });

  it('T13 — texto longo com período e rastreio cabe em 250 e preserva o núcleo', () => {
    const description =
      'CONTRATAÇÃO E INTERMEDIAÇÃO DE CONTRATOS E AGENCIAMENTO DE VENDAS - Referente ao 2ª Quinzena de Agosto/2026';
    const result = normalizeAsaasNfDiscrimination({
      serviceDescription: description,
      observations:
        'Ref. rastreio: TMSEG-20260908-163400-ILG1|' +
        'Observação complementar do faturamento ILG LOGISTICA E TRANSPORTE LTDA referente à operação de escolta|' +
        'CNAE/Serviço municipal: 07930 — Monitoramento e rastreamento',
    });
    assert.ok(result.serviceDescription.length <= ASAAS_SERVICE_DESCRIPTION_MAX_LENGTH);
    assert.match(result.serviceDescription, /^CONTRATAÇÃO E INTERMEDIAÇÃO/);
    assert.doesNotMatch(result.serviceDescription, /CNAE\/Serviço municipal/);
    assert.doesNotMatch(
      fs.readFileSync('lib/nfDiscrimination.ts', 'utf8'),
      /bloqueada para evitar truncamento fiscal/,
    );
  });
});
