import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import {
  buscarHistoricoPedagioDaOs,
  gravarOcorrenciaPedagioAprovado,
  linhasHistoricoPedagioDaOs,
  pedagioAlterado,
  senhaDoUsuarioConfere,
  textoOcorrenciaPedagioAprovado,
} from '../lib/toll/pedagioDaOs';

describe('Histórico de pedágio só desta OS', () => {
  it('ignora alteração que não é pedágio e lê cliente, fornecedor e confirmação', () => {
    const linhas = linhasHistoricoPedagioDaOs([
      {
        created_at: '2026-10-06T01:55:49.710Z',
        user_name: 'Giovanna Marsili',
        entity: 'MissionEditHistory',
        action_type: 'BILLING_EDIT',
        details: JSON.stringify({
          changes: [
            'Serviço Cliente: de R$ 1.000,00 para R$ 1.300,00',
            'Pedágio Fornecedor: de R$ 0,00 para R$ 38,40',
          ],
        }),
      },
      {
        created_at: '2026-10-06T01:57:53.752Z',
        user_name: 'Giovanna Marsili',
        entity: 'MissionTollConfirmation',
        action_type: 'TOLL_CONFIRMATION',
        details: JSON.stringify({ has_toll: true, value: 38.4, user: 'Giovanna Marsili' }),
      },
      {
        created_at: '2026-10-06T01:58:36.626Z',
        user_name: 'Giovanna Marsili',
        entity: 'MissionEditHistory',
        action_type: 'POST_APPROVAL_EDIT',
        details: JSON.stringify({
          changes: ['Pedágio Cliente: de R$ 0,00 para R$ 46,08'],
        }),
      },
    ]);
    assert.equal(linhas.length, 3);
    assert.match(linhas[0].texto, /Pedágio Fornecedor/);
    assert.match(linhas[1].texto, /38,40/);
    assert.match(linhas[2].texto, /Pedágio Cliente/);
    assert.equal(linhas.every((l) => l.quem === 'Giovanna Marsili'), true);
  });

  it('busca system_logs pelo id desta OS e não consulta missions', async () => {
    const tabelas: string[] = [];
    const filtros: string[] = [];
    const client = {
      from(tabela: string) {
        tabelas.push(tabela);
        return {
          select() {
            return {
              eq(col: string, val: string) {
                filtros.push(`${col}=${val}`);
                return {
                  in(colIn: string, vals: string[]) {
                    filtros.push(`${colIn}:${vals.join(',')}`);
                    return {
                      order() {
                        return {
                          async limit() {
                            return {
                              data: [{
                                created_at: '2026-10-06T01:55:49Z',
                                user_name: 'Giovanna Marsili',
                                entity: 'MissionEditHistory',
                                action_type: 'BILLING_EDIT',
                                details: { changes: ['Pedágio Fornecedor: de R$ 0,00 para R$ 38,40'] },
                              }],
                              error: null,
                            };
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    };
    const linhas = await buscarHistoricoPedagioDaOs(client as never, 'GTM-8418');
    assert.deepEqual(tabelas, ['system_logs']);
    assert.ok(filtros.includes('entity_id=GTM-8418'));
    assert.match(filtros.join(' '), /MissionEditHistory/);
    assert.match(filtros.join(' '), /MissionTollConfirmation/);
    assert.equal(linhas.length, 1);
    assert.equal(pedagioAlterado(0, 38.4), true);
    assert.equal(pedagioAlterado(38.4, 38.4), false);
  });

  it('grava ocorrência nesta OS com os dois pedágios e exige senha do usuário', async () => {
    const texto = textoOcorrenciaPedagioAprovado({
      quem: 'Giovanna Marsili',
      clienteDe: 0,
      clientePara: 46.08,
      fornecedorDe: 38.4,
      fornecedorPara: 40,
    });
    assert.match(texto, /depois da aprovação/);
    assert.match(texto, /Cliente: de R\$ 0,00 para R\$ 46,08/);
    assert.match(texto, /Fornecedor: de R\$ 38,40 para R\$ 40,00/);
    assert.doesNotMatch(texto, /GTM-8432/);

    const inserts: Array<{ tabela: string; linha: Record<string, unknown> }> = [];
    const client = {
      from(tabela: string) {
        const node: Record<string, unknown> = {};
        node.insert = (rows: Record<string, unknown>[]) => {
          inserts.push({ tabela, linha: rows[0] });
          return Promise.resolve({ error: null });
        };
        node.select = () => node;
        node.update = () => node;
        node.eq = () => node;
        node.ilike = () => node;
        node.is = () => Promise.resolve({ count: 2, error: null });
        node.maybeSingle = async () => ({ data: { id: 'u1' }, error: null });
        return node;
      },
    };
    const gravou = await gravarOcorrenciaPedagioAprovado(client as never, {
      missionId: 'GTM-8418',
      quem: 'Giovanna Marsili',
      clienteDe: 0,
      clientePara: 46.08,
      fornecedorDe: 38.4,
      fornecedorPara: 40,
    });
    assert.equal(gravou.ok, true);
    assert.equal(inserts[0].tabela, 'mission_occurrences');
    assert.equal(inserts[0].linha.mission_id, 'GTM-8418');
    assert.match(String(inserts[0].linha.description), /46,08/);
    assert.equal(inserts[1].tabela, 'system_logs');
    assert.equal(inserts[1].linha.entity, 'MissionOccurrence');
    assert.equal(inserts[1].linha.entity_id, 'GTM-8418');

    const senha = await senhaDoUsuarioConfere(client as never, { id: 'u1' }, 'segredo');
    assert.equal(senha, true);
    const vazia = await senhaDoUsuarioConfere(client as never, { id: 'u1' }, '  ');
    assert.equal(vazia, false);
  });

  it('a tela não lista outras OS e o aviso de conclusão é do perfil financeiro', () => {
    const dialog = fs.readFileSync('components/TollConfirmationDialog.tsx', 'utf8');
    const auditoria = fs.readFileSync('components/MissionFinancialModal.tsx', 'utf8');
    const finalizar = fs.readFileSync('components/UpdateMissionModal.tsx', 'utf8');
    assert.match(dialog, /buscarHistoricoPedagioDaOs/);
    assert.match(dialog, /Ver histórico desta OS/);
    assert.doesNotMatch(dialog, /\.eq\('origin'/);
    assert.doesNotMatch(dialog, /Ver histórico desta rota/);
    assert.match(auditoria, /gravarOcorrenciaPedagioAprovado/);
    assert.match(auditoria, /senhaDoUsuarioConfere/);
    assert.match(auditoria, /button-reeditar-pedagio/);
    assert.match(auditoria, /somenteHistorico/);
    assert.match(finalizar, /isFinanceProfileRole\(currentUser\?\.role\)/);
    assert.doesNotMatch(finalizar, /allowedFirstNames = \['barbara', 'simone'\]/);
    assert.match(finalizar, /import React/);
    assert.match(auditoria, /import React/);
    assert.match(dialog, /import React/);
  });
});
