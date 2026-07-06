// Coerência do bloco CNH por agente: se algum campo de CNH foi preenchido,
// exige TODOS os três (número, categoria, vencimento).
export function checkCnhBlockCoherence(a: any, label: string): string | null {
  const get = (k: string) => {
    const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const v = a?.[k] ?? a?.[camel];
    return v === undefined || v === null ? '' : String(v).trim();
  };
  const num = get('cnh');
  const cat = get('cnh_categoria');
  const val = get('cnh_vencimento');
  if (!num && !cat && !val) return null;
  if (!num) return `${label}: informe o número da CNH.`;
  if (!val) return `${label}: informe o Vencimento da CNH.`;
  if (!cat) return `${label}: informe a Categoria da CNH.`;
  return null;
}

// Persiste o escoltista em provider_escoltistas (upsert por CPF) e espelha
// no cadastro principal `agents` (insert se não existe; patch "fill empty
// only" se existe). Faz validação MÍNIMA — quem chama (handler) decide o
// nível de exigência restante.
export async function persistEscoltistaCore(
  sb: any,
  providerId: string,
  providerName: string | null,
  a: any,
  label: string,
): Promise<{ id: string; snap: any }> {
  // Anti-IDOR: se veio com id, valida ownership
  let existingById: any = null;
  if (a.id) {
    const { data } = await sb.from('provider_escoltistas')
      .select('*')
      .eq('id', a.id)
      .eq('provider_id', providerId)
      .maybeSingle();
    if (!data) throw new Error(`${label}: registro selecionado não pertence ao fornecedor desta OS`);
    existingById = data;
  }

  // Coerência do bloco CNH (vale em qualquer fluxo)
  const cnhErr = checkCnhBlockCoherence(a, label);
  if (cnhErr) throw new Error(cnhErr);

  // Mínimo absoluto: nome e CPF válido (necessários para upsert por CPF)
  const nome = String(a.nome || '').trim();
  if (!nome) throw new Error(`${label}: Nome é obrigatório`);
  const cpfDigits = String(a.cpf || '').replace(/\D/g, '');
  if (cpfDigits.length !== 11) throw new Error(`${label}: CPF inválido`);

  const payload: any = {
    provider_id: providerId,
    nome,
    // Persiste CPF normalizado (somente dígitos) para evitar duplicidade
    // por formatação. Lookups abaixo também usam dígitos.
    cpf: cpfDigits,
    rg: a.rg || null,
    orgao_emissor: a.orgaoEmissor || a.orgao_emissor || null,
    cnh: a.cnh || null,
    cnh_categoria: a.cnhCategoria || a.cnh_categoria || null,
    cnh_vencimento: a.cnhVencimento || a.cnh_vencimento || null,
    cnv_numero: a.cnvNumero || a.cnv_numero || null,
    cnv_validade: a.cnvValidade || a.cnv_validade || null,
    rua: a.rua || null,
    numero: a.numero || null,
    complemento: a.complemento || null,
    bairro: a.bairro || null,
    cidade: a.cidade || null,
    uf: a.uf || null,
    cep: a.cep || null,
    celular: a.celular || null,
    admissao: a.admissao || null,
  };

  // Lookup por dígitos do CPF (formato canônico). Como fallback, também
  // checa o formato mascarado para detectar registros legados criados antes
  // da normalização.
  const cpfMasked = String(a.cpf || '');
  let existingByCpf: any = null;
  if (!existingById) {
    const byDigits = await sb.from('provider_escoltistas').select('*').eq('provider_id', providerId).eq('cpf', cpfDigits).maybeSingle();
    existingByCpf = byDigits.data || null;
    if (!existingByCpf && cpfMasked && cpfMasked !== cpfDigits) {
      const byMasked = await sb.from('provider_escoltistas').select('*').eq('provider_id', providerId).eq('cpf', cpfMasked).maybeSingle();
      existingByCpf = byMasked.data || null;
    }
  }
  const existing = existingById || existingByCpf;
  let resultId: string;
  let resultSnap: any;
  if (existing) {
    // "fill empty only": não sobrescreve dados já refinados pelo operacional.
    const patch: any = {};
    for (const k of Object.keys(payload)) {
      const cur = (existing as any)[k];
      const incoming = (payload as any)[k];
      if ((cur === null || cur === undefined || String(cur).trim() === '') && incoming) {
        patch[k] = incoming;
      }
    }
    if (Object.keys(patch).length > 0) {
      patch.updated_at = new Date().toISOString();
      await sb.from('provider_escoltistas').update(patch).eq('id', existing.id);
    }
    const { data: row } = await sb.from('provider_escoltistas').select('*').eq('id', existing.id).single();
    resultId = existing.id;
    resultSnap = row;
  } else {
    const { data: ins, error: insErr } = await sb.from('provider_escoltistas').insert([payload]).select().single();
    if (insErr) throw new Error('Erro ao salvar escoltista: ' + insErr.message);
    resultId = ins.id;
    resultSnap = ins;
  }

  // Espelhamento na tabela principal `agents` — best-effort (não bloqueia).
  try {
    const cols = 'id, name, cpf, rg, cnh, cnh_validity, cnv, cnv_validity, phone, provider, orgao_emissor, cnh_categoria, rua, numero, complemento, bairro, cidade, uf, cep, admissao';
    // Procura por CPF digits e, em fallback, pelo formato mascarado (legado).
    let agentRow: any = (await sb.from('agents').select(cols).eq('cpf', cpfDigits).maybeSingle()).data || null;
    if (!agentRow && cpfMasked && cpfMasked !== cpfDigits) {
      agentRow = (await sb.from('agents').select(cols).eq('cpf', cpfMasked).maybeSingle()).data || null;
    }

    const agentPayload: any = {
      name: payload.nome,
      cpf: payload.cpf,
      rg: payload.rg,
      cnh: payload.cnh,
      cnh_validity: payload.cnh_vencimento,
      cnv: payload.cnv_numero,
      cnv_validity: payload.cnv_validade,
      phone: payload.celular,
      orgao_emissor: payload.orgao_emissor,
      cnh_categoria: payload.cnh_categoria,
      rua: payload.rua,
      numero: payload.numero,
      complemento: payload.complemento,
      bairro: payload.bairro,
      cidade: payload.cidade,
      uf: payload.uf,
      cep: payload.cep,
      admissao: payload.admissao,
    };

    if (agentRow) {
      const patch: any = {};
      for (const k of Object.keys(agentPayload)) {
        const cur = (agentRow as any)[k];
        if ((cur === null || cur === undefined || String(cur).trim() === '') && agentPayload[k]) {
          patch[k] = agentPayload[k];
        }
      }
      if (Object.keys(patch).length > 0) {
        const { error: updErr } = await sb.from('agents').update(patch).eq('id', agentRow.id);
        if (updErr) console.error('[DHL Intake] falha ao espelhar em agents (update):', updErr.message);
      }
    } else {
      const insAgent: any = {
        ...agentPayload,
        provider: providerName || null,
        role: 'Vigilante',
        status: 'Ativo',
      };
      const { error: insAgentErr } = await sb.from('agents').insert([insAgent]);
      if (insAgentErr) console.error('[DHL Intake] falha ao espelhar em agents (insert):', insAgentErr.message);
    }
  } catch (mirrorErr: any) {
    console.error('[DHL Intake] exceção ao espelhar em agents:', mirrorErr?.message);
  }

  return { id: resultId, snap: resultSnap };
}

