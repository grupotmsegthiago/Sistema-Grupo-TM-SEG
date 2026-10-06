/** Distâncias em linha reta para o texto da DHL. "Cerca de" porque não é rota de estrada. */

type Ponto = { nome: string; lat: number; lng: number };
type Cidade = Ponto & { uf: string };
type Aeroporto = Ponto & { codigo: string };

const CAPITAL: Record<string, Ponto> = {
  AC: { nome: 'Rio Branco', lat: -9.9754, lng: -67.8249 },
  AL: { nome: 'Maceió', lat: -9.6498, lng: -35.7089 },
  AM: { nome: 'Manaus', lat: -3.1190, lng: -60.0217 },
  AP: { nome: 'Macapá', lat: 0.0356, lng: -51.0705 },
  BA: { nome: 'Salvador', lat: -12.9777, lng: -38.5016 },
  CE: { nome: 'Fortaleza', lat: -3.7319, lng: -38.5267 },
  DF: { nome: 'Brasília', lat: -15.7939, lng: -47.8828 },
  ES: { nome: 'Vitória', lat: -20.3155, lng: -40.3128 },
  GO: { nome: 'Goiânia', lat: -16.6869, lng: -49.2648 },
  MA: { nome: 'São Luís', lat: -2.5387, lng: -44.2825 },
  MG: { nome: 'Belo Horizonte', lat: -19.9167, lng: -43.9345 },
  MS: { nome: 'Campo Grande', lat: -20.4697, lng: -54.6201 },
  MT: { nome: 'Cuiabá', lat: -15.6014, lng: -56.0979 },
  PA: { nome: 'Belém', lat: -1.4558, lng: -48.4902 },
  PB: { nome: 'João Pessoa', lat: -7.1195, lng: -34.8450 },
  PE: { nome: 'Recife', lat: -8.0476, lng: -34.8770 },
  PI: { nome: 'Teresina', lat: -5.0892, lng: -42.8019 },
  PR: { nome: 'Curitiba', lat: -25.4284, lng: -49.2733 },
  RN: { nome: 'Natal', lat: -5.7793, lng: -35.2009 },
  RO: { nome: 'Porto Velho', lat: -8.7612, lng: -63.9004 },
  RR: { nome: 'Boa Vista', lat: 2.8235, lng: -60.6758 },
  RS: { nome: 'Porto Alegre', lat: -30.0346, lng: -51.2177 },
  SC: { nome: 'Florianópolis', lat: -27.5954, lng: -48.5480 },
  SE: { nome: 'Aracaju', lat: -10.9472, lng: -37.0731 },
  TO: { nome: 'Palmas', lat: -10.2491, lng: -48.3243 },
};

