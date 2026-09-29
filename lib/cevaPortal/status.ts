/** Mesmas cores dos cartões de status da lista de OS do sistema. */
const CORES: Record<string, string> = {
  pendente: 'bg-gray-500 text-white',
  solicitada: 'bg-orange-500 text-white',
  documentacao: 'bg-blue-400 text-white',
  agendada: 'bg-yellow-500 text-white',
  origem: 'bg-indigo-500 text-white',
  'em viagem': 'bg-purple-600 text-white',
  concluida: 'bg-green-600 text-white',
  cancelada: 'bg-red-600 text-white',
  recusada: 'bg-red-800 text-white',
};

function chaveStatus(status: string): string {
  return status
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function classeStatusSistema(status: string): string {
  return CORES[chaveStatus(status)] || 'bg-gray-500 text-white';
}
