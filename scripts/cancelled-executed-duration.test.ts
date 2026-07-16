import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateMissionFinancials } from '../lib/financialUtils';
import type { Mission } from '../types';

/**
 * GTM-6043: OS cancelada no dia seguinte (cancelStatusAt ~18h depois),
 * mas com início/fim reais de 44min e hodômetro 75km.
 * Não pode cobrar 16h de hora extra.
 */
describe('Cancelada executada — duração operacional', () => {
  const clientTables = [
    {
      id: 't1',
      client: 'CEVA LOGISTICS LTDA',
      operation_type: 'NÍVEL BRASIL - PRONTA RESPOSTA - 01 AGENTE',
      region: 'NÍVEL BRASIL',
      activation_fee: 649,
      franchise_km: 50,
      franchise_hours: 3,
      price_per_extra_km: 2.3,
      price_per_extra_hour: 113,
    },
  ];
  const providerTables = [
    {
      id: 'p1',
      provider: 'ATIVA SERVICOS DE SEGURANCA E RECUPERACAO VEICULAR LTDA',
      operation_type: 'NÍVEL BRASIL - PRONTA RESPOSTA - 01 AGENTE',
      region: 'NÍVEL BRASIL',
      activation_cost: 430,
      franchise_km: 50,
      franchise_hours: 3,
      cost_per_extra_km: 1.5,
      cost_per_extra_hour: 70,
    },
  ];

  function makeMission(overrides: Partial<Mission> = {}): Mission {
    return {
      id: 'GTM-6043',
      client: 'CEVA LOGISTICS LTDA',
      provider: 'ATIVA SERVICOS DE SEGURANCA E RECUPERACAO VEICULAR LTDA',
      status: 'Cancelada',
      origin: 'OSASCO, SP',
      destination: 'OSASCO, SP',
      start_km: 146848,
      end_km: 146923,
      start_time: '2026-06-28T02:08:00+00:00',
      end_time: '2026-06-28T02:52:00+00:00',
      mission_type: 'Caracterizada',
      toll_value: 11.2,
      ...overrides,
    } as Mission;
  }

  it('usa 44min (start→end) e zera hora extra mesmo com cancelStatusAt 18h depois', () => {
    const mission = makeMission({
      _cancelStatusAt: '2026-06-28T20:29:04.918032+00:00',
    } as any);
    const fin = calculateMissionFinancials(
      mission,
      clientTables as any,
      providerTables as any,
      { full_extra_hour_after_16_min: true } as any,
    );

    assert.ok(fin.durationHours < 1, `duração deveria ser ~0.73h, veio ${fin.durationHours}`);
    assert.equal(Math.round(fin.durationHours * 60), 44);
    assert.equal(fin.client.excessHours, 0);
    assert.equal(fin.client.extraHrVal, 0);
    assert.equal(fin.realTraveledKm, 75);
    assert.ok(fin.client.extraKmVal > 0, 'KM excedente deve permanecer');
  });

  it('sem hodômetro continua usando janela cancelStatusAt (não executada)', () => {
    const mission = makeMission({
      start_km: 0,
      end_km: 0,
      end_time: null as any,
      _cancelStatusAt: '2026-06-28T20:29:04.918032+00:00',
    } as any);
    const fin = calculateMissionFinancials(
      mission,
      clientTables as any,
      providerTables as any,
      { full_extra_hour_after_16_min: true } as any,
    );
    // Sem execução: pode zerar ou usar cancel window — não deve inventar 16h com KM
    assert.equal(fin.realTraveledKm, 0);
  });

  it('GTM-6001: com 0 KM mas start→end 3h30, prefere duração operacional a cancelStatusAt 4h10', () => {
    const mission = {
      id: 'GTM-6001',
      client: 'CEVA LOGISTICS LTDA',
      provider: 'TORRES VIGILANCIA PATRIMONIAL LTDA',
      status: 'Cancelada',
      origin: 'GUARUJA, SP',
      destination: 'GUARUJA, SP',
      start_km: 28138,
      end_km: 28138,
      start_time: '2026-06-26T04:00:00+00:00',
      end_time: '2026-06-26T07:30:46+00:00',
      mission_type: 'Caracterizada',
      _cancelStatusAt: '2026-06-26T08:10:24.320006+00:00',
    } as any;
    const client6001 = [{
      id: 't2',
      client: 'CEVA LOGISTICS LTDA',
      operation_type: 'AUDITOR - ESTADO SP RFI',
      region: 'SUDESTE',
      activation_fee: 660,
      franchise_km: 100,
      franchise_hours: 3,
      price_per_extra_km: 6.6,
      price_per_extra_hour: 160,
    }];
    const fin = calculateMissionFinancials(
      mission,
      client6001 as any,
      providerTables as any,
      { full_extra_hour_after_16_min: true } as any,
    );
    assert.equal(Math.round(fin.durationHours * 60), 210); // 3h30
    assert.ok(fin.durationHours < 4, `não deve usar 4.17h do cancel, veio ${fin.durationHours}`);
    // 0.5h real → regra CEVA >15min arredonda para 1h
    assert.equal(fin.client.excessHours, 1);
    assert.equal(fin.client.extraHrVal, 160);
  });
});
