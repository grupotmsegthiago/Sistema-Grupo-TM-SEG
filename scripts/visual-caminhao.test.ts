import assert from "node:assert/strict";
import test from "node:test";
import { resolverVisualCaminhao } from "../lib/os/visualCaminhao.ts";

test("marca DHL, CEVA e IBL pelo nome do cliente", () => {
  assert.equal(resolverVisualCaminhao("DHL SUPPLY CHAIN").tema, "dhl");
  assert.equal(resolverVisualCaminhao("CEVA Logistics").tema, "ceva");
  assert.equal(resolverVisualCaminhao("IBL Logistica").tema, "ibl");
  assert.equal(resolverVisualCaminhao("DHL").logo, "/logo-dhl.svg");
});

test("cliente sem marca autorizada usa o caminhão genérico, sem placa", () => {
  const visual = resolverVisualCaminhao("INTERMODAL BRASIL LOGISTICA S.A.");
  assert.equal(visual.tema, "tmseg");
  assert.equal(visual.logo, null);
  assert.equal("placa" in visual, false);
});