// Persiste o veículo em provider_intake_vehicles (upsert por placa do
// fornecedor). Validação mínima: placa não vazia. Quem chama exige o resto.
// Espelha o veículo do intake na tabela canônica `vehicles` (cadastro principal),
// para que apareça automaticamente no dropdown da OS e possa ser vinculado como
// vehicle_id da mission. Retorna o id de `vehicles` (não o de provider_intake_vehicles).
export async function mirrorIntakeVehicleToCanonical(
  sb: any,
  providerName: string | null,
  snap: any,
): Promise<string | null> {
  try {
    if (!providerName) return null;
    const placa = String(snap?.placa || '').toUpperCase().replace(/\s/g, '');
    if (!placa) return null;
    const trackerType = snap?.tecnologia ? String(snap.tecnologia).toUpperCase() : null;
    const trackerId = snap?.id_rastreador ? String(snap.id_rastreador).toUpperCase() : null;
    const payload: any = {
      plate: placa,
      brand: snap?.marca ? String(snap.marca).toUpperCase() : '',
      model: snap?.modelo ? String(snap.modelo).toUpperCase() : '',
      year: snap?.ano ? String(snap.ano) : '',
      provider: providerName,
      status: 'Ativo',
      color: snap?.cor ? String(snap.cor).toUpperCase() : '',
      tracker_type: trackerType,
      tracker_id: trackerId,
      renavam: snap?.renavam ? String(snap.renavam).replace(/\D+/g, '') : null,
      comunicacao: snap?.comunicacao ? String(snap.comunicacao).toUpperCase() : null,
    };
    // Upsert por placa (placa é única no cadastro principal). Provider mismatch:
    // NÃO retorna o id existente — devolve null para que a OS não fique vinculada
    // a um veículo de outro fornecedor (o filtro do dropdown esconderia o item).
    const { data: existing } = await sb.from('vehicles').select('id, provider').eq('plate', placa).maybeSingle();
    if (existing) {
      const sameProvider = !existing.provider || String(existing.provider).trim().toUpperCase() === providerName.toUpperCase();
      if (!sameProvider) {
        console.warn(`[DHL Intake] placa ${placa} já cadastrada para outro fornecedor (${existing.provider}); ignorando espelhamento canônico.`);
        return null;
      }
      await sb.from('vehicles').update(payload).eq('id', existing.id);
      return String(existing.id);
    }
    // Insert com fallback atômico para corrida: se a unique de plate disparar,
    // refaz a consulta e retorna o id já existente em vez de devolver null.
    const { data: ins, error: insErr } = await sb.from('vehicles').insert([payload]).select('id').single();
    if (insErr) {
      const msg = String(insErr.message || '').toLowerCase();
      const isUnique = msg.includes('duplicate') || msg.includes('unique') || (insErr as any).code === '23505';
      if (isUnique) {
        const { data: again } = await sb.from('vehicles').select('id, provider').eq('plate', placa).maybeSingle();
        if (again) {
          const sameProvider = !again.provider || String(again.provider).trim().toUpperCase() === providerName.toUpperCase();
          return sameProvider ? String(again.id) : null;
        }
      }
      console.error('[DHL Intake] mirror vehicles insert falhou:', insErr.message);
      return null;
    }
    return ins?.id ? String(ins.id) : null;
  } catch (e: any) {
    console.error('[DHL Intake] mirror vehicles exception:', e?.message || e);
    return null;
  }
}

