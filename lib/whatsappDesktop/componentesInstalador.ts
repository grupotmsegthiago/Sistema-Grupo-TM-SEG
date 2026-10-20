/**
 * Aplicativos que o instalador do Grupo TM SEG coloca no Windows
 * quando o operador clica em Avançar.
 * O conector continua em Node. Python entra porque o computador
 * precisa dele para os programas do grupo. O WhatsApp é o aplicativo oficial.
 */

export const COMPONENTES_INSTALADOR = [
  {
    id: 'node',
    nome: 'Node.js',
    pacote: 'OpenJS.NodeJS.LTS',
    motivo: 'Executa o conector do Grupo TM SEG neste computador.',
  },
  {
    id: 'python',
    nome: 'Python',
    pacote: 'Python.Python.3.12',
    motivo: 'Fica instalado para os programas do Grupo TM SEG.',
  },
  {
    id: 'whatsapp',
    nome: 'WhatsApp',
    pacote: 'WhatsApp.WhatsApp',
    motivo: 'Aplicativo oficial usado pela integração.',
  },
] as const;

export type IdComponente = (typeof COMPONENTES_INSTALADOR)[number]['id'];

export type EstadoComponentes = Record<IdComponente, boolean>;

export function argumentosWinget(pacote: string): string[] {
  return [
    'install',
    '--id',
    pacote,
    '-e',
    '--scope',
    'user',
    '--accept-package-agreements',
    '--accept-source-agreements',
    '--disable-interactivity',
  ];
}

export function componentePorId(id: string) {
  return COMPONENTES_INSTALADOR.find((item) => item.id === id) || null;
}

export function resumoInstalacao(estado: EstadoComponentes): string {
  const faltam = COMPONENTES_INSTALADOR.filter((item) => !estado[item.id]).map((item) => item.nome);
  if (faltam.length === 0) return 'Node.js, Python e WhatsApp já estão neste computador.';
  return `Faltam: ${faltam.join(', ')}. Avance para instalar e configurar.`;
}
