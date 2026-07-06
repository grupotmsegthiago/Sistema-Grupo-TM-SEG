import { getDhlIntakeSupabase } from './dhlIntakeSupabase.js';
import { persistEscoltistaCore, persistVehicleCore } from './dhlIntakePersist.js';

const OPERACIONAL_EMAIL = 'operacional@grupotmseg.com.br';

function isDhlMission(clientName: string | null | undefined): boolean {
  if (!clientName) return false;
  const n = String(clientName).toUpperCase();
  return n.includes('DHL SUPPLY CHAIN') || n.includes('DHL LOGISTICS');
}

export async function publicIntakeGet(token: string): Promise<{ status: number; body: any }> {
  try {
    const sb = await getDhlIntakeSupabase();
    const { data: intake } = await sb.from('dhl_supplier_intakes').select('*').eq('token', token).maybeSingle();
    if (!intake) return { status: 404, body: { error: 'Link inválido ou expirado' } };
    if (intake.status === 'cancelado') {
      return { status: 410, body: { error: 'Link cancelado — a OS foi excluída ou cancelada. Solicite um novo link ao Operacional TM Seg.' } };
    }
    if (intake.expires_at && new Date(intake.expires_at) < new Date()) {
      return { status: 410, body: { error: 'Link expirado' } };
    }

    // Registra a abertura do link de forma ATÔMICA via RPC para evitar
    // lost-update em acessos concorrentes (read-modify-write em JS perderia
    // contagem). A função SQL incrementa open_count, atualiza last_opened_at
    // e preenche first_opened_at apenas na 1ª vez — tudo em uma única query.
    try {
      await sb.rpc('dhl_intake_register_open', { p_token: token });
    } catch (e: any) {
      console.error('[DHL Intake] erro ao registrar abertura do link:', e?.message);
    }

    const { data: mission } = await sb.from('missions').select('id, client, provider, origin, destination, start_time, dhl_se_number, status').eq('id', intake.mission_id).maybeSingle();

    const { data: escoltistasProv } = await sb.from('provider_escoltistas')
      .select('*')
      .eq('provider_id', intake.provider_id)
      .order('nome', { ascending: true });

    // Também busca agentes cadastrados na tabela principal `agents` vinculados
    // a este fornecedor (por nome), para que o lookup por CPF na página pública
    // encontre escoltistas já cadastrados no sistema TM Seg mesmo que ainda não
    // tenham passado por nenhum intake. Estes registros vêm SEM id (não
    // pertencem a provider_escoltistas), então no submit serão upserted lá.
    //
    // Match robusto: compara contra `name` E `trading_name` do fornecedor,
    // sem case-sensitivity e ignorando acentos — evita "não achei nada"
    // só porque a grafia divergiu (ex: SEGURANÇA vs SEGURANCA).
    let escoltistasFromAgents: any[] = [];
    const normalize = (s: string) => String(s || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ').trim().toUpperCase();
    const candidateNames = new Set<string>();
    const rawNames: string[] = [];
    if (intake.provider_name) { candidateNames.add(normalize(intake.provider_name)); rawNames.push(String(intake.provider_name)); }
    if (intake.provider_id) {
      try {
        const { data: prov } = await sb.from('providers')
          .select('name, trading_name')
          .eq('id', intake.provider_id)
          .maybeSingle();
        if (prov?.name) { candidateNames.add(normalize(prov.name)); rawNames.push(String(prov.name)); }
        if (prov?.trading_name) { candidateNames.add(normalize(prov.trading_name)); rawNames.push(String(prov.trading_name)); }
      } catch { /* ignore */ }
    }
    if (candidateNames.size > 0 && rawNames.length > 0) {
      // Estreita no banco com OR de ilike (case-insensitive) sobre cada variante do nome
      // do fornecedor — evita varrer a tabela inteira (privacidade + performance) em uma
      // rota pública por token. Depois, normalização JS confirma o match final.
      const escapeIlike = (s: string) => String(s).replace(/[\\,()]/g, '\\$&');
      const orParts = rawNames.map(n => `provider.ilike.${escapeIlike(n)}`).join(',');
      const { data: agentsData } = await sb.from('agents')
        .select('name, cpf, rg, cnh, cnh_validity, cnv, cnv_validity, phone, status, provider, orgao_emissor, cnh_categoria, rua, numero, complemento, bairro, cidade, uf, cep, admissao')
        .or(orParts)
        .neq('status', 'Bloqueado / Ação Trabalhista')
        .order('name', { ascending: true })
        .limit(500);
      const matched = (agentsData || []).filter((a: any) =>
        a.provider && candidateNames.has(normalize(a.provider))
      );
      if ((agentsData || []).length >= 500) {
        console.warn('[DHL Intake] busca de escoltistas atingiu o limite de 500 — considere indexar agents.provider_id.');
      }
      escoltistasFromAgents = matched.map((a: any) => ({
        id: null,
        nome: a.name || '',
        cpf: a.cpf || '',
        rg: a.rg || '',
        orgao_emissor: a.orgao_emissor || '',
        cnh: a.cnh || '',
        cnh_categoria: a.cnh_categoria || '',
        cnh_vencimento: a.cnh_validity || '',
        cnv_numero: a.cnv || '',
        cnv_validade: a.cnv_validity || '',
        rua: a.rua || '',
        numero: a.numero || '',
        complemento: a.complemento || '',
        bairro: a.bairro || '',
        cidade: a.cidade || '',
        uf: a.uf || '',
        cep: a.cep || '',
        celular: a.phone || '',
        admissao: a.admissao || '',
      }));
    }

    // Dedup por CPF — provider_escoltistas tem prioridade
    const seenCpfs = new Set<string>();
    const escoltistas: any[] = [];
    for (const e of (escoltistasProv || [])) {
      const d = String(e.cpf || '').replace(/\D/g, '');
      if (d) seenCpfs.add(d);
      escoltistas.push(e);
    }
    for (const e of escoltistasFromAgents) {
      const d = String(e.cpf || '').replace(/\D/g, '');
      if (!d || seenCpfs.has(d)) continue;
      seenCpfs.add(d);
      escoltistas.push(e);
    }

    const { data: vehicles } = await sb.from('provider_intake_vehicles')
      .select('*')
      .eq('provider_id', intake.provider_id)
      .order('placa', { ascending: true });

    return {
      status: 200,
      body: {
        ok: true,
        intake: {
          token: intake.token,
          status: intake.status,
          submittedAt: intake.submitted_at,
          providerName: intake.provider_name,
        },
        mission: mission || null,
        isDhl: isDhlMission(mission?.client),
        escoltistas: escoltistas || [],
        vehicles: vehicles || [],
        // Progresso parcial + snapshots já salvos, para retomar de onde parou
        // se o fornecedor reabrir o link sem ter finalizado.
        progress: {
          agent1: !!intake.progress_agent1,
          agent2: !!intake.progress_agent2,
          vehicle: !!intake.progress_vehicle,
          mirror: !!intake.progress_mirror,
        },
        snapshots: {
          agent1: intake.agent1_snapshot || null,
          agent2: intake.agent2_snapshot || null,
          vehicle: intake.vehicle_snapshot || null,
          mirrorProofUrl: intake.mirror_proof_url || null,
          mirrorProofFilename: intake.mirror_proof_filename || null,
        },
      },
    };
  } catch (e: any) {
    console.error('[DHL Intake] public-get exception:', e);
    return { status: 500, body: { error: e?.message || 'Erro interno' } };
  }
}

export async function publicIntakeProgress(token: string, body: Record<string, any>): Promise<{ status: number; body: any }> {
  try {
    const sb = await getDhlIntakeSupabase();
    const { data: intake } = await sb.from('dhl_supplier_intakes')
      .select('id, mission_id, provider_id, provider_name, status, expires_at, agent1_snapshot, agent2_snapshot, vehicle_snapshot, mirror_proof_url, mirror_proof_filename, agent1_id, agent2_id, vehicle_id')
      .eq('token', token)
      .maybeSingle();
    if (!intake) return { status: 404, body: { error: 'Link inválido' } };
    if (intake.status === 'cancelado') return { status: 410, body: { error: 'Link cancelado' } };
    if (intake.status === 'preenchido') return { status: 200, body: { ok: true, locked: true } };
    if (intake.expires_at && new Date(intake.expires_at) < new Date()) return { status: 410, body: { error: 'Link expirado' } };

    const patch: Record<string, any> = {};
    const flagMap: Record<string, string> = {
      agent1: 'progress_agent1',
      agent2: 'progress_agent2',
      vehicle: 'progress_vehicle',
      mirror: 'progress_mirror',
    };
    for (const key of Object.keys(flagMap)) {
      if (body[key] === true) patch[flagMap[key]] = true;
    }

    // Persiste escoltista 1 / 2 — best-effort, falha não bloqueia o avanço
    const persistAgent = async (data: any, label: string, slot: 1 | 2) => {
      try {
        const r = await persistEscoltistaCore(sb, intake.provider_id, intake.provider_name || null, data, label);
        patch[slot === 1 ? 'agent1_id' : 'agent2_id'] = r.id;
        patch[slot === 1 ? 'agent1_snapshot' : 'agent2_snapshot'] = r.snap;
        // Atualiza missions.agent1 / agent2 (texto = nome) para o modal já
        // aparecer pré-preenchido e a chip do timeline ficar consistente.
        if (intake.mission_id && r.snap?.nome) {
          const missionPatch: any = {};
          missionPatch[slot === 1 ? 'agent1' : 'agent2'] = r.snap.nome;
          await sb.from('missions').update(missionPatch).eq('id', intake.mission_id);
        }
        return null;
      } catch (e: any) {
        return e?.message || `Erro ao salvar ${label}`;
      }
    };

    if (body.agent1Data) {
      const err = await persistAgent(body.agent1Data, 'Escoltista 1', 1);
      if (err) return { status: 400, body: { error: err } };
    }
    if (body.agent2Data) {
      const err = await persistAgent(body.agent2Data, 'Escoltista 2', 2);
      if (err) return { status: 400, body: { error: err } };
    }
    if (body.vehicleData) {
      try {
        const r = await persistVehicleCore(sb, intake.provider_id, intake.provider_name || null, body.vehicleData);
        patch.vehicle_id = r.id;
        patch.vehicle_snapshot = r.snap;
        // Espelha vehicle_id canônico em missions já no /progress, para que a OS
        // fique pré-vinculada ao veículo cadastrado mesmo antes do submit final.
        if (r.canonicalVehicleId && intake.mission_id) {
          try {
            await sb.from('missions').update({ vehicle_id: r.canonicalVehicleId }).eq('id', intake.mission_id);
          } catch (mErr: any) {
            console.error('[DHL Intake] /progress: falha ao espelhar vehicle_id em missions:', mErr?.message);
          }
        }
      } catch (e: any) {
        return { status: 400, body: { error: e?.message || 'Erro ao salvar veículo' } };
      }
    }
    if (body.mirrorData && body.mirrorData.dataUrl) {
      try {
        const dataUrl: string = String(body.mirrorData.dataUrl);
        const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!m) throw new Error('Print inválido — formato não reconhecido (envie PNG/JPG/PDF).');
        const contentType = m[1];
        const buf = Buffer.from(m[2], 'base64');
        if (buf.length > 8 * 1024 * 1024) throw new Error('Print muito grande — limite de 8 MB.');
        const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf'];
        if (!allowed.includes(contentType.toLowerCase())) throw new Error('Tipo de arquivo não suportado — envie PNG, JPG, WEBP ou PDF.');
        const extMap: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp', 'application/pdf': 'pdf' };
        const ext = extMap[contentType.toLowerCase()] || 'bin';
        const safeOrig = String(body.mirrorData.filename || `espelhamento.${ext}`).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
        const filePath = `dhl-mirror-proof/${intake.mission_id}/${Date.now()}_${safeOrig}`;
        const { error: upErr } = await sb.storage.from('mission-evidence').upload(filePath, buf, { contentType, upsert: false });
        if (upErr) throw new Error('Falha ao salvar o print: ' + upErr.message);
        const { data: urlData } = sb.storage.from('mission-evidence').getPublicUrl(filePath);
        patch.mirror_proof_url = urlData?.publicUrl || null;
        patch.mirror_proof_filename = safeOrig;
      } catch (e: any) {
        return { status: 400, body: { error: e?.message || 'Erro ao processar o print do espelhamento.' } };
      }
    }

    if (Object.keys(patch).length === 0) return { status: 200, body: { ok: true, noop: true } };
    const { error: upErr } = await sb.from('dhl_supplier_intakes').update(patch).eq('token', token);
    if (upErr) {
      console.error('[DHL Intake] progress update error:', upErr.message);
      return { status: 500, body: { error: upErr.message } };
    }
    return {
      status: 200,
      body: {
        ok: true,
        snapshots: {
          agent1: patch.agent1_snapshot ?? intake.agent1_snapshot ?? null,
          agent2: patch.agent2_snapshot ?? intake.agent2_snapshot ?? null,
          vehicle: patch.vehicle_snapshot ?? intake.vehicle_snapshot ?? null,
          mirrorProofUrl: patch.mirror_proof_url ?? intake.mirror_proof_url ?? null,
          mirrorProofFilename: patch.mirror_proof_filename ?? intake.mirror_proof_filename ?? null,
        },
      },
    };
  } catch (e: any) {
    console.error('[DHL Intake] progress exception:', e);
    return { status: 500, body: { error: e?.message || 'Erro interno' } };
  }
}

