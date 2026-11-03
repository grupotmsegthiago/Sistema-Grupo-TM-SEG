/**
 * Gera a carreta uma vez por cliente e devolve o arquivo guardado.
 * O mapa e a rota não passam por aqui.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { Modality } from '@google/genai';
import { getGeminiClient, isGeminiConfigured } from './geminiClient';
import { withTimeout } from '../lib/promiseTimeout.js';
import { GEMINI_IMAGE_MODEL } from '../lib/geminiModels.js';
import { ehEquipeInterna, origemDoTokenPortal } from '../lib/cevaPortal/equipeInterna.js';
import {
  corSegura,
  logoConhecido,
  logoSeguro,
  pedidoDaCarreta,
  slugVisual,
} from '../lib/portalCliente/frotaVisual.js';

export type ResultadoVisual = {
  carreta: string | null;
  logo: string | null;
  gerada: boolean;
  aviso?: string;
};

const pasta = path.join(process.cwd(), 'public', 'caminhoes', 'gerados');
const voos = new Map<string, Promise<ResultadoVisual>>();
const memoria = new Map<string, ResultadoVisual>();

function palavraBusca(nome: string): string {
  const limpo = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const palavra = limpo.split(/\s+/).find((parte) => parte.length >= 3);
  return (palavra || limpo).replace(/[%_,.()]/g, '').slice(0, 40);
}

async function marcaDoCadastro(cliente: string): Promise<{ logo: string | null; cor: string | null }> {
  const conhecido = logoConhecido(cliente);
  const { createSupabaseAdminClient } = await import('../lib/supabaseAdmin.js');
  const sb = createSupabaseAdminClient();
  const palavra = palavraBusca(cliente);
  if (!sb || palavra.length < 3) return { logo: conhecido, cor: null };
  const { data } = await sb
    .from('clients')
    .select('name, portal_logo_url, portal_site, portal_cor')
    .ilike('name', `%${palavra}%`)
    .limit(8);
  const linhas = (data || []) as Array<{ name?: string | null; portal_logo_url?: string | null; portal_site?: string | null; portal_cor?: string | null }>;
  const alvo = cliente.toLowerCase();
  const linha = [...linhas].sort((a, b) => {
    const nota = (nome: string) => {
      const texto = nome.toLowerCase();
      if (texto === alvo) return 3;
      if (texto.includes(alvo) || alvo.includes(texto)) return 2;
      return 1;
    };
    return nota(String(b.name || '')) - nota(String(a.name || ''));
  })[0];
  if (!linha) return { logo: conhecido, cor: null };
  let logo = conhecido || logoSeguro(linha.portal_logo_url);
  const cor = corSegura(linha.portal_cor);
  if (!logo && linha.portal_site) {
    const { buscarMarcaDoSite } = await import('../lib/portalCliente/marcaSite.js');
    const marca = await buscarMarcaDoSite(String(linha.portal_site));
    if (!('error' in marca)) logo = logoSeguro(marca.logo);
  }
  return { logo, cor };
}

async function fundoBrancoTransparente(buffer: Buffer): Promise<Buffer> {
  const reduzida = await sharp(buffer).resize({ width: 960, withoutEnlargement: true }).ensureAlpha().png().toBuffer();
  const { data, info } = await sharp(reduzida).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (channels < 4 || width * height > 1_500_000) return reduzida;
  const visto = new Uint8Array(width * height);
  const fila: number[] = [];
  const branco = (indice: number) => data[indice] > 248 && data[indice + 1] > 248 && data[indice + 2] > 248;
  const abrir = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const ponto = y * width + x;
    if (visto[ponto]) return;
    if (!branco(ponto * channels)) return;
    visto[ponto] = 1;
    fila.push(ponto);
  };
  for (let x = 0; x < width; x += 1) {
    abrir(x, 0);
    abrir(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    abrir(0, y);
    abrir(width - 1, y);
  }
  while (fila.length > 0) {
    const ponto = fila.pop() as number;
    data[(ponto * channels) + 3] = 0;
    const x = ponto % width;
    const y = (ponto - x) / width;
    abrir(x + 1, y);
    abrir(x - 1, y);
    abrir(x, y + 1);
    abrir(x, y - 1);
  }
  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

async function gerarArquivo(slug: string, cor: string | null): Promise<string | null> {
  if (!isGeminiConfigured()) {
    console.error('[frota-visual] sem chave de imagem');
    return null;
  }
  const ai = getGeminiClient();
  const resposta = await withTimeout(ai.models.generateContent({
    model: GEMINI_IMAGE_MODEL,
    contents: [{ role: 'user', parts: [{ text: pedidoDaCarreta(cor) }] }],
    config: { responseModalities: [Modality.IMAGE] },
  }), 45_000, 'A imagem da carreta passou do tempo.');
  const partes = resposta.candidates?.[0]?.content?.parts || [];
  const imagem = partes.find((parte) => parte.inlineData?.data);
  if (!imagem?.inlineData?.data) {
    console.error('[frota-visual] resposta sem imagem');
    return null;
  }
  const bruta = Buffer.from(imagem.inlineData.data, 'base64');
  const png = await fundoBrancoTransparente(bruta);
  try {
    await fs.mkdir(pasta, { recursive: true });
    await fs.writeFile(path.join(pasta, `${slug}.png`), png);
    return `/caminhoes/gerados/${slug}.png`;
  } catch (erro) {
    console.error('[frota-visual] arquivo', erro instanceof Error ? erro.message : erro);
    return `data:image/png;base64,${png.toString('base64')}`;
  }
}

async function montar(cliente: string, slug: string, corInformada: string | null): Promise<ResultadoVisual> {
  const guardada = memoria.get(slug);
  if (guardada?.carreta) return guardada;
  const marca = await marcaDoCadastro(cliente).catch(() => ({ logo: logoConhecido(cliente), cor: null }));
  const cor = corSegura(corInformada) || marca.cor;
  const arquivo = path.join(pasta, `${slug}.png`);
  try {
    await fs.access(arquivo);
    const pronta = { carreta: `/caminhoes/gerados/${slug}.png`, logo: marca.logo, gerada: true };
    memoria.set(slug, pronta);
    return pronta;
  } catch {
    // ainda não existe arquivo desta marca
  }
  try {
    const carreta = await gerarArquivo(slug, cor);
    if (!carreta) {
      return { carreta: null, logo: marca.logo, gerada: false, aviso: 'A carreta nova não foi gerada. A imagem já gravada continua na tela.' };
    }
    const pronta = { carreta, logo: marca.logo, gerada: true };
    memoria.set(slug, pronta);
    return pronta;
  } catch (erro) {
    console.error('[frota-visual]', erro instanceof Error ? erro.message : erro);
    return { carreta: null, logo: marca.logo, gerada: false, aviso: 'A carreta nova não foi gerada. A imagem já gravada continua na tela.' };
  }
}

export function visualizarFrota(cliente: string, corInformada: string | null): Promise<ResultadoVisual> {
  const slug = slugVisual(cliente);
  const andamento = voos.get(slug);
  if (andamento) return andamento;
  const promessa = montar(cliente, slug, corInformada).finally(() => {
    if (voos.get(slug) === promessa) voos.delete(slug);
  });
  voos.set(slug, promessa);
  return promessa;
}

export async function pedidoVisualAutorizado(headers: Record<string, unknown> | undefined): Promise<boolean> {
  const token = String(headers?.authorization || headers?.Authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;
  const { extractUserIdFromToken } = await import('../lib/rh/apiEmployeesAuth.js');
  if (extractUserIdFromToken(token)) return true;
  const { createSupabaseAdminClient } = await import('../lib/supabaseAdmin.js');
  const sb = createSupabaseAdminClient();
  if (!sb) return false;
  const slug = String(headers?.['x-portal-slug'] || '').trim().toLowerCase();
  const candidatos = [
    { prefixo: 'ceva-portal', tabela: 'ceva_portal_usuarios' },
    { prefixo: 'ibl-portal', tabela: 'ibl_portal_usuarios' },
  ];
  if (/^[a-z0-9-]{2,48}$/.test(slug)) candidatos.push({ prefixo: `portal-${slug}`, tabela: 'portal_cliente_usuarios' });
  for (const item of candidatos) {
    const origem = origemDoTokenPortal(item.prefixo, token);
    if (!origem) continue;
    if (origem.origem === 'equipe') {
      const { data } = await sb.from('system_users').select('id, status, user_type, client_id, provider_id, permissions').eq('id', origem.id).maybeSingle();
      return ehEquipeInterna(data);
    }
    const { data } = await sb.from(item.tabela).select('id, status').eq('id', origem.id).maybeSingle();
    return String(data?.status || '').toLowerCase() === 'ativo';
  }
  return false;
}
