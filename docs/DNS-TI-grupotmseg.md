# DNS — Grupo TM SEG (roteiro para TI)

**Domínio:** `grupotmseg.com.br`  
**DNS / nameserver:** Zapt Tecnologia (`ns1.zapttecnologia.com.br`)  
**Projeto Vercel:** `sistema-grupo-tm-seg`  
**Data:** jul/2026

---

## 1. Resumo

| Uso | URL | Onde hospeda | Ação |
|-----|-----|--------------|------|
| Site institucional | `https://www.grupotmseg.com.br` | Servidor atual (IP `34.111.179.208`) | **Não alterar** |
| Sistema operacional | `https://sistema.grupotmseg.com.br` | Vercel | **Alterar DNS** |

> **Não usar** `app.grupotmseg.com.br` — esse subdomínio **não existe** no DNS.

> URL temporária (Vercel): `https://sistema-grupo-tm-seg.vercel.app` (funciona enquanto o DNS propaga)

---

## 2. Antes do TI — Thiago na Vercel

1. Login em [vercel.com](https://vercel.com) → projeto **sistema-grupo-tm-seg**
2. **Settings → Domains → Add Domain**
3. Adicionar: `sistema.grupotmseg.com.br`
4. Anotar o **CNAME** que a Vercel exibir (use esse valor no passo 3.2)
5. **Settings → Environment Variables** (Production):
   - `APP_PUBLIC_URL` = `https://sistema.grupotmseg.com.br`
   - `SYSTEM_URL` = `https://sistema.grupotmseg.com.br`
6. **Deployments → Redeploy** (último deploy da branch `main`)

---

## 3. Site institucional — NÃO ALTERAR

Configuração atual (manter):

| Tipo | Host / Nome | Valor |
|------|-------------|-------|
| **A** | `@` (apex / `grupotmseg.com.br`) | `34.111.179.208` |
| **CNAME** | `www` | `grupotmseg.com.br` |

**Teste:** `https://www.grupotmseg.com.br` deve continuar abrindo o site da empresa.

---

## 4. Sistema — ALTERAR DNS (Vercel)

### 4.1 Situação atual (remover)

| Tipo | Host | Valor | Observação |
|------|------|-------|------------|
| **A** | `sistema` | `108.167.188.182` | Servidor antigo — **excluir** |

### 4.2 Novo registro (criar)

| Campo | Valor |
|-------|-------|
| **Tipo** | `CNAME` |
| **Host / Nome** | `sistema` |
| **Destino / Aponta para** | `cname.vercel-dns.com` |
| **TTL** | `3600` (1 h) ou padrão do painel |

> Se a Vercel mostrar um CNAME **diferente** (ex.: `abc123.vercel-dns-017.com`), **usar exatamente o valor da Vercel** — ele tem prioridade sobre este documento.

> **Não** criar registro **A** para `sistema` — subdomínio na Vercel usa **somente CNAME**.

### 4.3 Se a Vercel pedir verificação TXT

Criar o registro TXT com **nome e valor exatos** exibidos em **Settings → Domains** (só se solicitado).

---

## 5. Copiar e colar (resumo para o painel DNS)

```
SITE — NÃO MEXER:
  A       @       34.111.179.208
  CNAME   www     grupotmseg.com.br

SISTEMA — ALTERAR:
  REMOVER:  A  sistema  →  108.167.188.182
  CRIAR:    CNAME  sistema  →  cname.vercel-dns.com
```

---

## 6. Propagação e testes

**Tempo típico:** 5 min a 2 h (máx. 48 h)

### 6.1 Teste DNS (CMD / PowerShell)

```powershell
nslookup sistema.grupotmseg.com.br
```

Esperado: CNAME para Vercel — **não** deve retornar `108.167.188.182`.

### 6.2 Teste API

Abrir no navegador:

```
https://sistema.grupotmseg.com.br/api/health
```

Resposta esperada:

```json
{"status":"ok","timestamp":...,"source":"api/health"}
```

### 6.3 Teste login

```
https://sistema.grupotmseg.com.br
```

Tela de login do **Grupo TMSEG - Sistema de Gestão** sem erro.

### 6.4 Esconder `vercel.app` na barra do navegador

Quem acessa `https://sistema-grupo-tm-seg.vercel.app` deve ser **redirecionado** para `https://sistema.grupotmseg.com.br` (configurado no `vercel.json`).

Na Vercel, confirme também:

1. **Settings → Domains** → `sistema.grupotmseg.com.br` com status **Valid**
2. Clique nos **três pontinhos** ao lado do domínio → **Set as Primary Domain** (domínio principal)
3. Ative **Redirect old domains to primary** (redireciona URLs `.vercel.app` para o domínio principal)

> **Importante:** `www.grupotmseg.com.br` é o **site institucional** (servidor `34.111.179.208`), não o sistema na Vercel. O endereço do sistema é **`sistema.grupotmseg.com.br`**. Não dá para mostrar só `grupotmseg.com.br` na barra sem hospedar o app no domínio raiz (conflita com o site da empresa).

---

## 7. Checklist

- [ ] Thiago: domínio `sistema.grupotmseg.com.br` adicionado na Vercel
- [ ] TI: removido A `sistema` → `108.167.188.182`
- [ ] TI: criado CNAME `sistema` → Vercel
- [ ] Thiago: `APP_PUBLIC_URL` e `SYSTEM_URL` na Vercel
- [ ] Thiago: redeploy
- [ ] TI/Thiago: testes `/api/health` e login OK
- [ ] TI: `www` e apex **intocados**

---

## 8. Contatos / referências

- Painel DNS: Zapt Tecnologia (mesmo provedor do `ns1.zapttecnologia.com.br`)
- Vercel: projeto `sistema-grupo-tm-seg`
- Documentação Vercel: [Adicionar domínio customizado](https://vercel.com/docs/projects/domains/working-with-domains/add-a-domain)
