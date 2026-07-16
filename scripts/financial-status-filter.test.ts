import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchesFinancialStatusFilter } from "../lib/financialStatusFilter";

const today = "2026-07-16";

describe("filtro de status Contas a Pagar / Receber", () => {
  it("Agendado só retorna SCHEDULED", () => {
    assert.equal(matchesFinancialStatusFilter("SCHEDULED", "2026-07-17", "SCHEDULED", today), true);
    assert.equal(matchesFinancialStatusFilter("PENDING", "2026-07-17", "SCHEDULED", today), false);
    assert.equal(matchesFinancialStatusFilter("PAID", "2026-07-17", "SCHEDULED", today), false);
  });

  it("Pendente só retorna PENDING", () => {
    assert.equal(matchesFinancialStatusFilter("PENDING", "2026-07-17", "PENDING", today), true);
    assert.equal(matchesFinancialStatusFilter("SCHEDULED", "2026-07-17", "PENDING", today), false);
  });

  it("Pago só retorna PAID", () => {
    assert.equal(matchesFinancialStatusFilter("PAID", "2026-07-10", "PAID", today), true);
    assert.equal(matchesFinancialStatusFilter("PENDING", "2026-07-10", "PAID", today), false);
  });

  it("Vencido inclui PENDING/SCHEDULED com data passada", () => {
    assert.equal(matchesFinancialStatusFilter("PENDING", "2026-07-10", "OVERDUE", today), true);
    assert.equal(matchesFinancialStatusFilter("SCHEDULED", "2026-07-10", "OVERDUE", today), true);
    assert.equal(matchesFinancialStatusFilter("OVERDUE", "2026-07-10", "OVERDUE", today), true);
    assert.equal(matchesFinancialStatusFilter("PENDING", "2026-07-20", "OVERDUE", today), false);
    assert.equal(matchesFinancialStatusFilter("PAID", "2026-07-10", "OVERDUE", today), false);
  });

  it("normaliza status com espaços/caixa", () => {
    assert.equal(matchesFinancialStatusFilter(" scheduled ", "2026-07-17", "SCHEDULED", today), true);
  });
});
