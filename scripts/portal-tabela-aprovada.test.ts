import assert from 'node:assert/strict';
import test from 'node:test';
import { PORTAL_CEVA } from '../lib/cevaPortal/portalServidor.ts';
import { registrarSolicitacaoPortal } from '../lib/portalCliente/registrarOs.ts';
import type { PedidoPortal } from '../lib/portalCliente/pedido.ts';

const pedido: PedidoPortal = {
  dataInicio: '2026-10-28T11:30:00.000Z',
  dataFim: null,
  pedido: 'Escolta Caracterizada',
  agentes: null,
  servico: 'Escolta Caracterizada',
  missionType: 'Caracterizada',
  origem: 'GUARULHOS - SP',
  destino: 'CAMPINAS - SP',
  operacao: 'ENTREGA',
  identificacao: 'CEVA-1',
  motorista: 'JOAO',
  placa: 'ABC1D23',
  telefone: '11999999999',
  solicitante: 'PRISCILLA',
  quemAutorizou: 'PRISCILLA',
  atendimentoPgr: 'SIM',
  contrato: 'GM',
  tsp: 'XANDAO',
  franquiaHora: null,
  franquiaKm: null,
  nomeLinhaVigencia: null,
  nomeRotaVigencia: null,
};

test('o portal só sugere tabela entre OS aprovadas da rota', async () => {
  const filtros: string[] = [];
  const encadeia = () => {
    const cadeia: any = {
      select: () => cadeia,
      eq: (coluna: string, valor: unknown) => {
        filtros.push(`${coluna}=${String(valor)}`);
        return cadeia;
      },
      ilike: () => cadeia,
      not: () => cadeia,
      order: () => cadeia,
      limit: () => cadeia,
      like: () => cadeia,
      range: () => cadeia,
      insert: async () => ({ error: null }),
      upsert: async () => ({ error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      then: (resolve: (valor: unknown) => unknown) => resolve({ data: [], error: null }),
    };
    return cadeia;
  };
  const sb = { from: () => encadeia() };
  const criado = await registrarSolicitacaoPortal(
    sb as any,
    PORTAL_CEVA,
    pedido,
    { id: 'user-1', email: 'priscilla@ceva.com' },
    null,
    null,
    { enviarEmail: false, clienteOficial: 'CEVA LOGISTICS LTDA' },
  );
  assert.match(criado.os, /^GTM-/);
  assert.equal(filtros.includes('billing_approved=true'), true);
});
