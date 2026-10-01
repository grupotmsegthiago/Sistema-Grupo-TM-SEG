/**
 * Política de performance do Salvar/Aprovar no MissionFinancialModal.
 *
 * O gargalo era o html2canvas + INSERT de JPEG base64 em system_logs
 * (APPROVAL_SCREENSHOT). A captura travava o Chrome na aprovação e, ao
 * reabrir a OS, o histórico baixava o print inteiro.
 *
 * Caminho atual:
 * 1) UPDATE missions (+ logs essenciais de aprovação/ajuste)
 * 2) Histórico só em texto: dia / horário · login > alteração
 * A captura de tela na aprovação está desligada.
 */

/** Captura de print desligada — aprovação e salvamento não fotografam o modal. */
export function shouldCaptureApprovalScreenshot(_approve: boolean): boolean {
  return false;
}
