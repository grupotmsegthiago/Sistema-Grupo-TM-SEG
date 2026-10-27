/**
 * Uma cena ilustrativa por transportadora. O mapa e os preços não passam por aqui.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { gerarImagemIlustrativa, servicoDeImagemDisponivel } from './propostaImagemIa.js';
import {
  LIMITE_MENSAL_PADRAO_USD,
  PECAS_PREMIUM,
  arquivoDaPeca,
  chaveDaCena,
  pedidoDaPeca,
  podeGerarImagem,
  rotuloDeContagem,
  type ImagensPremium,
  type PecaPremium,
} from '../lib/portalCliente/propostaPremium.js';

export type CenaPremium = {
  hero: string | null;
  imagens: ImagensPremium;
  cache: boolean;
  servico: 'openai' | 'gemini' | 'arquivo' | 'nenhum';
  custoEstimadoUsd: number;
  operacoes: string | null;
  parceiros: string | null;
  aviso?: string;
};

const memoria = new Map<string, CenaPremium>();
const voos = new Map<string, Promise<CenaPremium>>();
const gasto = { mes: '', usd: 0 };
const indicadoresGuardados: { expira: number; operacoes: string | null; parceiros: string | null } = {
  expira: 0,
  operacoes: null,
  parceiros: null,
};

function limiteMensal(): number {
  const bruto = Number(process.env.PROPOSTA_IA_LIMITE_MENSAL_USD || LIMITE_MENSAL_PADRAO_USD);
  return Number.isFinite(bruto) && bruto > 0 ? bruto : LIMITE_MENSAL_PADRAO_USD;
}

function reservar(custo: number): boolean {
  const mes = new Date().toISOString().slice(0, 7);
  if (gasto.mes !== mes) {
    gasto.mes = mes;
    gasto.usd = 0;
  }
  if (!podeGerarImagem(gasto.usd, custo, limiteMensal())) return false;
  gasto.usd += custo;
  return true;
}

function vazio(): ImagensPremium {
  return { capa: null, central: null, fiscal: null, escolta: null, acompanhamento: null, guincho: null };
}

async function arquivoPronto(publico: string): Promise<string | null> {
  const relativo = publico.replace(/^\//, '');
  if (relativo.includes('..')) return null;
  try {
    const stat = await fs.stat(path.join(process.cwd(), 'public', relativo));
    return stat.size > 5_000 ? publico : null;
  } catch {
    return null;
  }
}

async function guardar(publico: string, buffer: Buffer, largura: number): Promise<string | null> {
  const relativo = publico.replace(/^\//, '');
  const arquivo = path.join(process.cwd(), 'public', relativo);
  try {
    const webp = await sharp(buffer).rotate().resize({ width: largura, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    await fs.mkdir(path.dirname(arquivo), { recursive: true });
    await fs.writeFile(arquivo, webp);
    return publico;
  } catch (erro) {
    console.error('[proposta-premium] arquivo', erro instanceof Error ? erro.message : erro);
    return null;
  }
}

async function produzir(cliente: string, peca: PecaPremium): Promise<{ url: string | null; servico: CenaPremium['servico']; custo: number }> {
  const publicado = arquivoDaPeca(cliente, peca);
  const pronto = await arquivoPronto(publicado);
  if (pronto) return { url: pronto, servico: 'arquivo', custo: 0 };
  if (servicoDeImagemDisponivel() === 'nenhum') return { url: null, servico: 'nenhum', custo: 0 };
  const reserva = 0.08;
  if (!reservar(reserva)) return { url: null, servico: 'nenhum', custo: 0 };
  const gerada = await gerarImagemIlustrativa(pedidoDaPeca(peca), peca === 'capa' ? 'paisagem' : 'cartao');
  if (!gerada) return { url: null, servico: 'nenhum', custo: 0 };
  const url = await guardar(publicado, gerada.buffer, peca === 'capa' ? 1600 : 1024);
  return { url, servico: gerada.servico, custo: gerada.custoUsd };
}

async function indicadores(): Promise<{ operacoes: string | null; parceiros: string | null }> {
  if (indicadoresGuardados.expira > Date.now()) {
    return { operacoes: indicadoresGuardados.operacoes, parceiros: indicadoresGuardados.parceiros };
  }
  const { createSupabaseAdminClient } = await import('./supabaseConfig.js');
  const sb = createSupabaseAdminClient();
  if (!sb) return { operacoes: null, parceiros: null };
  const [missoes, parceiros] = await Promise.all([
    sb.from('missions').select('id', { count: 'exact', head: true }).eq('status', 'Concluída'),
    sb.from('providers').select('id', { count: 'exact', head: true }).eq('status', 'Ativo'),
  ]);
  const resposta = {
    operacoes: missoes.error ? null : rotuloDeContagem(missoes.count),
    parceiros: parceiros.error ? null : rotuloDeContagem(parceiros.count),
  };
  indicadoresGuardados.expira = Date.now() + 10 * 60 * 1000;
  indicadoresGuardados.operacoes = resposta.operacoes;
  indicadoresGuardados.parceiros = resposta.parceiros;
  return resposta;
}

async function montar(cliente: string): Promise<CenaPremium> {
  const slug = chaveDaCena(cliente);
  const guardada = memoria.get(slug);
  if (guardada?.hero) return { ...guardada, cache: true, ...(await indicadores()) };
  const imagens = vazio();
  let servico: CenaPremium['servico'] = 'arquivo';
  let custo = 0;
  let algumaNova = false;
  for (const peca of PECAS_PREMIUM) {
    const pecaCliente = peca === 'capa' ? cliente : 'compartilhado';
    const feita = await produzir(pecaCliente, peca);
    imagens[peca] = feita.url;
    custo += feita.custo;
    if (feita.servico === 'openai' || feita.servico === 'gemini') {
      servico = feita.servico;
      algumaNova = true;
    } else if (!algumaNova && feita.servico === 'nenhum') servico = 'nenhum';
  }
  const numeros = await indicadores();
  const pronta: CenaPremium = {
    hero: imagens.capa,
    imagens,
    cache: !algumaNova && Boolean(imagens.capa),
    servico: algumaNova ? servico : (imagens.capa ? 'arquivo' : 'nenhum'),
    custoEstimadoUsd: Number(custo.toFixed(4)),
    ...numeros,
    aviso: imagens.capa ? undefined : 'A cena ilustrativa ficou na imagem já publicada.',
  };
  if (pronta.hero) memoria.set(slug, pronta);
  return pronta;
}

export function visualizarCenaPremium(cliente: string): Promise<CenaPremium> {
  const slug = chaveDaCena(cliente);
  const andamento = voos.get(slug);
  if (andamento) return andamento;
  const promessa = montar(cliente).finally(() => {
    if (voos.get(slug) === promessa) voos.delete(slug);
  });
  voos.set(slug, promessa);
  return promessa;
}

export async function indicadoresPublicos(): Promise<{ operacoes: string | null; parceiros: string | null }> {
  try {
    return await indicadores();
  } catch (erro) {
    console.error('[proposta-premium] indicadores', erro instanceof Error ? erro.message : erro);
    return { operacoes: null, parceiros: null };
  }
}
