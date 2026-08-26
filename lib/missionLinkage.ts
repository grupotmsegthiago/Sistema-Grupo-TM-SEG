/**
 * Vínculo Mesma OS (mãe ↔ filhas) — sem filtrar por cliente.
 * Uma OS vinculada deve aparecer no grupo independente do cliente da mãe/filha.
 */

export type LinkedMissionLike = {
  id?: string | null;
  parent_mission_id?: string | null;
  is_same_os?: boolean | null;
  client?: string | null;
  [key: string]: unknown;
};

/** Filha vinculada financeiramente: exige is_same_os=true (parent_mission_id sozinho ≠ mesma OS). */
export function isLinkedChildMission(m: LinkedMissionLike | null | undefined): boolean {
  const pid = String(m?.parent_mission_id || '').trim();
  if (!pid) return false;
  return m?.is_same_os === true;
}

/** Mapa mãe → filhas (qualquer cliente). */
export function buildChildrenByParentId(
  missions: LinkedMissionLike[] | null | undefined,
): Map<string, LinkedMissionLike[]> {
  const map = new Map<string, LinkedMissionLike[]>();
  for (const m of missions || []) {
    if (!isLinkedChildMission(m)) continue;
    const pid = String(m.parent_mission_id || '').trim();
    const arr = map.get(pid) || [];
    arr.push(m);
    map.set(pid, arr);
  }
  return map;
}

/**
 * IDs da família vinculada a partir de um conjunto de OS “âncora”
 * (mãe + todas as filhas + irmãos), sem olhar cliente.
 */
export function collectLinkedFamilyIds(
  anchorIds: Iterable<string>,
  missions: LinkedMissionLike[] | null | undefined,
): Set<string> {
  const byId = new Map<string, LinkedMissionLike>();
  for (const m of missions || []) {
    const id = String(m?.id || '').trim();
    if (id) byId.set(id, m);
  }
  const childrenByParent = buildChildrenByParentId(missions);
  const out = new Set<string>();

  const addFamilyOf = (id: string) => {
    if (!id || out.has(id)) return;
    out.add(id);
    const m = byId.get(id);
    const parentId = m ? String(m.parent_mission_id || '').trim() : '';
    // Se é filha, sobe para a mãe e puxa irmãos
    const root = parentId || id;
    out.add(root);
    for (const child of childrenByParent.get(root) || []) {
      const cid = String(child.id || '').trim();
      if (cid) out.add(cid);
    }
    // Se a âncora é mãe, filhas já entraram; se apontaram para ela como parent
    for (const child of childrenByParent.get(id) || []) {
      const cid = String(child.id || '').trim();
      if (cid) out.add(cid);
    }
  };

  for (const id of anchorIds) addFamilyOf(String(id || '').trim());
  return out;
}

/** IDs de mães/filhas referenciados que ainda não estão no pool local. */
export function missingLinkedMissionIds(
  missions: LinkedMissionLike[] | null | undefined,
  focusIds?: Iterable<string>,
): { missingParentIds: string[]; missingChildParentIds: string[] } {
  const have = new Set(
    (missions || []).map((m) => String(m?.id || '').trim()).filter(Boolean),
  );
  const focus = focusIds ? new Set([...focusIds].map(String)) : null;
  const missingParentIds = new Set<string>();
  const missingChildParentIds = new Set<string>();

  for (const m of missions || []) {
    const id = String(m?.id || '').trim();
    if (focus && !focus.has(id)) continue;
    if (isLinkedChildMission(m)) {
      const pid = String(m.parent_mission_id || '').trim();
      if (pid && !have.has(pid)) missingParentIds.add(pid);
      // Garantir que busquemos todas as irmãs desta mãe
      if (pid) missingChildParentIds.add(pid);
    }
    // Se é potencial mãe (está no foco), buscar filhas mesmo sem is_same_os local
    if (focus && focus.has(id)) {
      missingChildParentIds.add(id);
    }
  }

  return {
    missingParentIds: [...missingParentIds],
    missingChildParentIds: [...missingChildParentIds],
  };
}

export type SameOsLinkRole = 'mother' | 'daughter';

export type SameOsLinkTarget = {
  id: string;
  parent_mission_id?: string | null;
  is_same_os?: boolean | null;
};

/**
 * Resolve quem vira filha e quem vira mãe. Não altera valores financeiros —
 * só valida o par. Filha = is_same_os + parent_mission_id na gravação.
 */
export function resolveSameOsLink(params: {
  currentId: string;
  other: SameOsLinkTarget | null | undefined;
  role: SameOsLinkRole;
  currentIsChild: boolean;
  currentChildCount: number;
}): { ok: true; childId: string; motherId: string } | { ok: false; reason: string } {
  const currentId = String(params.currentId || '').trim();
  const otherId = String(params.other?.id || '').trim();
  if (!currentId) return { ok: false, reason: 'OS atual não identificada.' };
  if (!otherId) return { ok: false, reason: 'Informe a OS para vincular.' };
  if (otherId === currentId) return { ok: false, reason: 'Não é possível vincular a OS a ela mesma.' };

  const otherParent = String(params.other?.parent_mission_id || '').trim();

  if (params.role === 'daughter') {
    if (otherParent) {
      return { ok: false, reason: `A OS ${otherId} já é filha de ${otherParent}. Vincule à mãe ${otherParent}.` };
    }
    if (params.currentChildCount > 0 && !params.currentIsChild) {
      return { ok: false, reason: 'Desvincule as filhas desta OS antes de transformá-la em filha.' };
    }
    return { ok: true, childId: currentId, motherId: otherId };
  }

  if (params.currentIsChild) {
    return { ok: false, reason: 'Esta OS já é filha. Desvincule antes de usá-la como mãe.' };
  }
  if (otherParent && otherParent !== currentId) {
    return { ok: false, reason: `A OS ${otherId} já é filha de ${otherParent}.` };
  }
  return { ok: true, childId: otherId, motherId: currentId };
}
