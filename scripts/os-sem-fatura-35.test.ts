import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  filtrarAlertaOs35,
  montarAlertaOsSemFatura35,
  somarDiasCivis,
  statusOsConcluida,
} from '../lib/comissao/osSemFatura35.ts';

const HOJE = '2026-10-28';

test('o corte de 35 dias é civil e estrito', () => {
  assert.equal(somarDiasCivis(HOJE, -35), '2026-09-23');
  assert.equal(statusOsConcluida('Concluída'), true);
  assert.equal(statusOsConcluida('concluída'), true);
  assert.equal(statusOsConcluida('Faturada'), true);
  assert.equal(statusOsConcluida('em_andamento'), false);
});

test('entra OS concluída sem fatura anterior ao corte; fatura, prazo exato e status aberto ficam de fora', () => {
  const alerta = montarAlertaOsSemFatura35({
    hoje: HOJE,
    tm: [
      { id: 'GTM-1', cliente: 'CEVA', comercialId: 'a', status: 'Concluída', dataConclusao: '2026-09-22', faturada: false, valor: 100 },
      { id: 'GTM-2', cliente: 'CEVA', comercialId: 'a', status: 'Concluída', dataConclusao: '2026-09-23', faturada: false, valor: 50 },
      { id: 'GTM-3', cliente: 'CEVA', comercialId: 'a', status: 'Concluída', dataConclusao: '2026-08-01', faturada: true, valor: 80 },
      { id: 'GTM-4', cliente: 'CEVA', comercialId: 'a', status: 'Em andamento', dataConclusao: '2026-01-01', faturada: false, valor: 10 },
      { id: 'GTM-5', cliente: 'CEVA', comercialId: 'b', status: 'Concluída', dataConclusao: null, faturada: false, valor: 10 },
    ],
    torres: [
      { id: '90', numero: 'OS-90', cliente: 'IBL', comercialId: 'a', status: 'concluída', dataConclusao: '2026-07-01', faturada: false, valor: 40 },
    ],
  });
  assert.equal(alerta.estado, 'ENCONTRADO');
  assert.equal(alerta.limite, '2026-09-23');
  assert.deepEqual(alerta.itens.map((os) => os.id), ['90', 'GTM-1']);
  assert.equal(alerta.itens[0].origem, 'TORRES');
  assert.equal(alerta.quantidade, 2);
  assert.equal(alerta.valor, 140);
  assert.equal(alerta.valorEstado, 'ENCONTRADO');
  assert.equal(alerta.semData.length, 1);
  assert.equal(alerta.torres, 'ENCONTRADO');
});

test('valor ausente não vira zero e Torres não lida não vira universo', () => {
  const semValor = montarAlertaOsSemFatura35({
    hoje: HOJE,
    tm: [{ id: 'GTM-9', status: 'Concluída', dataConclusao: '2026-01-02', faturada: false, valor: null }],
    torres: [],
  });
  assert.equal(semValor.valor, null);
  assert.equal(semValor.valorEstado, 'NÃO VALIDADO');
  const semTorres = montarAlertaOsSemFatura35({
    hoje: HOJE,
    tm: [],
    torres: null,
    torresEstado: 'NÃO VALIDADO',
  });
  assert.equal(semTorres.estado, 'CONSULTA INCOMPLETA');
  assert.equal(semTorres.quantidade, 0);
});

test('filtro do comercial não mistura a outra carteira', () => {
  const alerta = montarAlertaOsSemFatura35({
    hoje: HOJE,
    tm: [
      { id: 'GTM-1', comercialId: 'abc', status: 'Concluída', dataConclusao: '2026-01-01', faturada: false, valor: 10 },
      { id: 'GTM-2', comercialId: 'xyz', status: 'Concluída', dataConclusao: '2026-01-01', faturada: false, valor: 20 },
    ],
    torres: [],
  });
  const so = filtrarAlertaOs35(alerta, 'abc');
  assert.deepEqual(so?.itens.map((os) => os.id), ['GTM-1']);
  assert.equal(filtrarAlertaOs35(alerta, '')?.quantidade, 0);
});

test('a tela de comissões mostra o alerta no quadro que já existe', () => {
  const tela = readFileSync('components/ComissoesComerciaisPage.tsx', 'utf8');
  assert.match(tela, /data-testid="alerta-os-35"/);
  assert.match(tela, /alertaOs35/);
  assert.match(readFileSync('lib/comissao/comissaoQuadroApi.ts', 'utf8'), /carregarAlertaOsSemFatura35/);
});