const AEROPORTOS: Aeroporto[] = [
  { nome: 'Rio Branco', codigo: 'RBR', lat: -9.8689, lng: -67.8981 },
  { nome: 'Maceió', codigo: 'MCZ', lat: -9.5108, lng: -35.7917 },
  { nome: 'Manaus', codigo: 'MAO', lat: -3.0386, lng: -60.0497 },
  { nome: 'Macapá', codigo: 'MCP', lat: 0.0507, lng: -51.0722 },
  { nome: 'Salvador', codigo: 'SSA', lat: -12.9086, lng: -38.3225 },
  { nome: 'Ilhéus', codigo: 'IOS', lat: -14.8159, lng: -39.0332 },
  { nome: 'Porto Seguro', codigo: 'BPS', lat: -16.4386, lng: -39.0809 },
  { nome: 'Vitória da Conquista', codigo: 'VDC', lat: -14.8628, lng: -40.8631 },
  { nome: 'Fortaleza', codigo: 'FOR', lat: -3.7763, lng: -38.5326 },
  { nome: 'Juazeiro do Norte', codigo: 'JDO', lat: -7.2190, lng: -39.2701 },
  { nome: 'Brasília', codigo: 'BSB', lat: -15.8711, lng: -47.9186 },
  { nome: 'Vitória', codigo: 'VIX', lat: -20.2581, lng: -40.2864 },
  { nome: 'Goiânia', codigo: 'GYN', lat: -16.6320, lng: -49.2206 },
  { nome: 'São Luís', codigo: 'SLZ', lat: -2.5854, lng: -44.2341 },
  { nome: 'Imperatriz', codigo: 'IMP', lat: -5.5313, lng: -47.4600 },
  { nome: 'Confins', codigo: 'CNF', lat: -19.6244, lng: -43.9719 },
  { nome: 'Pampulha', codigo: 'PLU', lat: -19.8512, lng: -43.9506 },
  { nome: 'Uberlândia', codigo: 'UDI', lat: -18.8836, lng: -48.2253 },
  { nome: 'Uberaba', codigo: 'UBA', lat: -19.7647, lng: -47.9661 },
  { nome: 'Montes Claros', codigo: 'MOC', lat: -16.7069, lng: -43.8189 },
  { nome: 'Ipatinga', codigo: 'IPN', lat: -19.4707, lng: -42.4880 },
  { nome: 'Juiz de Fora', codigo: 'IZA', lat: -21.5131, lng: -43.1731 },
  { nome: 'Governador Valadares', codigo: 'GVR', lat: -18.8952, lng: -41.9822 },
  { nome: 'Campo Grande', codigo: 'CGR', lat: -20.4687, lng: -54.6725 },
  { nome: 'Dourados', codigo: 'DOU', lat: -22.2019, lng: -54.9266 },
  { nome: 'Cuiabá', codigo: 'CGB', lat: -15.6529, lng: -56.1168 },
  { nome: 'Sinop', codigo: 'OPS', lat: -11.8850, lng: -55.5861 },
  { nome: 'Belém', codigo: 'BEL', lat: -1.3792, lng: -48.4763 },
  { nome: 'Santarém', codigo: 'STM', lat: -2.4247, lng: -54.7858 },
  { nome: 'Marabá', codigo: 'MAB', lat: -5.3686, lng: -49.1380 },
  { nome: 'João Pessoa', codigo: 'JPA', lat: -7.1484, lng: -34.9507 },
  { nome: 'Campina Grande', codigo: 'CPV', lat: -7.2699, lng: -35.8964 },
  { nome: 'Recife', codigo: 'REC', lat: -8.1264, lng: -34.9236 },
  { nome: 'Petrolina', codigo: 'PNZ', lat: -9.3624, lng: -40.5691 },
  { nome: 'Teresina', codigo: 'THE', lat: -5.0599, lng: -42.8235 },
  { nome: 'Parnaíba', codigo: 'PHB', lat: -2.8937, lng: -41.7319 },
  { nome: 'Afonso Pena', codigo: 'CWB', lat: -25.5285, lng: -49.1758 },
  { nome: 'Londrina', codigo: 'LDB', lat: -23.3336, lng: -51.1301 },
  { nome: 'Maringá', codigo: 'MGF', lat: -23.4760, lng: -52.0160 },
  { nome: 'Foz do Iguaçu', codigo: 'IGU', lat: -25.6003, lng: -54.4850 },
  { nome: 'Cascavel', codigo: 'CAC', lat: -25.0003, lng: -53.5012 },
  { nome: 'Natal', codigo: 'NAT', lat: -5.9111, lng: -35.2477 },
  { nome: 'Porto Velho', codigo: 'PVH', lat: -8.7093, lng: -63.9023 },
  { nome: 'Boa Vista', codigo: 'BVB', lat: 2.8416, lng: -60.6922 },
  { nome: 'Porto Alegre', codigo: 'POA', lat: -29.9944, lng: -51.1714 },
  { nome: 'Caxias do Sul', codigo: 'CXJ', lat: -29.1971, lng: -51.1875 },
  { nome: 'Pelotas', codigo: 'PET', lat: -31.7184, lng: -52.3277 },
  { nome: 'Florianópolis', codigo: 'FLN', lat: -27.6703, lng: -48.5525 },
  { nome: 'Joinville', codigo: 'JOI', lat: -26.2245, lng: -48.7974 },
  { nome: 'Navegantes', codigo: 'NVT', lat: -26.8797, lng: -48.6511 },
  { nome: 'Chapecó', codigo: 'XAP', lat: -27.1342, lng: -52.6566 },
  { nome: 'Aracaju', codigo: 'AJU', lat: -10.9840, lng: -37.0703 },
  { nome: 'Palmas', codigo: 'PMW', lat: -10.2915, lng: -48.3570 },
];

