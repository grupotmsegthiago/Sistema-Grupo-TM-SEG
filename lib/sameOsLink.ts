/**
 * Vínculo Mesma OS (mãe ↔ filha).
 * Desvincular: filha vira OS independente (custo próprio volta a ser cobrado).
 */

export type SameOsUnlinkPayload = {
  is_same_os: false;
  parent_mission_id: null;
};

/** Payload para desvincular filha da OS mãe (sem zerar receita). */
export function buildSameOsUnlinkPayload(): SameOsUnlinkPayload {
  return {
    is_same_os: false,
    parent_mission_id: null,
  };
}

export function isSameOsChildMission(mission: {
  is_same_os?: boolean | null;
  parent_mission_id?: string | null;
} | null | undefined): boolean {
  if (!mission) return false;
  return mission.is_same_os === true && !!mission.parent_mission_id;
}
