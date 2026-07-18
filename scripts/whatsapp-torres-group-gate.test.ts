import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  chatNameLooksLikeTorres,
  isTorresOperationalGroupSync,
  normalizeWhatsappGroupId,
  parseTorresGroupIdsFromEnv,
  resolveInboundGroupIdForGate,
} from "../server/whatsapp/torresGroupGate";

describe("gate grupo Torres (bot só responde Torres)", () => {
  it("normaliza IDs @g.us e -group", () => {
    assert.equal(
      normalizeWhatsappGroupId("120363019502650977@g.us"),
      "120363019502650977-group",
    );
    assert.equal(
      normalizeWhatsappGroupId("120363019502650977-group"),
      "120363019502650977-group",
    );
    assert.equal(
      normalizeWhatsappGroupId("120363019502650977"),
      "120363019502650977-group",
    );
  });

  it("parseia WHATSAPP_TORRES_GROUP_ID com vários IDs", () => {
    const ids = parseTorresGroupIdsFromEnv(
      "120363111111111111-group, 120363222222222222@g.us",
    );
    assert.deepEqual(ids, [
      "120363111111111111-group",
      "120363222222222222-group",
    ]);
  });

  it("reconhece chatName com Torres", () => {
    assert.equal(chatNameLooksLikeTorres("Torres Vigilância"), true);
    assert.equal(chatNameLooksLikeTorres("GRUPO TORRES OPERACIONAL"), true);
    assert.equal(chatNameLooksLikeTorres("Cliente Intermodal"), false);
    assert.equal(chatNameLooksLikeTorres("DHL Express"), false);
  });

  it("libera comando quando groupId está na allowlist env", () => {
    assert.equal(
      isTorresOperationalGroupSync({
        isGroup: true,
        groupId: "120363019502650977-group",
        chatName: "Operacional",
        envGroupIds: ["120363019502650977-group"],
      }),
      true,
    );
  });

  it("libera comando quando chatName é Torres mesmo sem env", () => {
    assert.equal(
      isTorresOperationalGroupSync({
        isGroup: true,
        groupId: "120363999999999999-group",
        chatName: "Central Torres",
        envGroupIds: [],
      }),
      true,
    );
  });

  it("bloqueia outros grupos sem match", () => {
    assert.equal(
      isTorresOperationalGroupSync({
        isGroup: true,
        groupId: "120363888888888888-group",
        chatName: "DHL Monitoramento",
        envGroupIds: ["120363019502650977-group"],
      }),
      false,
    );
  });

  it("bloqueia chat privado", () => {
    assert.equal(
      isTorresOperationalGroupSync({
        isGroup: false,
        groupId: null,
        chatName: "Torres",
        envGroupIds: [],
      }),
      false,
    );
  });

  it("libera via allowedGroupIds do cadastro (provider)", () => {
    assert.equal(
      isTorresOperationalGroupSync({
        isGroup: true,
        groupId: "120363777777777777@g.us",
        chatName: "Ops",
        envGroupIds: [],
        allowedGroupIds: ["120363777777777777-group"],
      }),
      true,
    );
  });

  it("resolve groupId do payload Z-API", () => {
    assert.equal(
      resolveInboundGroupIdForGate({
        isGroup: true,
        phone: "120363019502650977-group",
      }),
      "120363019502650977-group",
    );
  });
});
