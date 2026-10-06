import { supabase } from '../supabase';
import { authFetch } from '../authFetch';
import { buildOsActionPlanHtml } from './buildOsActionPlanHtml';
import { montarAtualizacoes, resolverPosicoes } from './diarioOperacional';
import type { OsActionPlanCadastro, OsActionPlanContaCliente, OsActionPlanFoto, OsActionPlanInput } from './types';

function limpo(value: unknown): string | null {
  const t = String(value ?? '').trim();
  return t || null;
}

function km(value: unknown): string | null {
  if (value == null || value === '') return null;
  const t = String(value).trim();
  if (!t) return null;
  return /km/i.test(t) ? t : `${t} km`;
}

function localDoTexto(texto: string): string | null {
  const parte = texto.split('|').slice(1).join(' ').replace(/\s+/g, ' ').trim().replace(/,?\s*brasil$/i, '');
  return parte || null;
}

function fotosComLocal(fotos: OsActionPlanFoto[], atualizacoes: OsActionPlanAtualizacao[]): OsActionPlanFoto[] {
  const comLocal = atualizacoes
    .map((a) => ({ quando: new Date(a.quando).getTime(), local: localDoTexto(a.texto) }))
    .filter((a) => a.local && Number.isFinite(a.quando));
  return fotos
    .map((foto) => {
      const t = foto.quando ? new Date(foto.quando).getTime() : NaN;
      let local = foto.local || null;
      if (!local && Number.isFinite(t)) {
        let melhor: { delta: number; local: string } | null = null;
        for (const item of comLocal) {
          const delta = Math.abs(item.quando - t);
          if (!melhor || delta < melhor.delta) melhor = { delta, local: item.local as string };
        }
        if (melhor && melhor.delta <= 3 * 60 * 60 * 1000) local = melhor.local;
      }
      return { ...foto, local };
    })
    .sort((a, b) => String(a.quando || '9999').localeCompare(String(b.quando || '9999')));
}

function cadastroDe(row: Record<string, unknown> | null): OsActionPlanCadastro | null {
  if (!row) return null;
  return {
    razao: limpo(row.name),
    fantasia: limpo(row.trading_name),
    cnpj: limpo(row.cnpj),
    cidade: limpo(row.city),
    uf: limpo(row.state),
    contato: limpo(row.contact_name ?? row.contactName),
    telefone: limpo(row.phone),
  };
}

async function contarContaCliente(clientName: string): Promise<OsActionPlanContaCliente> {
  const vazio: OsActionPlanContaCliente = { estado: 'NÃO CARREGADO', total: null, caracterizada: null, velada: null, desde: null };
  if (!clientName || clientName === 'Cliente não identificado') return vazio;
  const consulta = () => supabase.from('missions').select('id', { count: 'exact', head: true }).ilike('client', clientName);
  const [total, caracterizada, velada, primeira] = await Promise.all([
    consulta(),
    consulta().eq('mission_type', 'Caracterizada'),
    consulta().eq('mission_type', 'Velada'),
    supabase.from('missions').select('created_at').ilike('client', clientName).order('created_at', { ascending: true }).limit(1),
  ]);
  if (total.error || caracterizada.error || velada.error || primeira.error) {
    return { estado: 'ERRO', total: null, caracterizada: null, velada: null, desde: null };
  }
  if (total.count == null || caracterizada.count == null || velada.count == null) return vazio;
  const desde = primeira.data && primeira.data[0] ? limpo((primeira.data[0] as { created_at?: string }).created_at) : null;
  return { estado: 'ENCONTRADO', total: total.count, caracterizada: caracterizada.count, velada: velada.count, desde };
}

type EstadoLeitura = 'ENCONTRADO' | 'ERRO' | 'CONSULTA INCOMPLETA';

async function lerFaixas(
  ler: (inicio: number, fim: number) => PromiseLike<{ data: unknown[] | null; error: { message?: string } | null }>,
): Promise<{ rows: Record<string, unknown>[]; estado: EstadoLeitura }> {
  const rows: Record<string, unknown>[] = [];
  const tamanho = 1000;
  for (let inicio = 0; inicio < 20000; inicio += tamanho) {
    const { data, error } = await ler(inicio, inicio + tamanho - 1);
    if (error) return { rows, estado: rows.length > 0 ? 'CONSULTA INCOMPLETA' : 'ERRO' };
    const pagina = (data || []) as Record<string, unknown>[];
    rows.push(...pagina);
    if (pagina.length < tamanho) return { rows, estado: 'ENCONTRADO' };
  }
  return { rows, estado: 'CONSULTA INCOMPLETA' };
}

