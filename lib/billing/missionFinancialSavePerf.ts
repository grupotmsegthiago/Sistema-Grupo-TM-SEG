/**
 * Política de performance do Salvar/Aprovar no MissionFinancialModal.
 *
 * O gargalo histórico era: html2canvas + INSERT de JPEG base64 em system_logs
 * ANTES do UPDATE em missions — o spinner ficava preso vários segundos sem gravar
 * receita/custo/aprovação.
 *
 * Ordem correta do caminho crítico:
 * 1) UPDATE missions (+ logs essenciais de aprovação/ajuste)
 * 2) Captura DOM do print (só em Aprovar; modal ainda aberto)
 * 3) Persistência do print e demais side-effects em background (fail-soft)
 */

/** Print de auditoria só na aprovação — Salvar Ajustes não precisa travar o UI. */
export function shouldCaptureApprovalScreenshot(approve: boolean): boolean {
  return approve === true;
}
