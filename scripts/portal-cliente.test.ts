import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { slugDeCaminho, slugDeNome, slugPublico } from '../lib/portalCliente/slug';
import { corpoTrazPreco, emailsDaSolicitacao, quantidadeDoPedido, validarPedidoPortal } from '../lib/portalCliente/pedido';
import { decidirNomeCatalogo, ehCampoLista } from '../lib/cevaPortal/camposCliente';
import { dataHoraBrasil, mascaraDataHora, parseBrazilDateTime } from '../lib/cevaPortal/rules';
import { lerMarcaDoHtml, urlDeSitePublico } from '../lib/portalCliente/marcaSite';
import { colunaAusenteNoBanco, erroMencionaColunaPortal, mensagemDeErro, portalDaFicha, PORTAL_CEVA, PORTAL_IBL, semColunasDePortal } from '../lib/cevaPortal/portalServidor';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('slug sai do nome fantasia e não ocupa ceva, ibl ou dhl', () => {
  assert.equal(slugDeNome('Ceslog Transportes Ltda'), 'ceslog');
  assert.equal(slugDeNome('CEVA LOGISTICS LTDA'), 'ceva-portal');
  assert.equal(slugDeNome('DHL'), 'dhl-portal');
  assert.equal(slugPublico('vs-transportes'), 'vs-transportes');
  assert.equal(slugDeCaminho('/ceslog'), 'ceslog');
  assert.equal(slugDeCaminho('/ceva'), null);
  assert.equal(slugDeCaminho('/ibl'), null);
  assert.equal(slugDeCaminho('/dhl'), null);
  assert.equal(slugDeCaminho('/fornecedor/dhl'), null);
});

test('coluna de portal ausente não esconde a mensagem e não apaga o resto do cliente', () => {
  const erro = { code: 'PGRST204', message: "Could not find the 'portal_ativo' column of 'clients' in the schema cache" };
  assert.equal(colunaAusenteNoBanco(erro), true);
  assert.equal(erroMencionaColunaPortal(erro), true);
  assert.equal(mensagemDeErro(erro), erro.message);
  assert.equal(colunaAusenteNoBanco({ code: '42703', message: 'column portal_site does not exist' }), true);
  assert.equal(colunaAusenteNoBanco({ code: '23505', message: 'duplicate' }), false);
  const limpo = semColunasDePortal({
    name: 'IBL',
    operational_email: 'a@b.com',
    portal_site: 'https://ibllogistica.com.br/',
    portal_logo_url: 'https://ibllogistica.com.br/favicon.ico',
    portal_cor: '#f7941e',
  });
  assert.equal(limpo.name, 'IBL');
  assert.equal(limpo.operational_email, 'a@b.com');
  assert.equal('portal_site' in limpo, false);
  assert.equal('portal_logo_url' in limpo, false);
});

test('CEVA e IBL ficam na página fixa; cliente novo usa o slug', () => {
  assert.equal(portalDaFicha({ id: 1, name: 'CEVA LOGISTICS LTDA', portal_ativo: true, portal_slug: 'ceva' })?.caminho, '/ceva');
  assert.equal(portalDaFicha({ id: 2, name: 'INTERMODAL BRASIL LOGISTICA S.A.' })?.tabelas.usuarios, PORTAL_IBL.tabelas.usuarios);
  const novo = portalDaFicha({ id: 9, name: 'CESLOG LTDA', trading_name: 'CESLOG', portal_ativo: true, portal_slug: 'ceslog' });
  assert.equal(novo?.caminho, '/ceslog');
  assert.equal(novo?.tabelas.usuarios, 'portal_cliente_usuarios');
  assert.notEqual(novo?.tabelas.usuarios, PORTAL_CEVA.tabelas.usuarios);
  assert.equal(portalDaFicha({ id: 3, name: 'OUTRO', portal_ativo: false, portal_slug: 'outro' }), null);
});

