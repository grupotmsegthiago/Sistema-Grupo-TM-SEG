import { anexoMedicao } from './medicaoAnexo.js';
import { EMAIL_FINANCEIRO_MEDICAO, medicaoDaLinha, textoEmailConferir, validarConferir, type MedicaoCliente } from './medicao.js';

type ClientePortal = { id?: number | string | null; name?: string | null; trading_name?: string | null };
type RespostaMedicao = { status: number; corpo: Record<string, unknown> };

function detalhe(rotulo: string, valor: unknown): string {
  if (valor == null || valor === '') return `${rotulo}: —`;
  return `${rotulo}: ${valor}`;
}

export function detalhesDaMedicao(linha: Record<string, unknown> | null | undefined): string[] {
  const item = linha || {};
  return [
    detalhe('Serviço', item.servico),
    detalhe('Data início', item.dataInicio),
    detalhe('Data fim', item.dataFim),
    detalhe('Local', item.local),
    detalhe('Franquia hora', item.franquiaHora),
    detalhe('Franquia km', item.franquiaKm),
    detalhe('Km início', item.kmInicio),
    detalhe('Km fim', item.kmFim),
    detalhe('Km rodado', item.kmRodado),
    detalhe('Km excedente', item.kmExcedente),
    detalhe('Horas trabalhadas', item.hrsTrabalhada),
    detalhe('Horas excedentes', item.hrsExcedente),
    detalhe('R$ horas excedentes', item.valorHrsExcedente),
    detalhe('R$ km excedente', item.valorKmExcedente),
    detalhe('R$ acionamento', item.valorAcionamento),
    detalhe('Pedágio', item.pedagio),
    detalhe('Tarifa km', item.tarifaKm),
    detalhe('Tarifa hora', item.tarifaHora),
    detalhe('R$ total', item.valorTotal),
  ];
}

