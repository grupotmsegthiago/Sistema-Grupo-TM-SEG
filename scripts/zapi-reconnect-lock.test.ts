import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isLockActive, type ZapiReconnectLock } from "../server/zapiReconnectLock";

describe("zapiReconnectLock", () => {
  it("isLockActive retorna false quando expirado", () => {
    const lock: ZapiReconnectLock = {
      holderId: "u1",
      holderName: "Teste",
      acquiredAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      phase: "claimed",
    };
    assert.equal(isLockActive(lock), false);
  });

  it("isLockActive retorna true quando válido", () => {
    const lock: ZapiReconnectLock = {
      holderId: "u1",
      holderName: "Teste",
      acquiredAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      phase: "code_ready",
      phoneLinkCode: "ABCD1234",
    };
    assert.equal(isLockActive(lock), true);
  });
});
