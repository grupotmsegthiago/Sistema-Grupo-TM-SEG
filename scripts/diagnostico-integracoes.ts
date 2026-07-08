#!/usr/bin/env npx tsx
/**
 * Script de Diagnóstico de Integrações — somente leitura.
 *
 * Uso:
 *   npx tsx scripts/diagnostico-integracoes.ts
 *   npx tsx scripts/diagnostico-integracoes.ts --json
 *   npx tsx scripts/diagnostico-integracoes.ts --sem-opcionais
 */
import {
  ARQUIVOS_ANALISADOS,
  diagnosticoIntegracoes,
  type IntegracaoDiagResult,
} from '../server/integracoesDiagnostics';

const args = new Set(process.argv.slice(2));
const jsonOnly = args.has('--json');
const semOpcionais = args.has('--sem-opcionais');

function logFalha(item: IntegracaoDiagResult): void {
  const prefix = `[FALHA] ${item.servico} / ${item.nome} (${item.id})`;
  if (item.status === 'nao_configurado') {
    console.warn(`${prefix} — não configurado: ${item.erro || 'sem credenciais'}`);
    return;
  }
  console.error(`${prefix}`);
  console.error(`  status: ${item.status}`);
  if (item.latenciaMs != null) console.error(`  latência: ${item.latenciaMs}ms`);
  if (item.erro) console.error(`  erro: ${item.erro}`);
  if (item.healthEndpointExistente) {
    console.error(`  endpoint existente: ${item.healthEndpointExistente}`);
  }
  if (item.detalhes && Object.keys(item.detalhes).length > 0) {
    console.error(`  detalhes: ${JSON.stringify(item.detalhes, null, 2)}`);
  }
}

function logResumo(): void {
  console.log('\n── Arquivos analisados para cobertura ──');
  for (const path of ARQUIVOS_ANALISADOS) {
    console.log(`  • ${path}`);
  }
  console.log(`\nTotal de arquivos mapeados: ${ARQUIVOS_ANALISADOS.length}`);
}

async function main(): Promise<void> {
  if (!jsonOnly) {
    console.log('=== Diagnóstico de Integrações TM SEG (read-only) ===\n');
  }

  try {
    const result = await diagnosticoIntegracoes({
      incluirOpcionais: !semOpcionais,
    });

    if (jsonOnly) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Verificado em: ${result.checkedAt}`);
      console.log(`Status geral: ${result.overall.toUpperCase()}`);
      console.log(
        `Resumo: ${result.resumo.ok} OK | ${result.resumo.degradado} degradado | ${result.resumo.falhou} falhou | ${result.resumo.naoConfigurado} não configurado\n`,
      );

      for (const item of result.integracoes) {
        const icon =
          item.status === 'ok'
            ? '✓'
            : item.status === 'nao_configurado'
              ? '○'
              : item.status === 'degraded'
                ? '△'
                : '✗';
        const lat = item.latenciaMs != null ? ` (${item.latenciaMs}ms)` : '';
        console.log(`${icon} [${item.id}] ${item.nome}${lat}`);

        if (item.status !== 'ok' && item.status !== 'nao_configurado') {
          logFalha(item);
        }
      }

      logResumo();
    }

    const hasFailure = result.integracoes.some(
      (i) => i.configurado && (i.status === 'falhou' || i.status === 'degraded'),
    );
    process.exit(hasFailure ? 1 : 0);
  } catch (err: unknown) {
    console.error('[diagnostico-integracoes] Erro fatal:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

void main();
