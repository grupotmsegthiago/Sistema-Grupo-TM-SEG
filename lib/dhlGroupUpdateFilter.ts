// ── Filtro DHL: o grupo do cliente só recebe situações-chave ────────────────
// Pedido do cliente DHL: informar apenas CHEGADA NA ORIGEM, INÍCIO DE MISSÃO,
// FIM DE MISSÃO, INÍCIO/REINÍCIO DE PERNOITE e situações atípicas (veículo
// bloqueado, acidente etc). Atualizações rotineiras de monitoramento (posição,
// "segue viagem normal") NÃO vão para o grupo — só ficam no sistema.
// O fim de missão segue pelo fluxo próprio de conclusão (não passa por aqui).

import { MissionStatus } from '../types';

// Lista SEM acentos — a ocorrência é normalizada (remove diacríticos) antes
// da comparação, então "VEÍCULO"/"VEICULO", "EMERGÊNCIA"/"EMERGENCIA" etc.
// casam sempre, independente de como o operador digitar.
const DHL_ATYPICAL_KEYWORDS = [
    'BLOQUEAD', 'BLOQUEIO', 'ACIDENTE', 'ASSALTO', 'ROUBO', 'FURTO', 'SINISTRO',
    'PANE', 'EMERG', 'POLICIA', 'ABORDAGEM', 'APREEN', 'RETID',
    'FISCALIZA', 'SOCORRO', 'QUEBR', 'DEFEITO', 'ATIPIC', 'SUSPEIT',
    'TENTATIVA', 'EXTRAVIO', 'DESVIO DE ROTA', 'PARADA NAO PROGRAMADA',
];

// Remove acentos/diacríticos e coloca em maiúsculas para comparação robusta.
const normalize = (s: string): string =>
    (s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function shouldSendDhlGroupUpdate(opts: {
    finalStatus: string;
    originalStatus: string;
    occurrence: string;
    previousOccurrence: string;
}): boolean {
    const { finalStatus, originalStatus } = opts;
    const occ = normalize(opts.occurrence);
    const prev = normalize(opts.previousOccurrence);
    const statusChanged = finalStatus !== originalStatus;
    // Marcos operacionais: chegada na origem, início de missão. Cancelamento
    // conta como situação atípica.
    if (statusChanged && (
        finalStatus === MissionStatus.ORIGIN ||
        finalStatus === MissionStatus.IN_TRANSIT ||
        finalStatus === MissionStatus.CANCELLED
    )) return true;
    // Pernoite: envia o INÍCIO (primeira menção) e o REINÍCIO/FIM; as
    // atualizações repetidas DURANTE o pernoite não vão para o grupo.
    if (occ.includes('PERNOITE')) {
        if (/REINICIO|RETOMAD|FIM|SAIND|SAID|ENCERRA/.test(occ)) return true;
        return !prev.includes('PERNOITE');
    }
    // Situações atípicas por palavra-chave na ocorrência.
    return DHL_ATYPICAL_KEYWORDS.some(k => occ.includes(k));
}
