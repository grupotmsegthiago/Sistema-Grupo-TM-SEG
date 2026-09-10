import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildStaticMapUrl,
  isStopUpdate,
  montarPontosRota,
  distanciaTotalPontos,
} from '../lib/missionAnalyticalReport/routePoints';
import { buildMissionAnalyticalReportHtml } from '../lib/missionAnalyticalReport/buildAnalyticalReportHtml';
import type { MissionAnalyticalReportData } from '../lib/missionAnalyticalReport/collectAnalyticalReport';

describe('relatório analítico da OS — rota', () => {
  it('marca paradas e calcula trechos entre origem, GPS e destino', () => {
    assert.equal(isStopUpdate('Parada para almoço no posto'), true);
    assert.equal(isStopUpdate('CHEGADA NO DESTINO'), false);
    const points = montarPontosRota({
      origin: 'Foxconn Jundiaí',
      destination: 'Viracopos',
      originCoord: { lat: -23.2, lng: -46.9 },
      destCoord: { lat: -23.0, lng: -47.1 },
      logs: [
        {
          description: 'Em viagem pela Anhanguera',
          map_link: 'https://www.google.com/maps?q=-23.15,-46.95',
          created_at: '2026-09-10T12:00:00Z',
        },
        {
          description: 'Parada no posto Shell',
          map_link: 'https://www.google.com/maps?q=-23.10,-47.00',
          created_at: '2026-09-10T13:00:00Z',
        },
      ],
    });
    assert.equal(points[0].kind, 'origem');
    assert.equal(points.some((p) => p.kind === 'parada'), true);
    assert.equal(points[points.length - 1].kind, 'destino');
    assert.ok((points[1].stretchKm || 0) > 0);
    assert.ok(distanciaTotalPontos(points) > 0);
    const map = buildStaticMapUrl(points, 'TEST_KEY');
    assert.match(String(map), /staticmap/);
    assert.match(String(map), /label:A/);
    assert.match(String(map), /label:B/);
  });
});

describe('relatório analítico da OS — HTML TM SEG', () => {
  it('gera layout com logo, OS, origem, destino e omite financeiro quando pedido', () => {
    const data: MissionAnalyticalReportData = {
      missionId: 'GTM-9999',
      status: 'Concluída',
      client: 'CEVA LOGISTICS',
      clientCnpj: '00.000.000/0001-00',
      provider: 'FORNECEDOR X',
      origin: 'Campinas/SP',
      destination: 'Jundiaí/SP',
      missionType: 'Caracterizada',
      createdAt: '2026-09-10T10:00:00Z',
      startTime: '2026-09-10T11:00:00Z',
      endTime: '2026-09-10T15:00:00Z',
      startKm: 1000,
      endKm: 1120,
      kmRodado: 120,
      totalDistance: 118,
      durationLabel: '4h 00min',
      driverName: 'JOÃO',
      driverPhone: '19999999999',
      driverName2: null,
      driverPhone2: null,
      vehiclePlate: 'ABC1D23',
      vehicleModel: 'SW4',
      vehicleType: 'SUV',
      clientVehicle: 'XYZ-1234',
      clientVehicle2: null,
      agents: [{ role: 'Agente 01', name: 'AGENTE TESTE', cpf: '000', cnh: '1', cnv: '2', phone: '11' }],
      currentLocation: 'Jundiaí',
      seNumber: null,
      smNumber: null,
      invoiceNumber: 'NF-1',
      billingApproved: true,
      revenueStored: 1000,
      costStored: 400,
      tollStored: 50,
      logs: [],
      photos: [],
      points: [
        {
          kind: 'origem',
          label: 'Ponto A — Origem',
          mapLabel: 'A',
          lat: -23.2,
          lng: -46.9,
          at: null,
          description: 'Campinas/SP',
          mapLink: null,
          stretchKm: null,
        },
        {
          kind: 'parada',
          label: 'Parada 1',
          mapLabel: 'P',
          lat: -23.1,
          lng: -47.0,
          at: '2026-09-10T13:00:00Z',
          description: 'Parada no posto',
          mapLink: null,
          stretchKm: 12.4,
        },
        {
          kind: 'destino',
          label: 'Ponto B — Destino',
          mapLabel: 'B',
          lat: -23.0,
          lng: -47.1,
          at: null,
          description: 'Jundiaí/SP',
          mapLink: null,
          stretchKm: 15.2,
        },
      ],
      mapUrl: null,
      directionsLink: null,
      routeKmEstimado: 27.6,
      generatedAt: '2026-09-10T16:00:00Z',
      history: [
        {
          id: 1,
          mission_id: 'GTM-9999',
          changed_at: '2026-09-10T12:00:00Z',
          changed_by: 'AUDITOR',
          field_name: 'status',
          old_value: 'Em Viagem',
          new_value: 'Concluída',
        },
        {
          id: 2,
          mission_id: 'GTM-9999',
          changed_at: '2026-09-10T12:01:00Z',
          changed_by: 'FINANCEIRO',
          field_name: 'revenue_value',
          old_value: '900',
          new_value: '1000',
        },
      ],
    };
    const html = buildMissionAnalyticalReportHtml(data);
    assert.match(html, /GTM-9999/);
    assert.match(html, /sistema\.grupotmseg\.com\.br\/logo\.png/);
    assert.match(html, /Ponto A/);
    assert.match(html, /Ponto B/);
    assert.match(html, /Campinas/);
    assert.match(html, /PARADA/);
    assert.match(html, /Soma dos trechos GPS/);
    assert.match(html, /12\.4 km/);
    assert.match(html, /Receita gravada/);
    assert.match(html, /revenue_value/);
    const hidden = buildMissionAnalyticalReportHtml(data, { omitFinancials: true });
    assert.doesNotMatch(hidden, /Receita gravada/);
    assert.doesNotMatch(hidden, /revenue_value/);
    assert.match(hidden, /status/);
  });
});

describe('relatório analítico da OS — Auditoria de Faturamento', () => {
  it('expõe botão na auditoria e mantém import React', () => {
    const modal = fs.readFileSync('components/MissionFinancialModal.tsx', 'utf8');
    const page = fs.readFileSync('components/MissionAnalyticalReportModal.tsx', 'utf8');
    assert.match(modal, /from 'react'/);
    assert.match(modal, /import React,/);
    assert.match(modal, /button-analytical-report-audit/);
    assert.match(modal, /button-analytical-report-banner/);
    assert.match(modal, /button-analytical-report-footer/);
    assert.match(modal, /MissionAnalyticalReportModal/);
    assert.match(page, /from 'react'/);
    assert.match(page, /modal-analytical-os-report/);
    assert.match(page, /button-print-analytical-os-report/);
    assert.doesNotMatch(modal, /from 'lucide-react'[\s\S]*\bRoute\b/);
  });
});
