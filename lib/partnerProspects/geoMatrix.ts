/** Matriz fixa UF + polos para varredura geográfica (sem lista de CNPJ). */

export type GeoTarget = {
  uf: string;
  estado: string;
  polos: string[];
};

export const GEO_MATRIX: GeoTarget[] = [
  { uf: 'AC', estado: 'Acre', polos: ['Rio Branco'] },
  { uf: 'AL', estado: 'Alagoas', polos: ['Maceió'] },
  { uf: 'AP', estado: 'Amapá', polos: ['Macapá'] },
  { uf: 'AM', estado: 'Amazonas', polos: ['Manaus'] },
  { uf: 'BA', estado: 'Bahia', polos: ['Salvador', 'Feira de Santana'] },
  { uf: 'CE', estado: 'Ceará', polos: ['Fortaleza'] },
  { uf: 'DF', estado: 'Distrito Federal', polos: ['Brasília'] },
  { uf: 'ES', estado: 'Espírito Santo', polos: ['Vitória', 'Serra'] },
  { uf: 'GO', estado: 'Goiás', polos: ['Goiânia', 'Anápolis'] },
  { uf: 'MA', estado: 'Maranhão', polos: ['São Luís'] },
  { uf: 'MT', estado: 'Mato Grosso', polos: ['Cuiabá', 'Rondonópolis'] },
  { uf: 'MS', estado: 'Mato Grosso do Sul', polos: ['Campo Grande', 'Dourados'] },
  { uf: 'MG', estado: 'Minas Gerais', polos: ['Belo Horizonte', 'Uberlândia', 'Contagem'] },
  { uf: 'PA', estado: 'Pará', polos: ['Belém'] },
  { uf: 'PB', estado: 'Paraíba', polos: ['João Pessoa', 'Campina Grande'] },
  { uf: 'PR', estado: 'Paraná', polos: ['Curitiba', 'Londrina', 'Maringá'] },
  { uf: 'PE', estado: 'Pernambuco', polos: ['Recife', 'Jaboatão dos Guararapes'] },
  { uf: 'PI', estado: 'Piauí', polos: ['Teresina'] },
  { uf: 'RJ', estado: 'Rio de Janeiro', polos: ['Rio de Janeiro', 'Duque de Caxias', 'Niterói'] },
  { uf: 'RN', estado: 'Rio Grande do Norte', polos: ['Natal'] },
  { uf: 'RS', estado: 'Rio Grande do Sul', polos: ['Porto Alegre', 'Caxias do Sul'] },
  { uf: 'RO', estado: 'Rondônia', polos: ['Porto Velho'] },
  { uf: 'RR', estado: 'Roraima', polos: ['Boa Vista'] },
  { uf: 'SC', estado: 'Santa Catarina', polos: ['Florianópolis', 'Joinville', 'Itajaí'] },
  { uf: 'SP', estado: 'São Paulo', polos: ['São Paulo', 'Campinas', 'Santos', 'Guarulhos', 'Ribeirão Preto'] },
  { uf: 'SE', estado: 'Sergipe', polos: ['Aracaju'] },
  { uf: 'TO', estado: 'Tocantins', polos: ['Palmas'] },
];

export function montarQueriesBusca(target: GeoTarget, maxPolos = 2): string[] {
  const queries = [
    `empresas de escolta armada em ${target.estado}`,
    `transporte de valores e escolta armada ${target.estado} CNPJ contato`,
  ];
  for (const cidade of target.polos.slice(0, maxPolos)) {
    queries.push(`segurança privada e escolta armada ${cidade} telefone contato`);
    queries.push(`escolta armada ${cidade} ${target.uf} site email`);
  }
  return queries;
}

/** Avança o cursor circular e devolve o próximo lote de UFs. */
export function proximosAlvos(lastIndex: number, lote = 3): {
  alvos: GeoTarget[];
  nextIndex: number;
} {
  const n = GEO_MATRIX.length;
  const start = ((lastIndex % n) + n) % n;
  const alvos: GeoTarget[] = [];
  for (let i = 0; i < Math.min(lote, n); i++) {
    alvos.push(GEO_MATRIX[(start + i) % n]);
  }
  const nextIndex = (start + alvos.length) % n;
  return { alvos, nextIndex };
}

/** Um alvo de micro-lote: uma cidade polo (esteira contínua). */
export type MicroTarget = {
  uf: string;
  estado: string;
  cidade: string;
};

let _microCache: MicroTarget[] | null = null;

export function listaMicroAlvos(): MicroTarget[] {
  if (_microCache) return _microCache;
  const out: MicroTarget[] = [];
  for (const g of GEO_MATRIX) {
    for (const cidade of g.polos) {
      out.push({ uf: g.uf, estado: g.estado, cidade });
    }
  }
  _microCache = out;
  return out;
}

/** Próximo micro-alvo; ao fim da lista reinicia (ciclo Brasil completo). */
export function proximoMicroAlvo(lastIndex: number): {
  alvo: MicroTarget;
  nextIndex: number;
  wrapped: boolean;
} {
  const lista = listaMicroAlvos();
  const n = lista.length;
  const start = ((lastIndex % n) + n) % n;
  const nextIndex = (start + 1) % n;
  return {
    alvo: lista[start],
    nextIndex,
    wrapped: nextIndex === 0,
  };
}

export function rotuloMicroAlvo(alvo: MicroTarget): string {
  return `${alvo.cidade}/${alvo.uf}`;
}

export function montarQueriesMicro(alvo: MicroTarget): string[] {
  return [
    `empresas de escolta armada em ${alvo.cidade} ${alvo.estado}`,
    `segurança privada e escolta armada ${alvo.cidade} telefone contato`,
    `transporte de valores e escolta armada ${alvo.cidade} site email CNPJ`,
  ];
}
