# Estado atual — ler no início de cada sessão

Atualizado em 2026-10-19, depois da conferência de produção da Fase 1.

| Campo | Valor |
| --- | --- |
| Última fase concluída | Fase 1 — governança na `main` e no ar |
| Próxima fase autorizada | nenhuma. A Fase 2 está diagnosticada e não começou |
| `main` | `7676ea63edcff02292c2374472f51fff4d138758` (merge da PR #346) |
| Produção | `https://sistema.grupotmseg.com.br` — `buildId` `7676ea63`, versão `3.7.65`, `/api/health` ok, tela de login carregou |
| Projeto Vercel | `sistema-grupo-tm-seg` |
| `origin/dev` | `766c9895`, 35 commits atrás, zero commits exclusivos. Não sincronizada |
| Supabase do app | `ajhmmjuewdsukecaimik`. OS = `missions` |
| TORRES | outro projeto. Não foi alterada |

## Evidência da Fase 1

PR #346 `MERGED`. Vercel do commit `7676ea63`: estado `success`, texto “Deployment has completed”. Domínio oficial responde o mesmo `buildId`.

## Fase 2

Diagnóstico em `docs/governanca/18-DIAGNOSTICO-FASE-2-SEGURANCA.md`. A anon ainda lê senha, OS, financeiro, preço, salário e ponto. Correção não autorizada.

## Pendências

- Fast-forward da `dev` até a `main`, só com pedido.
- Dono humano por domínio: não designado.
- Catálogo `pg_policies` da TM SEG: não carregado.
- ADR-006b: Z-API continua no ar.

## Bloqueios

Não operar a TM SEG pelo conector da TORRES. Não usar `exec_sql` para criar objeto. Não passar de 50 funções na Vercel. Não limpar WhatsApp sem ordem. Não presumir banco de homologação separado.
