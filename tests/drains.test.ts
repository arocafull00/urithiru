import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { parseDrain, verifySignature } from "../src/lib/drains";
const log = {
  id: "log-1",
  projectId: "prj_test",
  timestamp: 1793200000000,
  message: "Petición fallida",
  proxy: { statusCode: 500, path: "/api/test" },
};
test("firma HMAC del cuerpo original y rechazo de lotes alterados", () => {
  const body = JSON.stringify([log]);
  const secret = "test-secret";
  const signature = createHmac("sha1", secret).update(body).digest("hex");
  assert.equal(verifySignature(body, signature, secret), true);
  for (const signatureValue of [
    null,
    "",
    "abc",
    "z".repeat(40),
    signature.slice(0, 39),
  ])
    assert.equal(verifySignature(body, signatureValue, secret), false);
  assert.equal(verifySignature(body + " ", signature, secret), false);
  assert.equal(verifySignature(body, signature, "otro-secreto"), false);
});
test("JSON y NDJSON devuelven los mismos logs, descartando campos ajenos", () => {
  const fromJson = parseDrain(
    JSON.stringify([
      { ...log, ip: "192.0.2.1", headers: { authorization: "test" } },
    ]),
  );
  assert.deepEqual(fromJson, parseDrain(JSON.stringify(log) + "\n"));
  assert.equal("ip" in fromJson[0], false);
  assert.equal("headers" in fromJson[0], false);
  assert.equal(fromJson[0].proxy?.statusCode, 500);
});
test("rechaza lotes inválidos o demasiado grandes antes de guardarlos", () => {
  assert.throws(() => parseDrain(JSON.stringify([{ ...log, timestamp: -1 }])));
  assert.throws(() =>
    parseDrain(JSON.stringify(Array.from({ length: 1001 }, () => log))),
  );
  assert.throws(() => parseDrain('{"id":"incompleto"}'));
  assert.throws(() => parseDrain("not-json"));
});