export async function gravarMedicaoPortal(input: {
  sb: { from: (tabela: string) => any; storage: { from: (balde: string) => any } };
  os: string;
  cliente: ClientePortal | null;
  autor: string;
  acao: string;
  equipeInterna?: boolean;
  body: Record<string, unknown>;
  enviarEmail?: (texto: string, anexo: { filename: string; content: Buffer; contentType: string } | null) => Promise<void>;
}): Promise<RespostaMedicao> {
  const os = String(input.os || '').replace(/\D/g, '');
  if (!/^\d+$/.test(os)) return { status: 400, corpo: { error: 'OS inválida.' } };
  const nomeCliente = String(input.cliente?.trading_name || input.cliente?.name || '').trim();
  if (!nomeCliente) return { status: 503, corpo: { error: 'Cliente do portal não encontrado.' } };
  const missionId = `GTM-${os}`;
  const { data: mission, error: missionError } = await input.sb.from('missions').select('id, client, billing_approved').eq('id', missionId).maybeSingle();
  if (missionError) return { status: 500, corpo: { error: 'Não foi possível conferir a OS.' } };
  const dono = String(mission?.client || '').trim().toUpperCase();
  const nomes = [input.cliente?.name, input.cliente?.trading_name]
    .map((nome) => String(nome || '').trim().toUpperCase())
    .filter(Boolean);
  if (!mission || !nomes.includes(dono)) {
    return { status: 404, corpo: { error: 'OS não encontrada neste portal.' } };
  }

  const agora = new Date().toISOString();
  const acao = String(input.acao || input.body.acao || '').trim();
  if (acao === 'reverter') {
    if (input.equipeInterna !== true) {
      return { status: 403, corpo: { error: 'Só o administrador interno pode voltar uma aprovação para verificar.' } };
    }
    const { data: atual, error: leitura } = await input.sb.from('portal_medicao_cliente').select('status').eq('mission_id', missionId).maybeSingle();
    if (leitura) return { status: 503, corpo: { error: 'Não foi possível ler a aprovação.' } };
    if (atual?.status !== 'aprovado') {
      return { status: 409, corpo: { error: 'Esta OS não está aprovada.' } };
    }
    const { error } = await input.sb.from('portal_medicao_cliente').delete().eq('mission_id', missionId);
    if (error) return { status: 503, corpo: { error: 'Não foi possível voltar a OS para verificar.' } };
    return { status: 200, corpo: { ok: true, os, medicao: null } };
  }

  if (mission.billing_approved !== true) {
    return { status: 409, corpo: { error: 'Esta OS está aguardando validação. A análise fica disponível quando o valor for liberado.' } };
  }
  if (acao === 'aprovar') {
    if (input.body.deAcordo !== true) {
      return { status: 400, corpo: { error: 'Analise a medição e marque De acordo para aprovar.' } };
    }
    const { error } = await input.sb.from('portal_medicao_cliente').upsert({
      mission_id: missionId,
      client_id: input.cliente?.id ?? null,
      status: 'aprovado',
      aprovado_em: agora,
      aprovado_por: input.autor,
    }, { onConflict: 'mission_id' });
    if (error) return { status: 503, corpo: { error: 'Não foi possível gravar a aprovação. A tabela da medição ainda não está no banco.' } };
    const medicao: MedicaoCliente = { status: 'aprovado', itens: [], justificativa: null, modificadoEm: null };
    return { status: 200, corpo: { ok: true, os, medicao } };
  }

  if (acao !== 'conferir') return { status: 400, corpo: { error: 'Ação inválida.' } };
  const pedido = validarConferir({ itens: input.body.itens, justificativa: input.body.justificativa });
  if (!pedido.ok) return { status: 400, corpo: { error: pedido.erro } };
  const anexo = anexoMedicao({ nome: input.body.anexoNome, tipo: input.body.anexoTipo, base64: input.body.anexoBase64 });
  if (!anexo.ok) return { status: 400, corpo: { error: anexo.erro } };

  let anexoCaminho: string | null = null;
  let anexoNome: string | null = null;
  let arquivo: { filename: string; content: Buffer; contentType: string } | null = null;
  if (!('vazio' in anexo)) {
    anexoNome = anexo.nome;
    anexoCaminho = `portal-medicao/${missionId}/${Date.now()}-${anexo.nome.replace(/\s+/g, '_')}`;
    const envio = await input.sb.storage.from('mission-evidence').upload(anexoCaminho, anexo.bytes, { contentType: anexo.tipo, upsert: false });
    if (envio?.error) return { status: 500, corpo: { error: 'Não foi possível guardar o anexo.' } };
    arquivo = { filename: anexo.nome, content: anexo.bytes, contentType: anexo.tipo };
  }

  const { error } = await input.sb.from('portal_medicao_cliente').upsert({
    mission_id: missionId,
    client_id: input.cliente?.id ?? null,
    status: 'conferir',
    itens: pedido.itens,
    justificativa: pedido.justificativa,
    anexo_caminho: anexoCaminho,
    anexo_nome: anexoNome,
    pedido_em: agora,
    pedido_por: input.autor,
    aprovado_em: null,
    aprovado_por: null,
    modificado_em: null,
  }, { onConflict: 'mission_id' });
  if (error) return { status: 503, corpo: { error: 'Não foi possível gravar a conferência. A tabela da medição ainda não está no banco.' } };

  let emailEnviado = false;
  try {
    const texto = textoEmailConferir({
      os,
      cliente: nomeCliente,
      autor: input.autor,
      itens: pedido.itens,
      justificativa: pedido.justificativa,
      detalhes: detalhesDaMedicao(input.body.detalhes as Record<string, unknown> | undefined),
    });
    if (input.enviarEmail) await input.enviarEmail(texto, arquivo);
    emailEnviado = Boolean(input.enviarEmail);
  } catch {
    emailEnviado = false;
  }

  return {
    status: 200,
    corpo: {
      ok: true,
      os,
      emailEnviado,
      destinatario: EMAIL_FINANCEIRO_MEDICAO,
      medicao: medicaoDaLinha({ status: 'conferir', itens: pedido.itens, justificativa: pedido.justificativa, modificado_em: null }),
    },
  };
}
