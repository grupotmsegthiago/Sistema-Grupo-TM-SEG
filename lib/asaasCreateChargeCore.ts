/**
 * Core da emissão Asaas (create-charge) — handler leve na Vercel.
 * Evita o catch-all Express (api/index / vercelApp.cjs) que causa cold start
 * e Abort no browser (~30s). Mesma lógica do path single/split em routes.ts.
 */
import {
  createPayment,
  findOrCreateCustomer,
  mapAsaasStatus,
} from './asaasChargeApi.js';
import { createSupabaseAdminClient } from './supabaseAdmin.js';
import {
  findRecentDuplicateOpenCharge,
  persistAsaasChargeInvoice,
} from './persistAsaasChargeInvoice.js';
import {
  cpfCnpjLookupVariants,
  formatClientAddressIncompleteError,
  isClientAddressComplete,
  missingClientAddressFields,
  toAsaasAddressPayload,
  type ClientAddressLike,
} from './clientAddressValidation.js';

export type CreateChargeResult = {
  status: number;
  body: Record<string, unknown>;
};

export type CreateChargeInput = {
  body: Record<string, unknown>;
  createdBy?: string | null;
};

type AddressLookupResult =
  | { ok: true; address: ReturnType<typeof toAsaasAddressPayload>; clientName?: string; clientId?: string }
  | {
      ok: false;
      missing: ReturnType<typeof missingClientAddressFields>;
      clientName?: string;
      clientId?: string;
      cnpj: string;
    };

/** Lê endereço do cadastro local (`clients`). Sem completar pela Receita — obriga corrigir o cadastro. */
async function lookupClientAddress(
  cleanCnpj: string,
  opts?: { clientId?: string | number | null },
): Promise<AddressLookupResult> {
  if (!cleanCnpj && (opts?.clientId == null || String(opts.clientId).trim() === '')) {
    return { ok: false, missing: missingClientAddressFields(null), cnpj: cleanCnpj };
  }
  const sb = createSupabaseAdminClient();
  const addrCtrl = new AbortController();
  const addrTimer = setTimeout(() => addrCtrl.abort(), 2_500);
  try {
    let local: ClientAddressLike = {};
    let clientName: string | undefined;
    let clientId: string | undefined;
    if (sb) {
      const select =
        'id, name, trading_name, cnpj, zip_code, street, number, complement, neighborhood, city, state';
      let clientData: any = null;

      // 1) Preferência: id do cliente (vindo do faturamento) — evita falha por máscara de CNPJ.
      const rawId = opts?.clientId != null ? String(opts.clientId).trim() : '';
      if (rawId) {
        const byId = await sb
          .from('clients')
          .select(select)
          .eq('id', rawId)
          .abortSignal(addrCtrl.signal)
          .maybeSingle();
        if (byId.data) clientData = byId.data;
      }

      // 2) Fallback: CNPJ em dígitos E formatado (cadastro usa 24.455.580/0001-70).
      //    NÃO usar ilike.%digitosLimpos% — não casa com CNPJ pontuado no banco.
      if (!clientData && cleanCnpj) {
        for (const variant of cpfCnpjLookupVariants(cleanCnpj)) {
          const byCnpj = await sb
            .from('clients')
            .select(select)
            .eq('cnpj', variant)
            .limit(1)
            .abortSignal(addrCtrl.signal)
            .maybeSingle();
          if (byCnpj.data) {
            clientData = byCnpj.data;
            break;
          }
        }
      }

      if (clientData) {
        clientName = clientData.trading_name || clientData.name || undefined;
        clientId = clientData.id != null ? String(clientData.id) : undefined;
        local = {
          zip_code: clientData.zip_code || undefined,
          street: clientData.street || undefined,
          number: clientData.number || undefined,
          complement: clientData.complement || undefined,
          neighborhood: clientData.neighborhood || undefined,
          city: clientData.city || undefined,
          state: clientData.state || undefined,
        };
      }
    }
    if (!isClientAddressComplete(local)) {
      return {
        ok: false,
        missing: missingClientAddressFields(local),
        clientName,
        clientId,
        cnpj: cleanCnpj,
      };
    }
    return { ok: true, address: toAsaasAddressPayload(local), clientName, clientId };
  } catch (e: any) {
    if (addrCtrl.signal.aborted || e?.name === 'AbortError') {
      console.log(`[CREATE-CHARGE] Timeout ao ler endereço do cadastro (CNPJ ${cleanCnpj})`);
    } else {
      console.warn(`[CREATE-CHARGE] Lookup endereço falhou: ${e?.message || e}`);
    }
    return { ok: false, missing: missingClientAddressFields(null), cnpj: cleanCnpj };
  } finally {
    clearTimeout(addrTimer);
  }
}

