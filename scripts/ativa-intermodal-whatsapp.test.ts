import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  botoesWhatsAppDaOs,
  textoAgenteAtiva,
  textoClienteAtiva,
  textoParceiroAtiva,
  type TextoAtivaIntermodal,
} from '../lib/ativaIntermodalWhatsApp';

const dados: TextoAtivaIntermodal = {
  os: 'GTM-9108',
  cliente: 'INTERMODAL BRASIL LOGISTICA S.A.',
  origem: 'Av. Buriti, 1050 - Distrito Industrial, Manaus - AM',
  destino: 'AM-070, Iranduba - AM',
  motorista: 'JANDRISON AMARAL',
  agente: 'Julio Andrey Mendes de Oliveira',
  viatura: 'QZO2J89 • 26.260 CRM 6X2',
  linkAgente: 'https://sistema.grupotmseg.com.br/rastreio?token=abc',
  linkCliente: 'https://sistema.grupotmseg.com.br/rastreio?c=xyz',
};

test('agente e cliente em toda velada; parceiro só na ATIVA da Intermodal', () => {
  assert.deepEqual(botoesWhatsAppDaOs({ client: 'INTERMODAL BRASIL LOGISTICA S.A.', provider: 'ATIVA PRONTA RESPOSTA', mission_type: 'Velada' }), { agente: true, cliente: true, parceiro: true });
  assert.deepEqual(botoesWhatsAppDaOs({ client: 'INTERMODAL BRASIL LOGISTICA S.A.', provider: 'TORRES', mission_type: 'Velada' }), { agente: true, cliente: true, parceiro: false });
  assert.deepEqual(botoesWhatsAppDaOs({ client: 'CESLOG', provider: 'ATIVA PRONTA RESPOSTA', mission_type: 'Velada' }), { agente: true, cliente: true, parceiro: false });
  assert.deepEqual(botoesWhatsAppDaOs({ client: 'INTERMODAL BRASIL LOGISTICA S.A.', provider: 'ATIVA PRONTA RESPOSTA', mission_type: 'Caracterizada' }), { agente: false, cliente: false, parceiro: false });
  assert.deepEqual(botoesWhatsAppDaOs({ client: 'INTERMODAL BRASIL LOGISTICA S.A.', provider: 'FILIAL INATIVA', mission_type: 'Velada' }), { agente: true, cliente: true, parceiro: false });
});

test('textos saem no modelo do WhatsApp com negrito e o link real', () => {
  const parceiro = textoParceiroAtiva(dados);
  assert.match(parceiro, /🟢 \*TMSEG \| ORDEM DE MISSÃO - PARCEIRO ATIVA\*/);
  assert.match(parceiro, /📍 \*Origem:\* Av\. Buriti/);
  assert.match(parceiro, /rastreio\?token=abc/);
  assert.doesNotMatch(parceiro, /token-uuid-1234|\/agente\/missao\//);
  const agente = textoAgenteAtiva(dados);
  assert.match(agente, /Olá, Julio Andrey Mendes de Oliveira\./);
  assert.match(agente, /\*Acesse o Painel do Agente:\*/);
  assert.doesNotMatch(agente, /\/agente\/missao\//);
  const cliente = textoClienteAtiva(dados);
  assert.match(cliente, /• \*OS:\* GTM-9108/);
  assert.match(cliente, /• \*Motorista \/ Agente:\* JANDRISON AMARAL \/ Julio Andrey Mendes de Oliveira/);
  assert.match(cliente, /• \*Veículo Escoltado \/ Viatura:\* QZO2J89/);
  assert.match(cliente, /rastreio\?c=xyz/);
  assert.doesNotMatch(cliente, /\/cliente\/rastreio\//);
  assert.match(cliente, /⏱️ \*Status Atual:\* Aguardando sinal do agente \/ Trânsito monitorado/);
});

test('os links ficam na foto e somem da coluna de ícones', () => {
  const card = fs.readFileSync('components/MissionCard.tsx', 'utf8');
  const botoes = fs.readFileSync('components/MensagensAtivaIntermodal.tsx', 'utf8');
  assert.match(card, /links=\{!hideProviderInfo \? <MensagensAtivaIntermodal/);
  assert.doesNotMatch(card, /LiveTrackPanel/);
  assert.match(botoes, /Gerar link do agente/);
  assert.match(botoes, /Link agente - gerado/);
  assert.match(botoes, /Copiar de novo/);
});
