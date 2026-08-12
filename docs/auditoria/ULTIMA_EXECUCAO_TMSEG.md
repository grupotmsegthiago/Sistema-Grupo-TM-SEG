# ULTIMA EXECUÇÃO — Sistema Grupo TM SEG

> Arquivo oficial de handoff entre Cursor e ChatGPT.  
> Representa **somente** a última execução realizada.  
> **Não contém segredos, senhas, tokens ou API keys.**

---

## IDENTIFICAÇÃO

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-12 (UTC) |
| **Fase** | Fase 1 — Reinvestigação chave Resend comprometida (correção de divergência) |
| **Objetivo** | Corrigir identificação incorreta de “Integração Supabase” após operador reportar prefixo `re_EzyJ8pYq…` no painel, incompatível com o hardcode Git |
| **Produção / código / Vercel / banco alterados** | **NÃO** |
| **Chaves revogadas** | **NÃO** |

---

## PROGRESSO

| Métrica | Valor |
|---------|-------|
| **PROGRESSO DA FASE 1** | **99%** |
| **PROGRESSO GERAL DO PROGRAMA** | **10%** |

---

## CORREÇÃO DA EXECUÇÃO ANTERIOR

A conclusão anterior (“Integração Supabase” = chave vazada) foi **invalidada**.

| Item | Execução anterior (incorreta) | Reinvestigação (corrigida) |
|------|-------------------------------|----------------------------|
| Chave vazada no painel | Integração Supabase | **Indeterminada** entre chaves visíveis |
| Motivo do erro | Inferência por nome/caminho Supabase | Prefixo painel `re_EzyJ8pYq…` ≠ prefixo Git `re_5Fc9…` |
| Integração Supabase | “Provável” vazada | **Descartada comprovadamente** como vazada |

---

## RESPOSTAS SOLICITADAS

### 1. Qual é o prefixo seguro da chave realmente hardcoded?

| Campo | Valor |
|-------|-------|
| **Prefixo mascarado** | `re_5Fc9…CxA2` |
| **Comprimento** | 36 caracteres |
| **Fingerprint SHA-256** | `a09a800393f718d8725d247f018a9b7a8d0896ed57b647681c29e66f7105e8b7` |
| **Única ocorrência no Git** | Sim — um único token `re_*` de API Resend em todo o histórico pesquisado |

**Arquivos que contiveram o hardcode (somente 3):**

1. `supabase/functions/send-welcome-email/index.ts`
2. `attached_assets/extracted/grupo-tmseg/supabase/functions/send-welcome-email/index.ts`
3. `attached_assets/extracted2/supabase/functions/send-welcome-email/index.ts`

**Janela no Git:** introduzida em `bf9c0fa5` (2026-02-24) → removida em `2448268f` (2026-08-12).

---

### 2. Existe alguma chave atual do painel que pode ser correlacionada com esse prefixo?

| Chave no painel (informada) | Prefixo visível | Correlaciona com `re_5Fc9…`? |
|-----------------------------|-----------------|------------------------------|
| `RESEND_API_KEY` (nova) | não informado nesta execução | **Indeterminado** — é rotação recente; presumivelmente **diferente** da vazada |
| `Integração Supabase` | `re_EzyJ8pYq…` (operador) | **NÃO** — prefixo distinto |
| `Integração` (antiga) | **não informado** | **Indeterminado** — única candidata remanescente **se** o prefixo no painel for `re_5Fc9…` |

**Busca Git pelo prefixo `EzyJ8pYq`:** **0 ocorrências** em todo o histórico.

**Conclusão:** nenhuma chave do painel foi **confirmada** como a vazada. Somente `Integração` permanece como hipótese **não verificada**.

---

### 3. A chave comprometida pode já ter sido excluída anteriormente?

**Provável — sim.**

Evidências:

| Evidência | Interpretação |
|-----------|---------------|
| Prefixo vazado `re_5Fc9…` ≠ `re_EzyJ8pYq…` de Integração Supabase | A vazada **não** é essa chave visível |
| Operador lista 3 chaves atuais; nenhuma com prefixo `re_5Fc9…` informado | A vazada pode **não existir mais** no painel |
| `re_EzyJ8pYq…` nunca apareceu no Git | Integração Supabase é chave **posterior ou paralela**, não a do hardcode |
| Hotfix removeu hardcode em 2026-08-12; rotação `RESEND_API_KEY` na Vercel no mesmo dia | Janela de rotação/revogação manual plausível |