export async function publicIntakeSubmit(token: string, body: Record<string, any>): Promise<{ status: number; body: any }> {
  try {
    const { agent1, agent2, vehicle, mirrorProof, useExistingMirror } = body || {};
    if (!agent1 || !agent2 || !vehicle) {
      return { status: 400, body: { error: 'Preencha os 3 blocos: Escoltista 1, Escoltista 2 e Veículo.' } };
    }

    const sb = await getDhlIntakeSupabase();
    const { data: intake } = await sb.from('dhl_supplier_intakes').select('*').eq('token', token).maybeSingle();
    if (!intake) return { status: 404, body: { error: 'Link inválido' } };

    // Print pode vir agora OU ter sido salvo num /progress anterior.
    // Quando useExistingMirror=true, exigimos que o intake já tenha um mirror_proof_url.
    const hasExistingMirror = !!intake.mirror_proof_url;
    if (!useExistingMirror && (!mirrorProof || !mirrorProof.dataUrl)) {
      return { status: 400, body: { error: 'Anexe o print do espelhamento (comprovante de que foi realizado) antes de enviar.' } };
    }
    if (useExistingMirror && !hasExistingMirror) {
      return { status: 400, body: { error: 'Print do espelhamento não localizado nesta sessão — anexe novamente.' } };
    }
    if (intake.status === 'cancelado') {
      return { status: 410, body: { error: 'Link cancelado — a OS foi excluída ou cancelada. Solicite um novo link ao Operacional TM Seg.' } };
    }
    if (intake.expires_at && new Date(intake.expires_at) < new Date()) {
      return { status: 410, body: { error: 'Link expirado' } };
    }
    if (intake.status === 'preenchido') {
      // permitido reenviar, mas avisa
    }

    const providerId = intake.provider_id;

    // Validação estrita do submit final (campos obrigatórios completos).
    // O persistEscoltistaCore só exige nome+CPF; aqui exigimos o restante.
    const validateAgentForSubmit = (a: any, label: string): string | null => {
      const required: [string, string][] = [
        ['nome', 'Nome'], ['cpf', 'CPF'], ['rg', 'RG'], ['orgao_emissor', 'Órgão emis./UF'],
        ['cnv_numero', 'CNV Número'], ['cnv_validade', 'Validade CNV'],
        ['celular', 'Celular'],
        ['rua', 'Rua'], ['numero', 'Número'], ['bairro', 'Bairro'],
        ['cidade', 'Cidade'], ['uf', 'UF'], ['cep', 'CEP'],
        ['admissao', 'Admissão'],
      ];
      const camelOf = (snake: string) => snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      const pick = (k: string) => {
        const camel = camelOf(k);
        const v = (a as any)[k] ?? (a as any)[camel];
        return v === undefined || v === null ? '' : String(v).trim();
      };
      for (const [k, lbl] of required) {
        if (!pick(k)) return `${label}: ${lbl} é obrigatório`;
      }
      return null;
    };
    const validateVehicleForSubmit = (v: any): string | null => {
      if (v?.id) return null;
      const vReq: [string, string][] = [
        ['placa', 'Placa'], ['marca', 'Marca'], ['modelo', 'Modelo'],
        ['tecnologia', 'Tecnologia'],
      ];
      for (const [k, lbl] of vReq) {
        if (!v[k] || String(v[k]).trim() === '') return `Veículo: ${lbl} é obrigatório`;
      }
      return null;
    };

    // Impede Escoltista 1 == Escoltista 2 (mesmo registro escolhido ou mesmo CPF digitado)
    if (agent1?.id && agent2?.id && agent1.id === agent2.id) {
      return { status: 400, body: { error: 'Escoltista 1 e Escoltista 2 não podem ser o mesmo registro.' } };
    }
    const cpf1 = String(agent1?.cpf || '').replace(/\D/g, '');
    const cpf2 = String(agent2?.cpf || '').replace(/\D/g, '');
    if (!agent1?.id && !agent2?.id && cpf1 && cpf1 === cpf2) {
      return { status: 400, body: { error: 'Escoltista 1 e Escoltista 2 não podem ter o mesmo CPF.' } };
    }

    // Regra cruzada de CNH: PELO MENOS UM dos escoltistas precisa ter CNH e
    // Vencimento CNH preenchidos. Bloqueia somente quando AMBOS estiverem sem.
    const cnhStr = (a: any, k: string) => {
      const v = a?.[k] ?? a?.[k.replace(/_([a-z])/g, (_: any, c: string) => c.toUpperCase())];
      return v === undefined || v === null ? '' : String(v).trim();
    };
    const a1HasCnh = !!cnhStr(agent1, 'cnh') && !!cnhStr(agent1, 'cnh_vencimento');
    const a2HasCnh = !!cnhStr(agent2, 'cnh') && !!cnhStr(agent2, 'cnh_vencimento');
    if (!a1HasCnh && !a2HasCnh) {
      return {
        status: 400,
        body: {
          error: 'Pelo menos UM dos escoltistas precisa ter CNH e Vencimento da CNH preenchidos.',
        },
      };
    }
    // Coerência por escoltista: se preencheu qualquer campo do bloco CNH,
    // tem que preencher todos (número, categoria, vencimento).
    const checkCnhBlock = (a: any, label: string): string | null => {
      const num = cnhStr(a, 'cnh');
      const cat = cnhStr(a, 'cnh_categoria');
      const val = cnhStr(a, 'cnh_vencimento');
      if (!num && !cat && !val) return null;
      if (!num) return `${label}: informe o número da CNH.`;
      if (!val) return `${label}: informe o Vencimento da CNH.`;
      if (!cat) return `${label}: informe a Categoria da CNH.`;
      return null;
    };
    const cnhErr = checkCnhBlock(agent1, 'Escoltista 1') || checkCnhBlock(agent2, 'Escoltista 2');
    if (cnhErr) return { status: 400, body: { error: cnhErr } };

    // Validação completa dos blocos para o submit FINAL (campos obrigatórios).
    const v1Err = validateAgentForSubmit(agent1, 'Escoltista 1');
    if (v1Err) return { status: 400, body: { error: v1Err } };
    const v2Err = validateAgentForSubmit(agent2, 'Escoltista 2');
    if (v2Err) return { status: 400, body: { error: v2Err } };
    const vvErr = validateVehicleForSubmit(vehicle);
    if (vvErr) return { status: 400, body: { error: vvErr } };

    let a1, a2, vh;
    try {
      a1 = await persistEscoltistaCore(sb, providerId, intake.provider_name || null, agent1, 'Escoltista 1');
      a2 = await persistEscoltistaCore(sb, providerId, intake.provider_name || null, agent2, 'Escoltista 2');
      vh = await persistVehicleCore(sb, providerId, intake.provider_name || null, vehicle);
    } catch (e: any) {
      return { status: 400, body: { error: e?.message || 'Dados inválidos' } };
    }
    // Espelha o nome dos agentes em missions.agent1/agent2 e o vehicle_id canônico
    // (vindo do espelhamento na tabela `vehicles`) para que a OS já fique vinculada
    // ao veículo cadastrado, sem precisar do operacional reabrir e selecionar.
    try {
      if (intake.mission_id) {
        const missionPatch: any = {
          agent1: a1.snap?.nome || null,
          agent2: a2.snap?.nome || null,
        };
        if (vh?.canonicalVehicleId) missionPatch.vehicle_id = vh.canonicalVehicleId;
        await sb.from('missions').update(missionPatch).eq('id', intake.mission_id);
      }
    } catch (e: any) {
      console.error('[DHL Intake] falha ao espelhar agent1/agent2/vehicle_id em missions:', e?.message);
    }
    // Pós-persistência: garante que se um foi novo e outro selecionado, IDs ainda diferem
    if (a1.id === a2.id) {
      return { status: 400, body: { error: 'Escoltista 1 e Escoltista 2 não podem ser o mesmo registro.' } };
    }

    // Upload do print do espelhamento → bucket mission-evidence/dhl-mirror-proof/<missionId>/
    // Se o fornecedor já enviou o print numa etapa anterior (/progress) e
    // marcou useExistingMirror, reutilizamos o que está salvo no intake.
    let mirrorProofUrl: string | null = null;
    let mirrorProofFilename: string | null = null;
    if (useExistingMirror) {
      mirrorProofUrl = intake.mirror_proof_url || null;
      mirrorProofFilename = intake.mirror_proof_filename || null;
    } else try {
      const dataUrl: string = String(mirrorProof.dataUrl);
      const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!m) throw new Error('Print inválido — formato não reconhecido (envie PNG/JPG/PDF).');
      const contentType = m[1];
      const buf = Buffer.from(m[2], 'base64');
      if (buf.length > 8 * 1024 * 1024) throw new Error('Print muito grande — limite de 8 MB.');
      const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf'];
      if (!allowed.includes(contentType.toLowerCase())) throw new Error('Tipo de arquivo não suportado — envie PNG, JPG, WEBP ou PDF.');
      const extMap: Record<string,string> = { 'image/png':'png','image/jpeg':'jpg','image/jpg':'jpg','image/webp':'webp','application/pdf':'pdf' };
      const ext = extMap[contentType.toLowerCase()] || 'bin';
      const safeOrig = String(mirrorProof.filename || `espelhamento.${ext}`).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
      const filePath = `dhl-mirror-proof/${intake.mission_id}/${Date.now()}_${safeOrig}`;
      const { error: upErr } = await sb.storage.from('mission-evidence').upload(filePath, buf, { contentType, upsert: false });
      if (upErr) throw new Error('Falha ao salvar o print: ' + upErr.message);
      const { data: urlData } = sb.storage.from('mission-evidence').getPublicUrl(filePath);
      mirrorProofUrl = urlData?.publicUrl || null;
      mirrorProofFilename = safeOrig;
    } catch (e: any) {
      return { status: 400, body: { error: e?.message || 'Erro ao processar o print do espelhamento.' } };
    }

    await sb.from('dhl_supplier_intakes').update({
      status: 'preenchido',
      agent1_id: a1.id,
      agent2_id: a2.id,
      vehicle_id: vh.id,
      agent1_snapshot: a1.snap,
      agent2_snapshot: a2.snap,
      vehicle_snapshot: vh.snap,
      mirror_proof_url: mirrorProofUrl,
      mirror_proof_filename: mirrorProofFilename,
      submitted_at: new Date().toISOString(),
    }).eq('token', token);

    // Notifica operacional
    try {
      const { sendDhlIntakeSubmittedEmail } = await import('../../server/emailService.js');
      const { data: mission } = await sb.from('missions').select('*').eq('id', intake.mission_id).maybeSingle();
      await sendDhlIntakeSubmittedEmail({
        to: OPERACIONAL_EMAIL,
        providerName: intake.provider_name || '—',
        osNumber: intake.mission_id,
        seNumber: mission?.dhl_se_number || '—',
        origin: mission?.origin || '—',
        destination: mission?.destination || '—',
        scheduledAt: mission?.start_time ? new Date(mission.start_time).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—',
        agent1: a1.snap,
        agent2: a2.snap,
        vehicle: vh.snap,
        mirrorProofUrl,
        mirrorProofFilename,
        isDhl: isDhlMission(mission?.client),
      });
    } catch (e: any) {
      console.error('[DHL Intake] erro ao notificar operacional:', e?.message);
    }

    return { status: 200, body: { ok: true, message: 'Dados recebidos com sucesso.' } };
  } catch (e: any) {
    console.error('[DHL Intake] submit exception:', e);
    return { status: 500, body: { error: e?.message || 'Erro interno' } };
  }
}