const CIDADES: Cidade[] = [
  ...Object.entries(CAPITAL).map(([uf, ponto]) => ({ ...ponto, uf })),
  { nome: 'Londrina', uf: 'PR', lat: -23.3045, lng: -51.1696 },
  { nome: 'Maringá', uf: 'PR', lat: -23.4205, lng: -51.9333 },
  { nome: 'Ponta Grossa', uf: 'PR', lat: -25.0945, lng: -50.1633 },
  { nome: 'Cascavel', uf: 'PR', lat: -24.9578, lng: -53.4595 },
  { nome: 'São José dos Pinhais', uf: 'PR', lat: -25.5350, lng: -49.2060 },
  { nome: 'Foz do Iguaçu', uf: 'PR', lat: -25.5163, lng: -54.5854 },
  { nome: 'Colombo', uf: 'PR', lat: -25.2925, lng: -49.2262 },
  { nome: 'Paranaguá', uf: 'PR', lat: -25.5200, lng: -48.5095 },
  { nome: 'Joinville', uf: 'SC', lat: -26.3045, lng: -48.8487 },
  { nome: 'Blumenau', uf: 'SC', lat: -26.9194, lng: -49.0661 },
  { nome: 'Itajaí', uf: 'SC', lat: -26.9078, lng: -48.6619 },
  { nome: 'Chapecó', uf: 'SC', lat: -27.1009, lng: -52.6152 },
  { nome: 'Criciúma', uf: 'SC', lat: -28.6775, lng: -49.3697 },
  { nome: 'Navegantes', uf: 'SC', lat: -26.8989, lng: -48.6546 },
  { nome: 'Palhoça', uf: 'SC', lat: -27.6453, lng: -48.6678 },
  { nome: 'Caxias do Sul', uf: 'RS', lat: -29.1634, lng: -51.1797 },
  { nome: 'Canoas', uf: 'RS', lat: -29.9178, lng: -51.1839 },
  { nome: 'Pelotas', uf: 'RS', lat: -31.7654, lng: -52.3376 },
  { nome: 'Santa Maria', uf: 'RS', lat: -29.6842, lng: -53.8069 },
  { nome: 'Novo Hamburgo', uf: 'RS', lat: -29.6783, lng: -51.1306 },
  { nome: 'Uberlândia', uf: 'MG', lat: -18.9128, lng: -48.2755 },
  { nome: 'Uberaba', uf: 'MG', lat: -19.7472, lng: -47.9381 },
  { nome: 'Contagem', uf: 'MG', lat: -19.9320, lng: -44.0539 },
  { nome: 'Juiz de Fora', uf: 'MG', lat: -21.7642, lng: -43.3503 },
  { nome: 'Betim', uf: 'MG', lat: -19.9681, lng: -44.1983 },
  { nome: 'Montes Claros', uf: 'MG', lat: -16.7286, lng: -43.8578 },
  { nome: 'Governador Valadares', uf: 'MG', lat: -18.8510, lng: -41.9490 },
  { nome: 'Ipatinga', uf: 'MG', lat: -19.4683, lng: -42.5470 },
  { nome: 'Pouso Alegre', uf: 'MG', lat: -22.2300, lng: -45.9360 },
  { nome: 'Extrema', uf: 'MG', lat: -22.8547, lng: -46.3186 },
  { nome: 'Vila Velha', uf: 'ES', lat: -20.3297, lng: -40.2925 },
  { nome: 'Serra', uf: 'ES', lat: -20.1286, lng: -40.3078 },
  { nome: 'Cariacica', uf: 'ES', lat: -20.2632, lng: -40.4165 },
  { nome: 'Cachoeiro de Itapemirim', uf: 'ES', lat: -20.8489, lng: -41.1128 },
  { nome: 'Linhares', uf: 'ES', lat: -19.3947, lng: -40.0643 },
  { nome: 'Feira de Santana', uf: 'BA', lat: -12.2664, lng: -38.9663 },
  { nome: 'Vitória da Conquista', uf: 'BA', lat: -14.8619, lng: -40.8445 },
  { nome: 'Camaçari', uf: 'BA', lat: -12.6975, lng: -38.3242 },
  { nome: 'Lauro de Freitas', uf: 'BA', lat: -12.8944, lng: -38.3272 },
  { nome: 'Ilhéus', uf: 'BA', lat: -14.7880, lng: -39.0460 },
  { nome: 'Juazeiro', uf: 'BA', lat: -9.4162, lng: -40.5033 },
  { nome: 'Petrolina', uf: 'PE', lat: -9.3891, lng: -40.5027 },
  { nome: 'Caucaia', uf: 'CE', lat: -3.7361, lng: -38.6531 },
  { nome: 'Juazeiro do Norte', uf: 'CE', lat: -7.2130, lng: -39.3153 },
  { nome: 'Sobral', uf: 'CE', lat: -3.6894, lng: -40.3482 },
  { nome: 'Mossoró', uf: 'RN', lat: -5.1879, lng: -37.3441 },
  { nome: 'Parnamirim', uf: 'RN', lat: -5.9153, lng: -35.2626 },
  { nome: 'Campina Grande', uf: 'PB', lat: -7.2306, lng: -35.8811 },
  { nome: 'Arapiraca', uf: 'AL', lat: -9.7525, lng: -36.6611 },
  { nome: 'Imperatriz', uf: 'MA', lat: -5.5264, lng: -47.4916 },
  { nome: 'Santarém', uf: 'PA', lat: -2.4426, lng: -54.7078 },
  { nome: 'Marabá', uf: 'PA', lat: -5.3686, lng: -49.1178 },
  { nome: 'Anápolis', uf: 'GO', lat: -16.3281, lng: -48.9534 },
  { nome: 'Aparecida de Goiânia', uf: 'GO', lat: -16.8233, lng: -49.2439 },
  { nome: 'Luziânia', uf: 'GO', lat: -16.2530, lng: -47.9500 },
  { nome: 'Várzea Grande', uf: 'MT', lat: -15.6460, lng: -56.1325 },
  { nome: 'Rondonópolis', uf: 'MT', lat: -16.4673, lng: -54.6372 },
  { nome: 'Sinop', uf: 'MT', lat: -11.8608, lng: -55.5095 },
  { nome: 'Dourados', uf: 'MS', lat: -22.2231, lng: -54.8122 },
  { nome: 'Três Lagoas', uf: 'MS', lat: -20.7849, lng: -51.7007 },
  { nome: 'Parintins', uf: 'AM', lat: -2.6283, lng: -56.7359 },
  { nome: 'Parnaíba', uf: 'PI', lat: -2.9052, lng: -41.7767 },
];

