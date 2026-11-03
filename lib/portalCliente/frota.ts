/** Motoristas já usados nas OS do cliente e veículos do cadastro dele. */

type SupabaseAdmin = {
  from: (tabela: string) => any;
};

export type MotoristaFrota = { nome: string; telefone: string };
export type VeiculoFrota = { placa: string; modelo: string };

const PAGINA = 1000;
const TETO = 8000;

export async function listarFrotaPortal(
  sb: SupabaseAdmin,
  nomesCliente: string[],
  clientId: number,
): Promise<{ motoristas: MotoristaFrota[]; veiculos: VeiculoFrota[] }> {
  const motoristas = new Map<string, { nome: string; telefone: string }>();
  const nomes = nomesCliente.map((nome) => nome.trim()).filter(Boolean);
  if (nomes.length > 0) {
    for (let from = 0; from < TETO; from += PAGINA) {
      const { data, error } = await sb
        .from('missions')
        .select('driver_name, driver_phone')
        .in('client', nomes)
        .not('driver_name', 'is', null)
        .order('created_at', { ascending: false })
        .range(from, from + PAGINA - 1);
      if (error) throw error;
      for (const row of data || []) {
        const nome = String(row.driver_name || '').trim().replace(/\s+/g, ' ').toUpperCase();
        const telefone = String(row.driver_phone || '').trim();
        const chave = `${nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '')}|${telefone.replace(/\D/g, '')}`;
        if (!nome || motoristas.has(chave)) continue;
        motoristas.set(chave, { nome, telefone });
      }
      if (!data || data.length < PAGINA) break;
    }
  }

  const veiculos: VeiculoFrota[] = [];
  const vistos = new Set<string>();
  let colunas = 'plate, model, brand, status';
  for (let from = 0; from < TETO; from += PAGINA) {
    let consulta = await sb
      .from('client_vehicles')
      .select(colunas)
      .eq('client_id', clientId)
      .order('plate')
      .range(from, from + PAGINA - 1);
    if (consulta.error && /status/i.test(String(consulta.error.message || '')) && colunas.includes('status')) {
      colunas = 'plate, model, brand';
      consulta = await sb
        .from('client_vehicles')
        .select(colunas)
        .eq('client_id', clientId)
        .order('plate')
        .range(from, from + PAGINA - 1);
    }
    const { data, error } = consulta;
    if (error) throw error;
    for (const row of data || []) {
      if (String(row.status || '').toLowerCase() === 'inativo') continue;
      const placa = String(row.plate || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
      if (!placa || vistos.has(placa)) continue;
      vistos.add(placa);
      const modelo = [row.brand, row.model].map((item) => String(item || '').trim()).filter(Boolean).join(' ');
      veiculos.push({ placa, modelo });
    }
    if (!data || data.length < PAGINA) break;
  }

  return {
    motoristas: [...motoristas.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    veiculos,
  };
}
