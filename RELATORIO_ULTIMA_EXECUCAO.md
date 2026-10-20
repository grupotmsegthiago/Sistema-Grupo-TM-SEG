# RELATÓRIO DA ÚLTIMA EXECUÇÃO

Fase: download do instalador dentro da Solicitação, e publicação das PRs 350 e 351
Data: 2026-10-20
SHA da sessão: branch `cursor/cloud-agent-1792463640605-0pnwx`, em cima de `79afc2d2`
SHA de produção antes desta entrega: `798d4139` (a PR 350, `cea83883`, já é ancestral dessa main)

1. Objetivo e escopo
Quem abre Solicitação sem o aplicativo preparado vê o aviso para baixar e instalar. O formulário só aparece quando o conector local responde preparado. Publicar a PR 350 (já na main) e a PR 351, com o instalador automático e esta trava. A Edição Total do financeiro não entra nessa publicação.

2. Baseline
`origin/main` em `798d4139`. A PR 351 está em `feat/whatsapp-desktop-instalador`, fast-forward à frente da main. Sem SQL. Supabase do app continua `ajhmmjuewdsukecaimik`.

3. Arquivos alterados
- `components/SolicitacaoEscoltaModal.tsx`
- `lib/whatsappDesktop/clienteLocal.ts`
- `desktop/whatsapp-desktop/Abrir instalador.vbs`
- `desktop/whatsapp-desktop/servidor.ts`
- `desktop/whatsapp-desktop/conector.mjs`
- `public/instalador-grupo-tmseg.zip`
- `vercel.json` (o zip não cai no index.html)
- `scripts/solicitacao-escolta.test.ts`
- `scripts/whatsapp-desktop-instalador.test.ts`
- `docs/operacao/whatsapp-desktop.md`
- `docs/governanca/ESTADO-ATUAL.md`
- `RELATORIO_ULTIMA_EXECUCAO.md`

4. Regras preservadas
A fila da PR 350 não mudou: imediata junta, agendada de 2 em 2 a cada 5 minutos, TORRES na frente em São Paulo. Nada é inserido em `missions` antes do formulário da OS. O cálculo de OS, Asaas, NF e a comissão não mudaram. Memória antiga do navegador não libera a tela. Reautenticação do WhatsApp continua no instalador; a solicitação libera quando o computador já está preparado.

5. Banco
Nenhum. As migrations `2026_10_20_escolta_solicitacao.sql` e `2026_10_20_whatsapp_desktop.sql` seguem sem aplicação. TORRES não foi tocado.

6. Riscos e rollback
O zip tem o atalho, o conector, o assistente, o driver e a logo na mesma pasta. No Windows, Avançar chama o winget. Rollback: reverter o commit na main. Sem rollback de banco.

7. Testes
`npx tsx --test scripts/whatsapp-desktop-instalador.test.ts scripts/whatsapp-desktop-servidor.test.ts scripts/solicitacao-escolta.test.ts`: 18 passaram.
`npm run build` terminou sem erro. O zip copiado para `dist/public/instalador-grupo-tmseg.zip` lista os cinco arquivos.
`GET http://127.0.0.1:5000/instalador-grupo-tmseg.zip` respondeu 200, `application/zip`, 153529 bytes.
No navegador, a Solicitação sem computador preparado mostrou “Você não tem todos os aplicativos” e o botão Baixar para instalar. “Já instalei, verificar de novo” manteve o aviso. Com o conector respondendo preparado, o formulário apareceu e o aviso sumiu.
O winget não foi executado neste Linux.

8. Homologação
O instalador não foi clicado num Windows limpo. A conta do WhatsApp não foi conectada. A migration da solicitação não está no banco, então o formulário liberado avisa que a tabela ainda não existe.

9. Autorização
O pedido “pode publicar” o 350 e o 351 autoriza a ida para a main. A Edição Total do financeiro permanece só na branch do agente.

10. Continuidade
A PR 350 já estava mergeada. A publicação leva `feat/whatsapp-desktop-instalador` por fast-forward até a main, no projeto Vercel `sistema-grupo-tm-seg`. `publicar.ps1` não entra, porque ele publica a `dev`.
