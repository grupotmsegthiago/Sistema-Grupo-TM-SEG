/** Abre a OS como Solicitada, no mesmo formato da criação interna. Sem fornecedor, só a tabela do cliente. O valor não vai para o cliente. */

import type { PortalServidor } from '../cevaPortal/portalServidor';
import { sendMail, SMTP_FROM } from '../email/smtp';
import { historicoDaMesmaRota, receitaDaTabelaNaCriacao } from '../billing/tabelaNaCriacao';
import { snapshotTabelaNaCriacao } from '../missionSnapshot';
import { escolherTabelaProxima } from '../rotaAprovadaTabela';
import type { PedidoPortal } from './pedido';
import { emailsDaSolicitacao } from './pedido';

type SupabaseAdmin = {
  from: (tabela: string) => any;
};

const LOCAL_PORTAL = 'Solicitação do portal — aguardando fornecedor';

function escapar(valor: string): string {
  return valor.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function proximoNumero(sb: SupabaseAdmin): Promise<number> {
  const { data, error } = await sb.from('missions').select('id').order('created_at', { ascending: false }).limit(40);
  if (error) throw error;
  let max = 0;
  for (const row of data || []) {
    const numero = Number(String(row.id || '').split('-')[1]);
    if (Number.isFinite(numero) && numero > max) max = numero;
  }
  return max + 1;
}

function payloadOs(
  id: string,
  cliente: string,
  pedido: PedidoPortal,
  solicitante: string,
  vehicleId: number | null,
  agora: string,
  comValorZero: boolean,
  extras?: { receita: number; km: number; snapshot: Record<string, unknown> } | null,
) {
  const receita = extras && extras.receita > 0 ? extras.receita : null;
  const base: Record<string, unknown> = {
    id,
    client: cliente,
    provider: null,
    origin: pedido.origem,
    destination: pedido.destino,
    status: 'Solicitada',
    last_update: agora,
    created_at: agora,
    updated_by: solicitante,
    start_time: pedido.dataInicio,
    mission_type: pedido.missionType,
    special_operation_type: pedido.servico,
    revenue_value: receita != null ? receita : (comValorZero ? 0 : null),
    cost_value: comValorZero ? 0 : null,
    toll_value: null,
    toll_value_provider: null,
    billing_approved: false,
    snapshot_data: extras?.snapshot || null,
    snapshot_approved_by: null,
    snapshot_approved_at: null,
    current_location: LOCAL_PORTAL,
    valor_zero_motivo: 'AGUARDANDO DEFINIÇÃO',
    driver_name: pedido.motorista,
    driver_phone: pedido.telefone,
    reference_number: pedido.identificacao,
    client_vehicle: vehicleId,
  };
  if (extras && extras.km > 0) base.total_distance = Math.round(extras.km * 100) / 100;
  return base;
}

async function tabelaEValorIniciais(sb: SupabaseAdmin, cliente: string, pedido: PedidoPortal) {
  try {
    const historico = await historicoDaMesmaRota(sb, cliente, pedido.origem, pedido.destino);
    const escolha = escolherTabelaProxima({
      cliente,
      origem: pedido.origem,
      destino: pedido.destino,
      historico,
    });
    if (!escolha?.clientTableId) return null;
    const valor = await receitaDaTabelaNaCriacao(sb, cliente, pedido.origem, pedido.destino, escolha.clientTableId);
    return {
      receita: valor?.receita || 0,
      km: valor?.km || 0,
      snapshot: snapshotTabelaNaCriacao({ clientTableId: escolha.clientTableId }),
    };
  } catch (erro) {
    console.warn('[portal] tabela da criação', erro);
    return null;
  }
}

function semColunaOpcional(payload: Record<string, unknown>, mensagem: string): Record<string, unknown> | null {
  const texto = mensagem.toLowerCase();
  const opcionais = ['special_operation_type', 'valor_zero_motivo', 'billing_approved', 'toll_value_provider', 'snapshot_approved_by', 'snapshot_approved_at', 'snapshot_data'];
  const achou = opcionais.find((coluna) => texto.includes(coluna));
  if (!achou || !Object.prototype.hasOwnProperty.call(payload, achou)) return null;
  const copia = { ...payload };
  delete copia[achou];
  return copia;
}

async function inserirOs(
  sb: SupabaseAdmin,
  cliente: string,
  pedido: PedidoPortal,
  solicitante: string,
  vehicleId: number | null,
): Promise<string> {
  const agora = new Date().toISOString();
  const extras = await tabelaEValorIniciais(sb, cliente, pedido);
  let comValorZero = false;
  for (let tentativa = 0; tentativa < 8; tentativa += 1) {
    const numero = await proximoNumero(sb);
    const id = `GTM-${String(numero).padStart(4, '0')}`;
    let payload = payloadOs(id, cliente, pedido, solicitante, vehicleId, agora, comValorZero, extras);
    let resultado = await sb.from('missions').insert([payload]);
    for (let ajuste = 0; ajuste < 6 && resultado.error; ajuste += 1) {
      const mensagem = String(resultado.error.message || '');
      if (/revenue_value|cost_value|not-null|null value/i.test(mensagem) && !comValorZero) {
        comValorZero = true;
        payload = payloadOs(id, cliente, pedido, solicitante, vehicleId, agora, true, extras);
        resultado = await sb.from('missions').insert([payload]);
        continue;
      }
      const reduzido = semColunaOpcional(payload, mensagem);
      if (!reduzido) break;
      payload = reduzido;
      resultado = await sb.from('missions').insert([payload]);
    }
    if (!resultado.error) return id;
    if (resultado.error.code === '23505') continue;
    throw new Error(resultado.error.message || 'Não foi possível abrir a OS.');
  }
  throw new Error('Não foi possível numerar a OS.');
}

async function gravarCampos(
  sb: SupabaseAdmin,
  portal: PortalServidor,
  missionId: string,
  pedido: PedidoPortal,
) {
  const linha: Record<string, unknown> = {
    mission_id: missionId,
    solicitante: pedido.solicitante,
    quem_autorizou: pedido.quemAutorizou,
    servico: pedido.servico,
    atendimento_pgr: pedido.atendimentoPgr,
    contrato: pedido.contrato,
    operacao: pedido.operacao,
    tsp: pedido.tsp,
    placa: pedido.placa,
    updated_at: new Date().toISOString(),
  };
  if (portal.clientId != null) linha.client_id = portal.clientId;
  let resultado = await sb.from(portal.tabelas.osCampos).upsert(linha, { onConflict: 'mission_id' });
  if (resultado.error && /placa/i.test(String(resultado.error.message || ''))) {
    delete linha.placa;
    resultado = await sb.from(portal.tabelas.osCampos).upsert(linha, { onConflict: 'mission_id' });
  }
  if (resultado.error) {
    console.error(`[${portal.logPrefix}] campos da solicitação`, resultado.error.message);
  }
}

async function gravarSolicitacao(
  sb: SupabaseAdmin,
  portal: PortalServidor,
  missionId: string,
  pedido: PedidoPortal,
  usuario: { id: string; email: string },
) {
  const linha: Record<string, unknown> = {
    mission_id: missionId,
    data_inicio: pedido.dataInicio,
    data_fim: pedido.dataFim,
    solicitante: pedido.solicitante,
    quem_autorizou: pedido.quemAutorizou,
    servico: pedido.servico,
    atendimento_pgr: pedido.atendimentoPgr,
    contrato: pedido.contrato,
    operacao: pedido.operacao,
    tsp: pedido.tsp,
    placa: pedido.placa,
    motorista: pedido.motorista,
    franquia_hora: pedido.franquiaHora,
    franquia_km: pedido.franquiaKm,
    filled_by_user_id: usuario.id,
    filled_by_name: pedido.solicitante,
    filled_by_email: usuario.email,
  };
  if (portal.clientId != null) linha.client_id = portal.clientId;
  let resultado = await sb.from(portal.tabelas.solicitacoes).insert(linha);
  if (resultado.error && /mission_id/i.test(String(resultado.error.message || ''))) {
    delete linha.mission_id;
    resultado = await sb.from(portal.tabelas.solicitacoes).insert(linha);
  }
  if (resultado.error) {
    console.error(`[${portal.logPrefix}] fila da solicitação`, resultado.error.message);
  }
}

export async function enviarEmailSolicitacao(input: {
  destinatarios: string[];
  os: string;
  cliente: string;
  pedido: PedidoPortal;
}): Promise<boolean> {
  const pedido = input.pedido;
  const linhas = [
    ['OS', input.os],
    ['Cliente', input.cliente],
    ['Serviço', pedido.servico],
    ['Agentes', pedido.agentes ? String(pedido.agentes) : ''],
    ['Origem', pedido.origem],
    ['Destino', pedido.destino],
    ['Operação', pedido.operacao],
    ['Controle interno da OS', pedido.identificacao],
    ['Motorista', pedido.motorista],
    ['Veículo', pedido.placa],
    ['Telefone', pedido.telefone],
    ['Solicitante', pedido.solicitante],
  ].filter((par): par is [string, string] => Boolean(par[1]));
  const html = `<!DOCTYPE html><html lang="pt-BR"><body style="font-family:Segoe UI,Arial,sans-serif;color:#333;line-height:1.5">
    <h2>Solicitação de escolta — ${escapar(input.os)}</h2>
    <p>O portal do cliente abriu uma OS com status <strong>SOLICITADA</strong>, no mesmo formato da criação interna. O fornecedor ainda não foi escolhido. O valor fica somente no sistema e não aparece para o cliente.</p>
    <table>${linhas.map(([rotulo, valor]) => `<tr><td style="padding:4px 12px 4px 0"><strong>${escapar(rotulo)}</strong></td><td>${escapar(valor)}</td></tr>`).join('')}</table>
    <p>Atenciosamente,<br><strong>Grupo TM SEG</strong></p>
  </body></html>`;
  try {
    await sendMail({
      from: SMTP_FROM,
      to: input.destinatarios,
      subject: `Solicitação ${input.os} — ${input.cliente}`,
      html,
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[portal] e-mail da solicitação', message);
    return false;
  }
}

export async function registrarSolicitacaoPortal(
  sb: SupabaseAdmin,
  portal: PortalServidor,
  pedido: PedidoPortal,
  usuario: { id: string; email: string },
  operationalEmail: string | null | undefined,
  clientId: number | null,
  opcoes?: { enviarEmail?: boolean; clienteOficial?: string },
): Promise<{ os: string; emailEnviado: boolean }> {
  const nomeCliente = String(opcoes?.clienteOficial || portal.clienteNome).trim();
  let vehicleId: number | null = null;
  if (clientId != null) {
    const veiculo = await sb
      .from('client_vehicles')
      .select('id, plate')
      .eq('client_id', clientId)
      .ilike('plate', pedido.placa)
      .maybeSingle();
    if (veiculo.data?.id) vehicleId = Number(veiculo.data.id);
  }
  const os = await inserirOs(sb, nomeCliente, pedido, pedido.solicitante, vehicleId);
  await gravarCampos(sb, portal, os, pedido);
  await gravarSolicitacao(sb, portal, os, pedido, usuario);
  try {
    await sb.from('system_logs').insert([{
      user_name: pedido.solicitante,
      action_type: 'CREATE',
      entity: 'Mission',
      entity_id: os,
      details: JSON.stringify({
        origem: 'portal_cliente',
        client: nomeCliente,
        pedido: pedido.pedido,
        agentes: pedido.agentes,
        identificacao: pedido.identificacao,
      }),
    }]);
  } catch {
    /* o log não impede a OS */
  }
  const emailEnviado = opcoes?.enviarEmail === false
    ? false
    : await enviarEmailSolicitacao({
      destinatarios: emailsDaSolicitacao(operationalEmail),
      os,
      cliente: nomeCliente,
      pedido,
    });
  return { os, emailEnviado };
}
