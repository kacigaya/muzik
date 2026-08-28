import assert from "node:assert/strict";
import test from "node:test";
import { allowedOrigins, isTrustedRequest } from "../lib/origin.ts";

function request(overrides) {
  return { method: "POST", origin: null, secFetchSite: null, host: "muzik.example", allowed: [], ...overrides };
}

test("lets safe methods through whatever the browser reports", () => {
  for (const method of ["GET", "head", "OPTIONS"]) {
    assert.equal(
      isTrustedRequest(request({ method, origin: "https://evil.example", secFetchSite: "cross-site" })),
      true,
      method,
    );
  }
});

test("decides on Sec-Fetch-Site when the browser sends it", () => {
  assert.equal(isTrustedRequest(request({ secFetchSite: "same-origin" })), true);
  assert.equal(isTrustedRequest(request({ secFetchSite: "none" })), true);
  assert.equal(isTrustedRequest(request({ secFetchSite: "cross-site", origin: "https://evil.example" })), false);
  assert.equal(
    isTrustedRequest(request({ secFetchSite: "same-site", origin: "https://other.muzik.example" })),
    false,
    "a sibling subdomain is a different application",
  );
});

test("falls back to Origin against Host", () => {
  assert.equal(isTrustedRequest(request({ origin: "https://muzik.example" })), true);
  assert.equal(
    isTrustedRequest(request({ origin: "http://muzik.example:3020", host: "muzik.example:3020" })),
    true,
    "the port is part of the host",
  );
  assert.equal(isTrustedRequest(request({ origin: "https://evil.example" })), false);
  assert.equal(isTrustedRequest(request({ origin: "not a url" })), false);
  assert.equal(isTrustedRequest(request({ origin: "null" })), false);
});

test("trusts a client that sends neither header", () => {
  assert.equal(isTrustedRequest(request({ method: "DELETE" })), true);
});

test("honours the operator allowlist in both header worlds", () => {
  const allowed = ["https://player.example"];
  assert.equal(
    isTrustedRequest(request({ secFetchSite: "cross-site", origin: "https://player.example", allowed })),
    true,
  );
  assert.equal(isTrustedRequest(request({ origin: "https://player.example/", allowed })), true);
  assert.equal(isTrustedRequest(request({ secFetchSite: "cross-site", origin: "https://evil.example", allowed })), false);
  assert.equal(isTrustedRequest(request({ secFetchSite: "cross-site", origin: null, allowed })), false);
});

test("reads and normalizes the allowlist from the environment", (t) => {
  const original = process.env.MUZIK_ALLOWED_ORIGINS;
  t.after(() => {
    if (original === undefined) delete process.env.MUZIK_ALLOWED_ORIGINS;
    else process.env.MUZIK_ALLOWED_ORIGINS = original;
  });

  delete process.env.MUZIK_ALLOWED_ORIGINS;
  assert.deepEqual(allowedOrigins(), []);

  process.env.MUZIK_ALLOWED_ORIGINS = " https://player.example/app , , http://box.lan:3020 , not a url ";
  assert.deepEqual(allowedOrigins(), ["https://player.example", "http://box.lan:3020"]);
});
