import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { computeAccountBalanceOverview } from "../lib/dashboardDiretoria/aggregations";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("card saldo operacional em Contas a Pagar", () => {
  it("exclui XP / investimentos do total operacional", () => {
    const overview = computeAccountBalanceOverview(
      [
        { id: "op1", name: "TM Gestão", bank_name: "Asaas", initial_balance: 50_000 },
        { id: "op2", name: "TM Security", bank_name: "Asaas", initial_balance: 30_000 },
        { id: "inv1", name: "XP Investimentos", bank_name: "XP", initial_balance: 900_000 },
      ],
      { inv1: 1_200_000 },
    );
    assert.equal(overview.operationalTotal, 80_000);
    assert.equal(overview.operationalCount, 2);
    assert.equal(overview.investmentsTotal, 1_200_000);
  });

  it("FinancialTransactionList usa computeAccountBalanceOverview e mostra o card", () => {
    const src = readFileSync(join(root, "components/FinancialTransactionList.tsx"), "utf8");
    assert.match(src, /computeAccountBalanceOverview/);
    assert.match(src, /listBalanceSnapshots/);
    assert.doesNotMatch(src, /listBalanceSnapshotsDirect/);
    assert.match(src, /card-total-contas-operacionais/);
    assert.match(src, /Sem XP \/ investimentos/);
    assert.match(src, /from 'react'/);
  });
});
