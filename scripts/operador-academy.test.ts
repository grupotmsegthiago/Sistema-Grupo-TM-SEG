import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  QUESTOES,
  corrigirProva,
  isPerfilOperador,
  modulosObrigatoriosConcluidos,
  operadorBloqueado,
} from '../lib/training/operadorAcademy';

describe('academia do operador', () => {
  it('tem 20 questões e seis módulos obrigatórios', () => {
    assert.equal(QUESTOES.length, 20);
    assert.equal(modulosObrigatoriosConcluidos(['entrar', 'menu', 'painel-os', 'abrir-os', 'controle-diario']), false);
    assert.equal(
      modulosObrigatoriosConcluidos(['entrar', 'menu', 'painel-os', 'abrir-os', 'controle-diario', 'rede-mapa']),
      true,
    );
  });

  it('passa com mais de 15 acertos', () => {
    const todas = QUESTOES.map((q) => q.correta);
    assert.equal(corrigirProva(todas).passou, true);
    assert.equal(corrigirProva(todas).acertos, 20);

    const quinze = todas.map((correta, index) => (index < 5 ? correta + 1 : correta));
    assert.equal(corrigirProva(quinze).acertos, 15);
    assert.equal(corrigirProva(quinze).passou, false);

    const dezesseis = todas.map((correta, index) => (index < 4 ? null : correta));
    assert.equal(corrigirProva(dezesseis).acertos, 16);
    assert.equal(corrigirProva(dezesseis).passou, true);
  });

  it('não trava quem já trabalha nem outro perfil', () => {
    assert.equal(operadorBloqueado({ role: 'Operador', trainingRequired: false }), false);
    assert.equal(operadorBloqueado({ role: 'Operador', trainingRequired: true, trainingPassedAt: '2026-10-01' }), false);
    assert.equal(operadorBloqueado({ role: 'Avançado', trainingRequired: true }), false);
    assert.equal(operadorBloqueado({ role: 'Diretoria', trainingRequired: true }), false);
    assert.equal(isPerfilOperador('OPERADOR'), true);
  });

  it('trava só o Operador novo sem aprovação', () => {
    assert.equal(operadorBloqueado({ role: 'Operador', trainingRequired: true, trainingPassedAt: null }), true);
  });
});