async function lerHistoricoMissao(id: string): Promise<{ rows: Record<string, unknown>[]; estado: EstadoLeitura }> {
  return lerFaixas((inicio, fim) => supabase
    .from('mission_history')
    .select('changed_at,changed_by,field_name,new_value')
    .eq('mission_id', id)
    .order('changed_at', { ascending: true })
    .range(inicio, fim));
}

async function geocodificarEndereco(endereco: string): Promise<{ lat: number; lng: number } | null> {
  const consulta = String(endereco || '').trim();
  if (consulta.length < 8) return null;
  try {
    const resposta = await authFetch(`/api/geocode-address?address=${encodeURIComponent(consulta)}`, {
      signal: AbortSignal.timeout(8000),
    });
    const json = await resposta.json().catch(() => ({}));
    const local = json?.location;
    if (local && Number.isFinite(Number(local.lat)) && Number.isFinite(Number(local.lng))) {
      return { lat: Number(local.lat), lng: Number(local.lng) };
    }
  } catch {
    /* o relatório segue sem esse ponto */
  }
  return null;
}

export async function completarPosicoes(entrada: OsActionPlanInput): Promise<OsActionPlanInput> {
  const linkGravado = [...(entrada.atualizacoes || [])]
    .reverse()
    .map((item) => String(item.linkMapa || ''))
    .find((link) => /maps\?q=|@-?\d+\.\d+/.test(link)) || null;
  const posicoes = await resolverPosicoes({
    atualizacoes: entrada.atualizacoes || [],
    origem: entrada.origem,
    destino: entrada.destino,
    linkAtualMissao: linkGravado,
    geocodificar: geocodificarEndereco,
  });
  return {
    ...entrada,
    atualizacoes: posicoes.atualizacoes,
    origemCoord: posicoes.origemCoord,
    destinoCoord: posicoes.destinoCoord,
    diagnosticoMapa: posicoes.diagnostico,
  };
}