**Não é possível afirmar com 100%** sem o operador verificar se alguma chave **já revogada** no histórico do painel Resend tinha prefixo `re_5Fc9…`, ou se `Integração` exibe esse prefixo.

---

### 4. “Integração Supabase” pode ser comprovadamente descartada como sendo a chave vazada?

**SIM — comprovadamente descartada.**

| Critério | Resultado |
|----------|-----------|
| Prefixo painel `re_EzyJ8pYq…` vs Git `re_5Fc9…` | **Incompatíveis** |
| `EzyJ8pYq` no histórico Git | **0 ocorrências** |
| Inferência por nome/caminho Supabase | **Insuficiente** (erro da execução anterior) |

Integração Supabase **não é** a credencial hardcoded. Pode ser chave legítima de outro uso (ex.: secret Supabase Edge, integração posterior).

---

### 5. Qual chave, se alguma, pode ser revogada com segurança?

## NÃO É SEGURO REVOGAR NENHUMA CHAVE AINDA

| Chave | Revogar? | Motivo |
|-------|----------|--------|
| `RESEND_API_KEY` (nova) | **NÃO** | Chave ativa de rotação |
| `Integração Supabase` (`re_EzyJ8pYq…`) | **NÃO** | **Não é a vazada**; revogar não fecha o incidente e pode quebrar integração ativa desconhecida |
| `Integração` (antiga) | **NÃO ainda** | Prefixo não informado — **pode** ser a vazada `re_5Fc9…` **ou** chave legítima distinta |

**Próximo passo operador (1 verificação):** informar o prefixo visível de **`Integração`** no painel.

- Se `re_5Fc9…` → candidata à chave vazada → aí sim avaliar revogação **somente dessa chave**
- Se outro prefixo → vazada provavelmente **já excluída** do painel; revogar chaves restantes **sem necessidade de incidente**

---

## INVESTIGAÇÃO TÉCNICA (detalhes)

### Varredura Git

| Busca | Resultado |
|-------|-----------|
| `git log -p -S 're_5Fc9hUR7'` | 571 linhas — 3 arquivos, 3 commits |
| `git log -p -S 'EzyJ8pYq'` | **0 linhas** |
| `git log -p -S 're_'` em `*.ts` `*.tsx` `supabase/**` | 1 token Resend real (`re_5Fc9…`); demais matches são falsos positivos (`re_teoW…` store Supabase, placeholders) |

### Consumidor histórico do token vazado

- Edge Function `send-welcome-email` (Supabase) — único uso do token no repositório
- `UserForm` chamou `functions/v1/send-welcome-email` brevemente (2026-02-24 a 2026-02-26), depois migrou para `/api/email/welcome` (SMTP)
- Fluxo prod atual: **SMTP**, não Resend

### Tentativa API Resend (ambiente cloud)

- HTTP 403 / Cloudflare 1010 — sem validação externa possível neste ambiente

---

## ALTERAÇÕES REALIZADAS

| Escopo | Alteração |
|--------|-----------|
| Código / banco / Vercel / produção | **Nenhuma** |
| Documentação | Este handoff (correção) |

---

## SEGURANÇA

- Nenhum valor completo de chave registrado neste documento.
- Prefixos mascarados apenas para correlação manual no painel.
- Execução anterior que apontou Integração Supabase como vazada: **revertida conceitualmente** neste handoff.

---

## PENDÊNCIAS

1. Operador: informar prefixo visível de **`Integração`** no painel Resend
2. Operador: verificar histórico de chaves **revogadas/excluídas** no painel — alguma com prefixo `re_5Fc9…`?
3. Só então decidir revogação cirúrgica (se aplicável)
4. Fase 1 → 100%: validação funcional da nova `RESEND_API_KEY` (pendência anterior)

---

## RESULTADO FINAL

### 🟡 CONCLUÍDO COM PENDÊNCIA

Reinvestigação concluída. Prefixo vazado confirmado: **`re_5Fc9…`**. **Integração Supabase descartada** (`re_EzyJ8pYq…`). **Nenhuma chave do painel correlacionada com certeza.**

### Decisão de revogação

**NÃO É SEGURO REVOGAR NENHUMA CHAVE AINDA**

**Fase 2 não iniciada.**

---

> **Arquivo para análise no ChatGPT:**  
> `docs/auditoria/ULTIMA_EXECUCAO_TMSEG.md`

---

*Gerado em: 2026-08-12 UTC | Execução: Reinvestigação Resend — correção divergência de prefixo*
