import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("listagem de grupos WhatsApp (cadastro)", () => {
  it("vercel.json roteia /api/whatsapp/groups para handler leve (não Express)", () => {
    const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
    const rewrite = (vercel.rewrites || []).find(
      (r: { source?: string }) => r.source === "/api/whatsapp/groups",
    );
    assert.ok(rewrite, "rewrite /api/whatsapp/groups ausente");
    assert.equal(rewrite.destination, "/api/whatsapp/groups");

    const catchAllIdx = (vercel.rewrites || []).findIndex(
      (r: { source?: string }) => r.source === "/api/(.*)",
    );
    const groupsIdx = (vercel.rewrites || []).findIndex(
      (r: { source?: string }) => r.source === "/api/whatsapp/groups",
    );
    assert.ok(groupsIdx >= 0 && groupsIdx < catchAllIdx, "groups deve vir antes do catch-all /api/(.*)");

    const functionsCount = Object.keys(vercel.functions || {}).length;
    assert.ok(functionsCount <= 50, `functions=${functionsCount} ultrapassa limite 50 da Vercel`);
  });

  it("handler leve api/whatsapp/groups.ts existe e não importa Express", () => {
    const src = readFileSync(join(root, "api/whatsapp/groups.ts"), "utf8");
    assert.match(src, /listWhatsappGroups/);
    assert.doesNotMatch(src, /from ['"]express['"]/);
    assert.doesNotMatch(src, /server\/routes/);
  });
});
