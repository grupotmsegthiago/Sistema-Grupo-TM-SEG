import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildTradingDesk,
  createDraftInvestorProfile,
  type InvestmentPosition,
} from '../lib/investimentos';

describe('gestao investimento — mesa trading semi-manual', () => {
  it('sleeve 20% trading e alerta VENDER com rotação de COMPRAR', () => {
    const profile = createDraftInvestorProfile({
      capital_available: 100_000,
      trading_sleeve_pct: 20,
      broker_default: 'XP',
      risk_profile: 'agressivo',
    });
    const positions: InvestmentPosition[] = [
      {
        id: 'p1',
        instrument_name: 'Petrobras PN',
        instrument_code: 'PETR4',
        instrument_type: 'acao',
        quantity: 100,
        avg_price: 30,
        current_value: 3300,
        entry_date: '2026-08-01',
        broker: 'XP',
        taxation_notes: '',
        currency: 'BRL',
        is_active: true,
        sleeve: 'trading',
        last_mark_price: 33,
        last_mark_at: '2026-08-12T12:00:00.000Z',
        target_sell_pct: 3,
        stop_loss_pct: 2,
      },
    ];
    const desk = buildTradingDesk(profile, positions, []);
    assert.equal(desk.tradingSleevePct, 20);
    assert.equal(desk.tradingBudget, 20_000);
    assert.ok(desk.lastMarkAt);
    const sell = desk.top10.find((a) => a.side === 'VENDER' && a.ticker === 'PETR4');
    assert.ok(sell);
    assert.ok(sell!.rotateBuy?.ticker);
    assert.ok(desk.top10.some((a) => a.side === 'COMPRAR'));
  });

  it('API e UI expõem mark/trade e aba Mesa', async () => {
    const api = await readFile('lib/investimentos/gestaoInvestimentoApi.ts', 'utf8');
    const ui = await readFile('components/investimentos/GestaoInvestimento.tsx', 'utf8');
    const vercel = await readFile('vercel.json', 'utf8');
    const mig = await readFile('lib/investimentos/schemaMigrations.ts', 'utf8');
    assert.match(api, /op === 'mark'/);
    assert.match(api, /op === 'trade'/);
    assert.match(api, /rotated_buy_code/);
    assert.match(ui, /gestao-investimento-mesa/);
    assert.match(ui, /Mesa do dia/);
    assert.match(ui, /Registrar compra|Registrar venda/);
    assert.match(ui, /from 'react'/);
    assert.match(ui, /useState/);
    assert.match(vercel, /gestao-investimento-api\?op=mark/);
    assert.match(vercel, /gestao-investimento-api\?op=trade/);
    assert.match(mig, /GESTAO_INVESTIMENTO_MESA_SQL/);
  });
});