export async function coletarPlanoAcaoOs(missionId: string): Promise<OsActionPlanInput | null> {
  const id = String(missionId || '').trim();
  if (!id) return null;

  const { data: mission, error } = await supabase.from('missions').select('*').eq('id', id).maybeSingle();
  if (error || !mission) return null;
  const m = mission as Record<string, unknown>;

  const clientName = limpo(m.client) || 'Cliente não identificado';
  const colunasCliente = 'name,trading_name,cnpj,city,state,contact_name,phone';
  const { data: porNome } = await supabase
    .from('clients')
    .select(colunasCliente)
    .ilike('name', clientName)
    .limit(1);
  let clienteRow = porNome && porNome[0] ? porNome[0] as Record<string, unknown> : null;
  if (!clienteRow) {
    const { data: porFantasia } = await supabase
      .from('clients')
      .select(colunasCliente)
      .ilike('trading_name', clientName)
      .limit(1);
    clienteRow = porFantasia && porFantasia[0] ? porFantasia[0] as Record<string, unknown> : null;
  }
  const cadastro = cadastroDe(clienteRow);
  const contaCliente = await contarContaCliente(clientName);

  const historico = await lerHistoricoMissao(id);
  const [occurrences, logs, diario] = await Promise.all([
    lerFaixas((inicio, fim) => supabase
      .from('mission_occurrences')
      .select('description,evidence_url,created_at,created_by,resolved_at')
      .eq('mission_id', id)
      .order('created_at', { ascending: true })
      .range(inicio, fim)),
    lerFaixas((inicio, fim) => supabase
      .from('system_logs')
      .select('created_at,action_type,details,user_name')
      .eq('entity_id', id)
      .order('created_at', { ascending: true })
      .range(inicio, fim)),
    lerFaixas((inicio, fim) => supabase
      .from('mission_logs')
      .select('created_at,updated_by,description,map_link')
      .eq('mission_id', id)
      .order('created_at', { ascending: true })
      .range(inicio, fim)),
  ]);

  const rows = historico.rows;
  const ultima = (status: string) =>
    [...rows].reverse().find((h) => h.field_name === 'status' && h.new_value === status)?.changed_at;

  let placaCarga = limpo(m.client_vehicle_plate);
  let modeloCarga = limpo(m.client_vehicle_model);
  const clientVehicleId = m.client_vehicle || m.client_vehicle_id;
  if (clientVehicleId && !placaCarga) {
    const { data: cv } = await supabase.from('client_vehicles').select('plate,model').eq('id', clientVehicleId).maybeSingle();
    placaCarga = limpo(cv?.plate) || placaCarga;
    modeloCarga = limpo(cv?.model) || modeloCarga;
  }

  let placaViatura = limpo(m.vehicle_plate);
  let modeloViatura = limpo(m.vehicle_model);
  if (m.vehicle_id && !placaViatura) {
    const { data: veh } = await supabase.from('vehicles').select('plate,model').eq('id', m.vehicle_id).maybeSingle();
    placaViatura = limpo(veh?.plate) || placaViatura;
    modeloViatura = limpo(veh?.model) || modeloViatura;
  }

  const programado = limpo(m.start_time);
  const chegadaOrigem = ultima('Origem');
  let atrasoMinutosOrigem: number | null = null;
  if (programado && chegadaOrigem) {
    const a = new Date(programado).getTime();
    const b = new Date(String(chegadaOrigem)).getTime();
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) {
      atrasoMinutosOrigem = Math.round((b - a) / 60000);
    }
  }

  const fotos: OsActionPlanFoto[] = [];
  const pushFoto = (legenda: string, url: unknown, quando?: string | null) => {
    const u = limpo(url);
    if (!u || fotos.some((f) => f.url === u)) return;
    fotos.push({ legenda, url: u, quando: quando || null, local: null });
  };

  const lerDetalhe = (raw: unknown): Record<string, unknown> => {
    if (!raw) return {};
    if (typeof raw === 'object') return raw as Record<string, unknown>;
    try { return JSON.parse(String(raw)) as Record<string, unknown>; } catch { return {}; }
  };
  for (const log of logs.rows) {
    const details = lerDetalhe(log.details);
    const direta = limpo(details.publicUrl || details.evidenceUrl || details.url || details.imageUrl);
    const caminho = limpo(details.filePath || details.path);
    const url = direta || (caminho ? supabase.storage.from('mission-evidence').getPublicUrl(caminho).data.publicUrl : null);
    const legenda = limpo(details.context || details.texto || log.action_type) || 'Atualização da missão';
    const quando = limpo(details.uploadedAt) || limpo(log.created_at);
    pushFoto(legenda, url, quando);
  }
  pushFoto('Espelhamento', m.mirroring_evidence_url, limpo(m.updated_at));
  pushFoto('Evidência do fim da viagem', m.end_trip_evidence_url, limpo(m.end_time));
  pushFoto('Hodômetro inicial', m.start_km_evidence_url, limpo(m.start_time));
  pushFoto('Hodômetro final', m.end_km_evidence_url, limpo(m.end_time));
  pushFoto('Print de deslocamento', m.dhl_deslocamento_approval_url, limpo(m.updated_at));

  let consultaEvidencias: 'ENCONTRADO' | 'CONSULTA INCOMPLETA' = 'ENCONTRADO';
  const pastas = [id, `odometer/${id}`, `fim-viagem/${id}`, `ocorrencias/${id}`, `refused/${id}`, `cancelled/${id}`];
  for (const pasta of pastas) {
    let offset = 0;
    for (;;) {
      const { data: arquivos, error: erroArquivo } = await supabase.storage.from('mission-evidence').list(pasta, { limit: 100, offset });
      if (erroArquivo) {
        consultaEvidencias = 'CONSULTA INCOMPLETA';
        break;
      }
      const lista = arquivos || [];
      for (const arquivo of lista) {
        if (!arquivo.name || arquivo.name.endsWith('/')) continue;
        const caminho = `${pasta}/${arquivo.name}`;
        const url = supabase.storage.from('mission-evidence').getPublicUrl(caminho).data.publicUrl;
        const marca = arquivo.name.match(/(\d{13})/);
        const quandoArquivo = marca ? new Date(Number(marca[1])).toISOString() : null;
        pushFoto(
          pasta.includes('odometer') ? 'Hodômetro' : pasta.includes('fim-viagem') ? 'Fim da viagem' : 'Tela de atualização da missão',
          url,
          quandoArquivo,
        );
      }
      if (lista.length < 100) break;
      offset += lista.length;
      if (offset >= 400) {
        consultaEvidencias = 'CONSULTA INCOMPLETA';
        break;
      }
    }
  }

  for (const o of occurrences.rows) {
    pushFoto('Evidência da ocorrência', o.evidence_url);
  }

  const fotosProntas = fotosComLocal(fotos, rows
    .filter((h) => h.field_name === 'current_location' && limpo(h.new_value))
    .map((h) => ({
      quando: String(h.changed_at || ''),
      texto: String(h.new_value),
      por: limpo(h.changed_by),
      fotoUrl: null,
    })));
  const atualizacoesBrutas = montarAtualizacoes({
    logs: diario.rows,
    historico: rows,
    fotos: fotosProntas,
  });
  const posicoes = await resolverPosicoes({
    atualizacoes: atualizacoesBrutas,
    origem: limpo(m.origin),
    destino: limpo(m.destination),
    linkAtualMissao: limpo(m.map_link),
    geocodificar: geocodificarEndereco,
  });
  const atualizacoes = posicoes.atualizacoes;

  return {
    missionId: id,
    clientName,
    cadastro,
    status: limpo(m.status) || '—',
    tipo: limpo(m.mission_type),
    operacaoEspecial: limpo(m.special_operation_type),
    fornecedor: limpo(m.provider) || '—',
    origem: limpo(m.origin) || '—',
    destino: limpo(m.destination) || '—',
    placaCarga,
    modeloCarga,
    placaViatura,
    modeloViatura,
    motorista: limpo(m.driver_name),
    equipe: [limpo(m.agent1), limpo(m.agent2)].filter((n): n is string => Boolean(n)),
    grEspelhamento: limpo(m.gr_espelhamento),
    seNumber: limpo(m.dhl_se_number),
    smNumber: limpo(m.dhl_sm_number),
    referenceNumber: limpo(m.reference_number),
    horarioProgramado: programado,
    horarioFim: limpo(m.end_time),
    kmInicial: km(m.start_km),
    kmFinal: km(m.end_km),
    horaInicialFornecedor: limpo(m.provider_start_time),
    horaFinalFornecedor: limpo(m.provider_end_time),
    kmInicialFornecedor: km(m.provider_start_km),
    kmFinalFornecedor: km(m.provider_end_km),
    criadoEm: limpo(m.created_at),
    atrasoMinutosOrigem,
    historicoEstado: historico.estado,
    consultaOcorrencias: occurrences.estado,
    consultaLogs: logs.estado,
    consultaDiario: diario.estado,
    consultaEvidencias,
    linhaDoTempo: rows
      .filter((h) => h.field_name === 'status' && limpo(h.new_value))
      .map((h) => ({
        quando: String(h.changed_at || ''),
        status: String(h.new_value),
        por: limpo(h.changed_by),
      })),
    atualizacoes,
    origemCoord: posicoes.origemCoord,
    destinoCoord: posicoes.destinoCoord,
    diagnosticoMapa: posicoes.diagnostico,
    historicoCliente: [],
    contaCliente,
    ocorrencias: occurrences.rows
      .filter((o) => limpo(o.description))
      .map((o) => ({
        quando: String(o.created_at || ''),
        texto: String(o.description),
        autor: limpo(o.created_by),
        resolvida: Boolean(o.resolved_at),
      })),
    fotos: fotosProntas,
    tratativaTexto: null,
    narrativaIa: null,
    tratativaIa: null,
    fotosTratativa: [],
    geradoEm: new Date().toISOString(),
  };
}

function escreverHtml(janela: Window, html: string) {
  const arquivo = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(arquivo);
  janela.location.href = url;
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function abrirPlanoAcaoOs(missionId: string): Promise<{ ok: boolean; erro?: string }> {
  const janela = window.open('', '_blank');
  if (!janela) return { ok: false, erro: 'O navegador bloqueou a nova aba. Libere pop-up deste site e tente de novo.' };
  escreverHtml(janela, '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Plano de Ação</title></head><body><p>Montando o plano desta OS...</p></body></html>');
  const dados = await coletarPlanoAcaoOs(missionId);
  if (!dados) {
    escreverHtml(janela, '<!DOCTYPE html><html lang="pt-BR"><body><p>Não foi possível ler os dados desta OS.</p></body></html>');
    return { ok: false, erro: 'Não foi possível ler os dados desta OS.' };
  }
  escreverHtml(janela, buildOsActionPlanHtml(dados));
  return { ok: true };
}