function addressIncompleteResponse(lookup: Extract<AddressLookupResult, { ok: false }>, fallbackName?: string) {
  const payload = formatClientAddressIncompleteError({
    clientName: lookup.clientName || fallbackName,
    missing: lookup.missing,
    cnpj: lookup.cnpj,
    clientId: lookup.clientId,
  });
  return {
    status: 400 as const,
    body: {
      success: false,
      ...payload,
    },
  };
}

export async function runAsaasCreateCharge(input: CreateChargeInput): Promise<CreateChargeResult> {
  try {
    const body = input.body || {};
    const clientName = body.clientName as string | undefined;
    const clientCpfCnpj = body.clientCpfCnpj as string | undefined;
    const clientEmail = body.clientEmail as string | undefined;
    const value = body.value;
    const dueDate = body.dueDate as string | undefined;
    const description = body.description as string | undefined;
    const invoiceNumber = body.invoiceNumber as string | undefined;
    const issuerCompany = body.issuerCompany as string | undefined;
    const charges = body.charges as any[] | undefined;
    const skipBoleto = body.skipBoleto;
    const observations = body.observations;
    const municipalServiceCode = body.municipalServiceCode as string | undefined;
    const municipalServiceName = body.municipalServiceName as string | undefined;

    const noBoleto = skipBoleto === true || String(skipBoleto || '').toLowerCase() === 'true';
    const nfObservations = String(observations || '').trim();
    const nfMunicipalCode = String(municipalServiceCode || '').replace(/\D/g, '') || undefined;
    const nfMunicipalName = String(municipalServiceName || '').trim() || undefined;
    const createdBy = String(input.createdBy || 'Sistema');

    const lookupCnpj = clientCpfCnpj || (charges?.[0]?.cpfCnpj) || '';
    const cleanLookup = String(lookupCnpj).replace(/\D/g, '');
    const bodyClientId = body.clientId != null ? String(body.clientId) : undefined;
    const clientAddressLookup = await lookupClientAddress(cleanLookup, { clientId: bodyClientId });
    if (!clientAddressLookup.ok) {
      return addressIncompleteResponse(clientAddressLookup, clientName);
    }
    const clientAddress = clientAddressLookup.address;

    // ── Split (subcontas) ─────────────────────────────────────────────
    if (charges && Array.isArray(charges) && charges.length > 0) {
      if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
        return { status: 400, body: { error: 'Vencimento inválido' } };
      }
      const validCharges = charges.filter((c: any) => {
        const cleanCnpj = String(c.cpfCnpj || '').replace(/\D/g, '');
        const val = parseFloat(c.value);
        return cleanCnpj.length >= 11 && !isNaN(val) && val > 0;
      });
      if (validCharges.length === 0) {
        return {
          status: 400,
          body: { error: 'Nenhuma subconta válida encontrada. Verifique CNPJ e valores.' },
        };
      }

      const results: any[] = [];
      const splitCtrl = new AbortController();
      const splitTimer = setTimeout(() => splitCtrl.abort(), 25_000);
      try {
        for (let i = 0; i < validCharges.length; i++) {
          if (splitCtrl.signal.aborted) {
            return {
              status: 504,
              body: {
                success: false,
                error: 'Timeout no split create-charge — confira Asaas antes de reemitir.',
                charges: results,
              },
            };
          }
          const charge = validCharges[i];
          const cleanCnpj = String(charge.cpfCnpj).replace(/\D/g, '');

          let chargeAddress = clientAddress;
          if (cleanCnpj !== cleanLookup) {
            const subLookup = await lookupClientAddress(cleanCnpj);
            if (!subLookup.ok) {
              return addressIncompleteResponse(
                subLookup,
                charge.name || clientName,
              );
            }
            chargeAddress = subLookup.address;
          }

          // CEP/endereço do cadastro — obrigatório (bloqueado acima se incompleto).
          const customer = await findOrCreateCustomer({
            name: charge.name || clientName || 'Cliente',
            cpfCnpj: cleanCnpj,
            email: charge.email || clientEmail || undefined,
            company: issuerCompany,
            ...chargeAddress,
            signal: splitCtrl.signal,
          });

          const trackingBase = String(invoiceNumber || '').trim() || `TMSEG-${Date.now()}`;
          const externalRef = `${trackingBase}-S${i + 1}-${cleanCnpj.slice(-4)}`;
          const descText = description || `Ref. aos Serviços de Intermediação de Escolta Armada`;

          const payment = await createPayment({
            customerId: customer.id,
            value: parseFloat(charge.value),
            dueDate,
            description: noBoleto
              ? `${descText} | Pagamento via transferência bancária (sem boleto)`
              : descText,
            externalReference: externalRef,
            billingType: 'UNDEFINED',
            company: issuerCompany,
            signal: splitCtrl.signal,
          });

          const nfServiceText = nfObservations || descText;
          const persistSplit = await persistAsaasChargeInvoice({
            paymentId: payment.id,
            clientName: charge.name || clientName || 'Cliente',
            amount: parseFloat(charge.value),
            dueDate,
            trackingNumber: externalRef,
            serviceDescription: nfServiceText,
            issuerCompany,
            notes: [
              nfServiceText,
              `Ref. rastreio: ${externalRef}`,
              nfMunicipalCode ? `CNAE/Serviço municipal: ${nfMunicipalCode}` : '',
            ]
              .filter(Boolean)
              .join('\n'),
            createdBy,
            asaasStatus: payment.status,
            invoiceUrl: payment.invoiceUrl || null,
            bankSlipUrl: noBoleto ? null : (payment.bankSlipUrl || null),
            nfStatus: 'PROCESSING',
            nfProvider: 'ASAAS',
              nfLastError:
                'NF isolada — será agendada pelo Controle/worker (fora desta requisição).',
            signal: splitCtrl.signal,
          });
          if (!persistSplit.ok) {
            console.warn(`[Asaas] Persistência local falhou (split ${payment.id}): ${persistSplit.error}`);
          }

          results.push({
            payment: {
              id: payment.id,
              status: payment.status,
              statusBr: mapAsaasStatus(payment.status),
              value: payment.value,
              dueDate: payment.dueDate,
              invoiceUrl: payment.invoiceUrl || null,
              bankSlipUrl: noBoleto ? null : (payment.bankSlipUrl || null),
              externalReference: externalRef,
              skipBoleto: noBoleto,
            },
            pix: null,
            bankSlip: null,
            customer: { id: customer.id, name: customer.name, cpfCnpj: cleanCnpj },
            invoice: null,
            nfPending: true,
            nfError: {
              provider: 'ASAAS',
              code: 'NF_SCHEDULE_PENDING',
              message: 'Cobrança salva no Controle como Processando. NF segue em segundo plano.',
            },
            emailSent: false,
            persisted: {
              ok: persistSplit.ok,
              invoiceId: persistSplit.invoiceId,
              created: persistSplit.created,
              error: persistSplit.error,
            },
          });
        }
      } finally {
        clearTimeout(splitTimer);
      }

      return {
        status: 200,
        body: {
          success: true,
          split: true,
          earlyReturn: true,
          nfIsolated: true,
          skipBoleto: noBoleto,
          nfPending: true,
          charges: results,
          totalValue: results.reduce((s, r) => s + (r.payment?.value || 0), 0),
        },
      };
    }

    // ── Single ────────────────────────────────────────────────────────
    if (!clientCpfCnpj || !value || !dueDate) {
      return {
        status: 400,
        body: {
          error: 'CNPJ do cliente, valor e vencimento são obrigatórios',
          step: 'validate_input',
        },
      };
    }

    const amountNum = parseFloat(String(value));
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return { status: 400, body: { error: 'Valor inválido', step: 'validate_input' } };
    }

    const descText = description || `Ref. aos Serviços de Intermediação de Escolta Armada`;
    const t0 = Date.now();
    const trackingRef = String(invoiceNumber || '').trim() || `TMSEG-${Date.now()}`;
    const routeCtrl = new AbortController();
    const routeTimer = setTimeout(() => routeCtrl.abort(), 22_000);

    const stepTimeout = async <T,>(
      step: string,
      ms: number,
      fn: (signal: AbortSignal) => Promise<T>,
    ): Promise<T> => {
      const stepCtrl = new AbortController();
      const onRouteAbort = () => stepCtrl.abort();
      if (routeCtrl.signal.aborted) {
        throw Object.assign(new Error(`Timeout global na rota create-charge`), { step });
      }
      routeCtrl.signal.addEventListener('abort', onRouteAbort, { once: true });
      const timer = setTimeout(() => stepCtrl.abort(), ms);
      try {
        return await fn(stepCtrl.signal);
      } catch (e: any) {
        const aborted = stepCtrl.signal.aborted || e?.name === 'AbortError' || routeCtrl.signal.aborted;
        const msg = aborted
          ? `Timeout no passo "${step}" (${ms / 1000}s)`
          : e?.message || String(e);
        console.error(`[ASAAS-EMISSAO-ERRO] passo=${step} after=${Date.now() - t0}ms: ${msg}`);
        throw Object.assign(new Error(msg), { step });
      } finally {
        clearTimeout(timer);
        routeCtrl.signal.removeEventListener('abort', onRouteAbort);
      }
    };

    try {
      console.log(
        `[ASAAS-EMISSAO] 1. Iniciando (handler leve)... client=${clientName || '-'} valor=${amountNum} venc=${dueDate} empresa=${issuerCompany || '-'} ref=${trackingRef}`,
      );

      try {
        const dup = await stepTimeout('idempotencia_supabase', 2_000, async (signal) => {
          if (signal.aborted) return null;
          return findRecentDuplicateOpenCharge({
            clientName: clientName || 'Cliente',
            amount: amountNum,
            dueDate,
            issuerCompany,
            withinHours: 2,
          });
        });
        if (dup?.asaas_payment_id) {
          console.log(`[ASAAS-EMISSAO] Idempotência: reutilizando ${dup.asaas_payment_id} / fatura ${dup.id}`);
          return {
            status: 200,
            body: {
              success: true,
              message: 'Cobrança já existia — reutilizada',
              paymentId: dup.asaas_payment_id,
              trackingNumber: trackingRef,
              nfPending: true,
              earlyReturn: true,
              nfIsolated: true,
              reused: true,
              skipBoleto: noBoleto,
              emailSent: false,
              nfError: {
                provider: 'ASAAS',
                code: 'NF_SCHEDULE_PENDING',
                message: 'Cobrança já existia (reenvio). NF segue no Controle como Processando.',
              },
              persisted: { ok: true, invoiceId: dup.id, created: false },
              payment: {
                id: dup.asaas_payment_id,
                status: 'PENDING',
                statusBr: 'PENDENTE',
                value: amountNum,
                dueDate,
                invoiceUrl: null,
                bankSlipUrl: null,
                skipBoleto: noBoleto,
                externalReference: trackingRef,
              },
              pix: null,
              bankSlip: null,
              customer: { id: null, name: clientName || 'Cliente' },
              invoice: null,
              liteHandler: true,
            },
          };
        }
      } catch (e: any) {
        console.warn(`[ASAAS-EMISSAO] Idempotência ignorada: ${e?.message || e}`);
      }

      console.log('[ASAAS-EMISSAO] 2. Buscando/Criando cliente...');
      let customer: any;
      try {
        customer = await stepTimeout('asaas_cliente', 8_000, (signal) =>
          findOrCreateCustomer({
            name: clientName || 'Cliente',
            cpfCnpj: clientCpfCnpj,
            email: clientEmail || undefined,
            company: issuerCompany,
            ...clientAddress,
            signal,
          }),
        );
      } catch (e: any) {
        routeCtrl.abort();
        return {
          status: 504,
          body: {
            success: false,
            step: e?.step || 'asaas_cliente',
            trackingNumber: trackingRef,
            error: `Erro no passo 1 (cliente Asaas): ${e?.message || e}`,
            liteHandler: true,
          },
        };
      }
      console.log(`[ASAAS-EMISSAO] 2. Cliente OK: ${customer?.id} (${Date.now() - t0}ms)`);

      const externalRef = trackingRef;
      console.log('[ASAAS-EMISSAO] 3. Gerando cobrança no Asaas...');
      let payment: any;
      try {
        payment = await stepTimeout('asaas_cobranca', 8_000, (signal) =>
          createPayment({
            customerId: customer.id,
            value: amountNum,
            dueDate,
            description: noBoleto
              ? `${descText} | Pagamento via transferência bancária (sem boleto)`
              : descText,
            externalReference: externalRef,
            billingType: 'UNDEFINED',
            company: issuerCompany,
            signal,
          }),
        );
      } catch (e: any) {
        routeCtrl.abort();
        return {
          status: 504,
          body: {
            success: false,
            step: e?.step || 'asaas_cobranca',
            trackingNumber: trackingRef,
            error: `Erro no passo 2 (cobrança Asaas): ${e?.message || e}`,
            liteHandler: true,
          },
        };
      }
      console.log(`[ASAAS-EMISSAO] 3. Cobrança criada no Asaas: ID ${payment.id} (${Date.now() - t0}ms)`);

      console.log('[ASAAS-EMISSAO] 4. Persistindo no Supabase (financial_invoices)...');
      let persistEarly: Awaited<ReturnType<typeof persistAsaasChargeInvoice>>;
      try {
        const nfServiceText = nfObservations || descText;
        persistEarly = await stepTimeout('supabase_persist', 5_000, (signal) =>
          persistAsaasChargeInvoice({
            paymentId: payment.id,
            clientName: clientName || 'Cliente',
            amount: amountNum,
            dueDate,
            trackingNumber: trackingRef,
            serviceDescription: nfServiceText,
            issuerCompany,
            notes: [
              nfServiceText,
              `Ref. rastreio: ${trackingRef}`,
              nfMunicipalCode
                ? `CNAE/Serviço municipal: ${nfMunicipalCode}${nfMunicipalName ? ` — ${nfMunicipalName}` : ''}`
                : '',
            ]
              .filter(Boolean)
              .join('\n'),
            createdBy,
            asaasStatus: payment.status,
            invoiceUrl: payment.invoiceUrl || null,
            bankSlipUrl: noBoleto ? null : (payment.bankSlipUrl || null),
            nfStatus: 'PROCESSING',
            nfProvider: 'ASAAS',
            nfLastError:
              'NF isolada — agendada pelo Controle/worker (fora desta requisição).',
            signal,
          }),
        );
      } catch (e: any) {
        routeCtrl.abort();
        return {
          status: 504,
          body: {
            success: false,
            step: e?.step || 'supabase_persist',
            trackingNumber: trackingRef,
            error: `Erro no passo 3 (Supabase): ${e?.message || e}. Cobrança Asaas ${payment.id} pode ter sido criada — confira antes de emitir de novo (ref. ${trackingRef}).`,
            paymentId: payment.id,
            liteHandler: true,
            payment: {
              id: payment.id,
              status: payment.status,
              statusBr: mapAsaasStatus(payment.status),
              value: payment.value,
              dueDate: payment.dueDate,
              invoiceUrl: payment.invoiceUrl || null,
              bankSlipUrl: noBoleto ? null : (payment.bankSlipUrl || null),
              externalReference: externalRef,
              skipBoleto: noBoleto,
            },
          },
        };
      }

      if (!persistEarly.ok) {
        console.error(`[ASAAS-EMISSAO-ERRO] Persistência falhou: ${persistEarly.error}`);
        routeCtrl.abort();
        return {
          status: 500,
          body: {
            success: false,
            step: 'supabase_persist',
            trackingNumber: trackingRef,
            error: `Erro no passo 3 (Supabase): ${persistEarly.error || 'falha ao salvar'}. Cobrança Asaas ${payment.id} criada — confira antes de emitir de novo (ref. ${trackingRef}).`,
            paymentId: payment.id,
            persisted: persistEarly,
            liteHandler: true,
            payment: {
              id: payment.id,
              status: payment.status,
              statusBr: mapAsaasStatus(payment.status),
              value: payment.value,
              dueDate: payment.dueDate,
              invoiceUrl: payment.invoiceUrl || null,
              bankSlipUrl: noBoleto ? null : (payment.bankSlipUrl || null),
              externalReference: externalRef,
              skipBoleto: noBoleto,
            },
          },
        };
      }

      console.log(`[ASAAS-EMISSAO] 4. Fatura salva: ID ${persistEarly.invoiceId} (${Date.now() - t0}ms)`);
      console.log(`[ASAAS-EMISSAO] 5. Sucesso! HTTP 200 (${Date.now() - t0}ms) liteHandler=true`);
      return {
        status: 200,
        body: {
          success: true,
          message: 'Cobrança gerada com sucesso',
          paymentId: payment.id,
          invoiceId: persistEarly.invoiceId,
          trackingNumber: trackingRef,
          nfPending: true,
          earlyReturn: true,
          nfIsolated: true,
          liteHandler: true,
          skipBoleto: noBoleto,
          emailSent: false,
          emailPendingReason: 'NF/boleto sincronizam no Controle (sync + retry)',
          nfError: {
            provider: 'ASAAS',
            code: 'NF_SCHEDULE_PENDING',
            message: 'Cobrança salva no Controle como Processando. NF fora desta requisição.',
          },
          persisted: {
            ok: true,
            invoiceId: persistEarly.invoiceId,
            created: persistEarly.created,
          },
          payment: {
            id: payment.id,
            status: payment.status,
            statusBr: mapAsaasStatus(payment.status),
            value: payment.value,
            dueDate: payment.dueDate,
            invoiceUrl: payment.invoiceUrl || null,
            bankSlipUrl: noBoleto ? null : (payment.bankSlipUrl || null),
            externalReference: externalRef,
            skipBoleto: noBoleto,
          },
          pix: null,
          bankSlip: null,
          customer: { id: customer.id, name: customer.name },
          invoice: null,
          municipalServiceCode: nfMunicipalCode || null,
          municipalServiceName: nfMunicipalName || null,
          elapsedMs: Date.now() - t0,
        },
      };
    } finally {
      clearTimeout(routeTimer);
    }
  } catch (err: any) {
    console.error(`[ASAAS-EMISSAO-ERRO] Falha capturada:`, err?.message || err);
    return {
      status: 500,
      body: {
        success: false,
        step: err?.step || 'unknown',
        error: err?.message || 'Falha ao processar cobrança no servidor.',
        liteHandler: true,
      },
    };
  }
}