export async function persistVehicleCore(sb: any, providerId: string, providerName: string | null, v: any): Promise<{ id: string; snap: any; canonicalVehicleId: string | null }> {
  if (v.id) {
    const { data } = await sb.from('provider_intake_vehicles')
      .select('*')
      .eq('id', v.id)
      .eq('provider_id', providerId)
      .maybeSingle();
    if (data) {
      const canonicalVehicleId = await mirrorIntakeVehicleToCanonical(sb, providerName, data);
      return { id: data.id, snap: data, canonicalVehicleId };
    }
    throw new Error('Veículo: registro selecionado não pertence ao fornecedor desta OS');
  }
  const placa = String(v.placa || '').toUpperCase().replace(/\s/g, '');
  if (!placa) throw new Error('Veículo: Placa é obrigatória');
  const payload: any = {
    provider_id: providerId,
    placa,
    renavam: v.renavam || null,
    marca: v.marca || null,
    ano: v.ano || null,
    modelo: v.modelo || null,
    cor: v.cor || null,
    tecnologia: v.tecnologia || null,
    id_rastreador: v.idRastreador || v.id_rastreador || null,
    comunicacao: v.comunicacao || null,
  };
  const { data: existing } = await sb.from('provider_intake_vehicles').select('id').eq('provider_id', providerId).eq('placa', placa).maybeSingle();
  let intakeRow: any;
  if (existing) {
    await sb.from('provider_intake_vehicles').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', existing.id);
    const { data: row } = await sb.from('provider_intake_vehicles').select('*').eq('id', existing.id).single();
    intakeRow = row;
  } else {
    const { data: ins, error: insErr } = await sb.from('provider_intake_vehicles').insert([payload]).select().single();
    if (insErr) throw new Error('Erro ao salvar veículo: ' + insErr.message);
    intakeRow = ins;
  }
  const canonicalVehicleId = await mirrorIntakeVehicleToCanonical(sb, providerName, intakeRow);
  return { id: intakeRow.id, snap: intakeRow, canonicalVehicleId };
}