test('pedido do portal exige rota e modalidade e recusa preço', () => {
  const base = {
    pedido: 'Escolta Velada',
    agentes: 2,
    dataInicio: '2026-10-22T08:00',
    origem: 'São Paulo - SP',
    destino: 'Campinas - SP',
    operacao: 'DEDICADO',
    identificacao: 'VS 303185',
    motorista: 'JOAO',
    placa: 'ABC1D23',
    telefone: '11999998888',
  };
  const ok = validarPedidoPortal(base, 'Maria', new Date('2026-10-21T12:00:00-03:00').getTime());
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.value.missionType, 'Velada');
    assert.equal(ok.value.servico, 'Escolta Velada — 2 agentes');
    assert.equal(ok.value.agentes, 2);
    assert.equal(ok.value.placa, 'ABC1D23');
    assert.equal('revenue' in ok.value, false);
  }
  assert.equal(validarPedidoPortal({ ...base, agentes: 0 }, 'Maria', new Date('2026-10-21T12:00:00-03:00').getTime()).ok, false);
  const caracterizada = validarPedidoPortal({ ...base, pedido: 'Escolta Caracterizada', agentes: 2 }, 'Maria', new Date('2026-10-21T12:00:00-03:00').getTime());
  assert.equal(caracterizada.ok, true);
  if (caracterizada.ok) {
    assert.equal(caracterizada.value.agentes, null);
    assert.equal(caracterizada.value.missionType, 'Caracterizada');
    assert.equal(caracterizada.value.servico, 'Escolta Caracterizada');
  }
  assert.equal(validarPedidoPortal({ ...base, pedido: 'Pronta resposta', agentes: 2 }, 'Maria', new Date('2026-10-21T12:00:00-03:00').getTime()).ok, false);
  const semControle = validarPedidoPortal({ ...base, identificacao: '' }, 'Maria', new Date('2026-10-21T12:00:00-03:00').getTime());
  assert.equal(semControle.ok, true);
  if (semControle.ok) assert.equal(semControle.value.identificacao, '');
  assert.equal(validarPedidoPortal({ ...base, dataInicio: '2026-10-20T23:00' }, 'Maria', new Date('2026-10-21T08:00:00-03:00').getTime()).ok, false);
  assert.equal(validarPedidoPortal({ ...base, dataInicio: '2026-10-21T01:00' }, 'Maria', new Date('2026-10-21T12:00:00-03:00').getTime()).ok, true);
  assert.equal(validarPedidoPortal({ ...base, dataFim: '2026-10-06T08:00' }, 'Maria', new Date('2026-10-21T12:00:00-03:00').getTime()).ok, false);
  const comFranquia = validarPedidoPortal({ ...base, franquiaHora: '8', franquiaKm: '200' }, 'Maria', new Date('2026-10-21T12:00:00-03:00').getTime());
  assert.equal(comFranquia.ok, true);
  if (comFranquia.ok) {
    assert.equal(comFranquia.value.franquiaHora, null);
    assert.equal(comFranquia.value.franquiaKm, null);
  }
  assert.equal(quantidadeDoPedido({}).ok && quantidadeDoPedido({}).value, 1);
  const tres = quantidadeDoPedido({ quantidade: 3 });
  assert.equal(tres.ok, true);
  if (tres.ok) assert.equal(tres.value, 3);
  assert.equal(quantidadeDoPedido({ quantidade: 21 }).ok, false);
  assert.equal(mascaraDataHora('221020260830'), '22/10/2026 08:30');
  assert.equal(dataHoraBrasil('22/10/2026 08:30'), '2026-10-22T08:30:00-03:00');
  assert.equal(parseBrazilDateTime('32/13/2026 08:30'), null);
  assert.equal(ehCampoLista('tsp'), true);
  assert.equal(ehCampoLista('servico'), false);
  const nome = decidirNomeCatalogo('dedicado', ['SPOT']);
  assert.equal(nome.acao, 'confirmar');
  if (nome.acao === 'confirmar') assert.equal(nome.nome, 'DEDICADO');
  assert.equal(corpoTrazPreco({ tarifaKm: 1 }), true);
  assert.deepEqual(emailsDaSolicitacao('a@cliente.com, operacional@grupotmseg.com.br'), [
    'operacional@grupotmseg.com.br',
    'a@cliente.com',
  ]);
});

test('leitura do site ignora rede interna e pega cor e ícone', () => {
  assert.equal(urlDeSitePublico('http://127.0.0.1/admin'), null);
  assert.equal(urlDeSitePublico('https://cliente.com.br')?.hostname, 'cliente.com.br');
  const marca = lerMarcaDoHtml(
    '<html><head><meta name="theme-color" content="#112233"><link rel="icon" href="/logo.png"></head></html>',
    new URL('https://cliente.com.br/inicio'),
  );
  assert.equal(marca.cor, '#112233');
  assert.equal(marca.logo, 'https://cliente.com.br/logo.png');
});

test('a rota local do site do cliente entra no mesmo leitor do portal', () => {
  const fonte = readFileSync(join(root, 'lib/cevaPortal/httpHandler.ts'), 'utf8');
  assert.match(fonte, /ceva\|ibl\|cliente/);
});

test('rewrite do portal genérico não cria function nova', () => {
  const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
  assert.equal(Object.keys(vercel.functions || {}).length, 50);
  const sources = vercel.rewrites as { source: string; destination: string }[];
  const catchIdx = sources.findIndex((item) => item.destination === '/api/index');
  const portal = sources.findIndex((item) => item.source === '/api/cliente-portal/solicitacoes');
  assert.ok(portal > -1 && portal < catchIdx);
  assert.match(sources[portal].destination, /\/api\/ibl-portal\?op=solicitacoes/);
});