export type ReferenciaDhl = {
  capital: string;
  aeroporto: string;
  resumo: string;
};

export function distanciaKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const lat1 = a.lat * rad;
  const lat2 = b.lat * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function textoKm(km: number): string {
  const n = km < 20 ? Math.max(1, Math.round(km)) : Math.round(km / 5) * 5;
  return `cerca de ${n} km`;
}

function normalizar(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function contemNome(texto: string, nome: string): boolean {
  return ` ${normalizar(texto)} `.includes(` ${normalizar(nome)} `);
}

export function acharCidade(posicao: string, uf?: string): Cidade | null {
  const alvo = String(uf || '').toUpperCase();
  const achados = CIDADES.filter((cidade) => contemNome(posicao, cidade.nome));
  if (achados.length === 0) return null;
  achados.sort((a, b) => {
    const ufA = alvo && a.uf === alvo ? 1 : 0;
    const ufB = alvo && b.uf === alvo ? 1 : 0;
    if (ufA !== ufB) return ufB - ufA;
    return normalizar(b.nome).length - normalizar(a.nome).length;
  });
  return achados[0];
}

export function descreverDeCoordenada(ponto: { lat: number; lng: number }, uf: string): ReferenciaDhl | null {
  const capital = CAPITAL[String(uf || '').toUpperCase()];
  if (!capital || AEROPORTOS.length === 0) return null;
  const kmCapital = distanciaKm(ponto, capital);
  const naCapital = kmCapital <= 15;
  const capitalTexto = naCapital
    ? `📏 *Distância da capital:* na capital (${capital.nome})`
    : `📏 *Distância da capital:* ${textoKm(kmCapital)} de ${capital.nome}`;
  let aeroporto = AEROPORTOS[0];
  let kmAero = distanciaKm(ponto, aeroporto);
  for (const candidato of AEROPORTOS) {
    const km = distanciaKm(ponto, candidato);
    if (km < kmAero) {
      aeroporto = candidato;
      kmAero = km;
    }
  }
  const aeroportoTexto = `✈️ *Distância do aeroporto mais próximo:* ${textoKm(kmAero)} (${aeroporto.nome} · ${aeroporto.codigo})`;
  const resumo = naCapital
    ? `Na capital (${capital.nome}) · ${textoKm(kmAero)} do aeroporto ${aeroporto.nome}`
    : `${textoKm(kmCapital)} de ${capital.nome} · ${textoKm(kmAero)} do aeroporto ${aeroporto.nome}`;
  return { capital: capitalTexto, aeroporto: aeroportoTexto, resumo };
}

/** Só devolve número quando a cidade da última posição é conhecida. Não inventa. */
export function descreverReferencia(posicao: string, uf: string): ReferenciaDhl | null {
  const cidade = acharCidade(posicao, uf);
  if (!cidade) return null;
  return descreverDeCoordenada(cidade, uf || cidade.uf);
}
