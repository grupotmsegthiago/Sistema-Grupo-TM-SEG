/**
 * Lista pública do mapa do cliente.
 * Devolve só posição aproximada. Nunca fornecedor, cliente, OS ou placa.
 */
import { createClient } from '@supabase/supabase-js';
import { DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_URL } from '../lib/supabaseDefaults.js';
import {
  JANELA_MAPA_MS,
  idPublicoViatura,
  linhaVisivelNoMapa,
  montarPontosPublicos,
  pontoDeCoordenada,
  type LinhaMapaViatura,
  type PontoMapaPublico,
} from '../lib/dhlViaturaMapa.js';

const cacheGeo = new Map<string, { lat: number; lng: number } | null>();

async function geocodeCidade(consulta: string): Promise<{ lat: number; lng: number } | null> {
  const chave = consulta.toUpperCase();
  if (cacheGeo.has(chave)) return cacheGeo.get(chave) || null;
  const key = String(process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyBIs-lrtAP6hoA1z_VA4Gbx1ujA-AlJe2k').trim();
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(consulta)}&language=pt-BR&region=br&key=${encodeURIComponent(key)}`;
    const resp = await fetch(url);
    const data: any = await resp.json();
    const loc = data?.results?.[0]?.geometry?.location;
    const ponto = data?.status === 'OK' && Number.isFinite(Number(loc?.lat))
      ? { lat: Number(loc.lat), lng: Number(loc.lng) }
      : null;
    cacheGeo.set(chave, ponto);
    return ponto;
  } catch {
    cacheGeo.set(chave, null);
    return null;
  }
}

export default async function handler(req: any, res: any) {
  res.setHeader?.('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.status(405).json({ viaturas: [] });
    return;
  }

  const agora = new Date();
  const corte = new Date(agora.getTime() - JANELA_MAPA_MS).toISOString();
  try {
    const supabase = createClient(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase
      .from('dhl_viatura_disponivel')
      .select('mission_id, posicao, uf, regiao, finalizada_em, status')
      .gte('finalizada_em', corte)
      .in('status', ['pendente', 'copiado', 'confirmado'])
      .order('finalizada_em', { ascending: false })
      .limit(80);

    if (error) {
      res.status(200).json({ viaturas: [], aviso: 'Mapa ainda sem tabela.' });
      return;
    }

    const linhas = (data || []) as LinhaMapaViatura[];
    const conhecidas = montarPontosPublicos(linhas, agora);
    const ids = new Set(conhecidas.map((p) => p.id));
    const extras: PontoMapaPublico[] = [];
    let consultas = 0;
    for (const linha of linhas) {
      if (!linhaVisivelNoMapa(linha, agora)) continue;
      if (ids.has(idPublicoViatura(linha.mission_id))) continue;
      if (consultas >= 8) break;
      consultas += 1;
      const geo = await geocodeCidade(`${linha.posicao}, ${linha.uf}, Brasil`);
      if (!geo) continue;
      const ponto = pontoDeCoordenada(linha, geo);
      if (!ponto || ids.has(ponto.id)) continue;
      ids.add(ponto.id);
      extras.push(ponto);
    }

    res.status(200).json({ viaturas: [...conhecidas, ...extras], atualizadoEm: agora.toISOString() });
  } catch {
    res.status(200).json({ viaturas: [] });
  }
}
