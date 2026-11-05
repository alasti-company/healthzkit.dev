import assert from "node:assert/strict";
import { test } from "vite-plus/test";
import { evaluateAudit } from "./security-audit.mjs";

const exception = {
  advisory: "GHSA-test",
  package: "legacy",
  version: "1.0.0",
  paths: ["packages__adapter>legacy"],
  reviewBy: "2027-02-01",
  reason: "Compatibility fixture only",
};
function report(changes = {}, advisoryChanges = {}) {
  return {
    advisories: {
      1: {
        github_advisory_id: "GHSA-test",
        module_name: "legacy",
        severity: "high",
        findings: [
          { version: "1.0.0", paths: exception.paths, dev: true, bundled: false, ...changes },
        ],
        ...advisoryChanges,
      },
    },
    metadata: { vulnerabilities: { high: 1 } },
  };
}
const today = "2026-11-04";

test("accepts a reviewed development finding and a clean audit", () => {
  assert.equal(evaluateAudit(report(), [exception], today).failures.length, 0);
  assert.equal(
    evaluateAudit({ advisories: {}, metadata: { vulnerabilities: { high: 0 } } }, [], today)
      .failures.length,
    0,
  );
});

test("never extends a legacy exception to production, bundled code, another version or path", () => {
  for (const changes of [
    { dev: false },
    { dev: undefined },
    { bundled: true },
    { version: "1.0.1" },
    { paths: ["apps__server>legacy"] },
  ]) {
    assert.equal(evaluateAudit(report(changes), [exception], today).failures.length, 1);
  }
  const mixed = evaluateAudit(
    report({ paths: [...exception.paths, "apps__server>legacy"] }),
    [exception],
    today,
  );
  assert.equal(mixed.failures.length, 1);
  assert.equal(mixed.accepted.length, 1);
});

test("blocks new advisories, renamed packages and expired exceptions", () => {
  assert.equal(
    evaluateAudit(report({}, { github_advisory_id: "GHSA-new" }), [exception], today).failures
      .length,
    1,
  );
  assert.equal(
    evaluateAudit(report({}, { module_name: "other" }), [exception], today).failures.length,
    1,
  );
  assert.equal(evaluateAudit(report(), [exception], exception.reviewBy).failures.length, 1);
});

test("fails closed on unavailable or incomplete registry data", () => {
  for (const value of [
    {},
    { advisories: {}, metadata: { vulnerabilities: {} } },
    { advisories: {}, metadata: { vulnerabilities: { high: -1 } } },
    { error: "registry unavailable" },
    { advisories: {}, metadata: { vulnerabilities: { high: 1 } } },
    report({ paths: [] }),
    report({}, { findings: [] }),
  ]) {
    assert.throws(() => evaluateAudit(value, [exception], today));
  }
});
