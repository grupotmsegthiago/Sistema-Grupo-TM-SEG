// Regras de espelhamento DHL — por tecnologia de rastreador.
// Fonte única de verdade usada na página pública do fornecedor (intake DHL)
// e no e-mail enviado ao fornecedor.
export type DhlMirrorRule = {
  techs: string[];
  title: string;
  body: string;
};

export const DHL_MIRROR_RULES: DhlMirrorRule[] = [
  {
    techs: ['OMNILINK'],
    title: 'OMNILINK',
    body:
      'DHL SUPPLY CHAIN — CNPJ 00.233.065/0001-87 — IP 131.255.103.146 — Porta 9001. ' +
      'Obrigatório anexar a ficha de ativação quando o veículo possuir rastreador Omnilink instalado.',
  },
  {
    techs: ['SASCAR'],
    title: 'SASCAR',
    body:
      'Portal Sascar → Serviços → Direcionamento de Sinal. No campo Gerenciadora, ' +
      'inserir conta: DHL LOGISTICS (BRASIL) LTDA (FILIAL) – RASTREAMENTO.',
  },
  {
    techs: ['ONIXSAT', 'JABURSAT'],
    title: 'ONIXSAT / JABURSAT',
    body:
      'Espelhar sinal para Central Unidocks/DHL — CNPJ 00.233.065/0001-87. ' +
      'Onixsat → Menu ADM → Espelhamento → Espelhamento de Equipamento. ' +
      'Alternativa: telefone (43) 3371-3700.',
  },
  {
    techs: ['SIGHRA'],
    title: 'SIGHRA',
    body:
      'Se possuir o software Sighra: opção Filas do Veículo. Se não, enviar e-mail para ' +
      'suporte@sighra.com.br com placa + ID do veículo + conta DHL LOGISTICS (BRASIL).',
  },
  {
    techs: ['AUTOTRAC'],
    title: 'AUTOTRAC',
    body:
      'Supervisor Web → botão direito no veículo → Roteamento → Inserir roteamento express. ' +
      'Companhia: DHL (validar companhia). Perfil: (Perfil Normal) Retorno Completo (sem cópia).',
  },
];

export function findDhlMirrorRule(tecnologia: string | null | undefined): DhlMirrorRule | null {
  const t = String(tecnologia || '').trim().toUpperCase();
  if (!t) return null;
  return DHL_MIRROR_RULES.find((r) => r.techs.includes(t)) || null;
}
