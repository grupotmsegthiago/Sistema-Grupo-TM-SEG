import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  caminhoAnexoMedicaoValido,
  montarCaminhoAnexoMedicao,
} from '../lib/billing/medicaoAnexoStorage';

describe('caminho do anexo da medição', () => {
  it('aceita a pasta medicoes com nome simples', () => {
    assert.equal(caminhoAnexoMedicaoValido('medicoes/abc123/Boletim_VS.xlsx'), true);
    assert.equal(
      montarCaminhoAnexoMedicao('pasta-1', 'Boletim_VS.xlsx'),
      'medicoes/pasta-1/Boletim_VS.xlsx',
    );
  });

  it('recusa caminho fora da pasta e tentativa de subir diretório', () => {
    assert.equal(caminhoAnexoMedicaoValido('mission-evidence/segredo.pdf'), false);
    assert.equal(caminhoAnexoMedicaoValido('medicoes/../clients.pdf'), false);
    assert.equal(caminhoAnexoMedicaoValido('medicoes/abc/../../.env'), false);
    assert.equal(caminhoAnexoMedicaoValido(''), false);
  });
});

describe('envio da medição não coloca o arquivo no POST', () => {
  it('a tela manda o caminho e a API baixa o arquivo', () => {
    const tela = fs.readFileSync('components/ClientBillingReport.tsx', 'utf8');
    const api = fs.readFileSync('api/billing-send-medicao.ts', 'utf8');
    const trecho = tela.slice(tela.indexOf('const handleSendMedicaoToClient'), tela.indexOf('const handleExportDhlFaturamento'));
    assert.match(trecho, /subirAnexoMedicao/);
    assert.match(trecho, /storagePath/);
    assert.doesNotMatch(trecho, /contentBase64/);
    assert.match(api, /baixarAnexoMedicao/);
    assert.match(api, /storagePath/);
    assert.doesNotMatch(api, /contentBase64/);
  });
});
