/** Máscara dd/mm/aaaa enquanto a pessoa digita. */
export function mascaraDataBrasil(valor: string): string {
  const digitos = valor.replace(/\D/g, '').slice(0, 8);
  if (digitos.length <= 2) return digitos;
  if (digitos.length <= 4) return `${digitos.slice(0, 2)}/${digitos.slice(2)}`;
  return `${digitos.slice(0, 2)}/${digitos.slice(2, 4)}/${digitos.slice(4)}`;
}

/** dd/mm/aaaa válido vira yyyy-mm-dd. Data incompleta ou impossível não filtra. */
export function isoDeDataBrasil(valor: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valor.trim());
  if (!match) return '';
  const dia = Number(match[1]);
  const mes = Number(match[2]);
  const ano = Number(match[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || ano < 2000) return '';
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return '';
  return `${match[3]}-${match[2]}-${match[1]}`;
}
