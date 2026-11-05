import assert from "node:assert/strict";
import { test } from "vite-plus/test";
import { evaluateAudit, evaluateAuditCommand } from "./security-audit.mjs";

const zeroCounts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };

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
    metadata: { vulnerabilities: { ...zeroCounts, high: 1 } },
  };
}
const today = "2026-11-04";

test("accepts a reviewed development finding and a clean audit", () => {
  assert.equal(evaluateAudit(report(), [exception], today).failures.length, 0);
  assert.equal(
    evaluateAudit({ advisories: {}, metadata: { vulnerabilities: zeroCounts } }, [], today).failures
      .length,
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
    null,
    [],
    { advisories: [], metadata: { vulnerabilities: zeroCounts } },
    { advisories: {}, metadata: { vulnerabilities: [] } },
    { advisories: {}, metadata: { vulnerabilities: { unexpected: 0 } } },
    { advisories: {}, metadata: { vulnerabilities: { high: 0 } } },
    { advisories: {}, metadata: { vulnerabilities: { ...zeroCounts, unexpected: 0 } } },
    { advisories: {}, metadata: { vulnerabilities: {} } },
    { advisories: {}, metadata: { vulnerabilities: { high: -1 } } },
    { error: "registry unavailable" },
    { advisories: {}, metadata: { vulnerabilities: { ...zeroCounts, high: 1 } } },
    report({ paths: [] }),
    report({}, { findings: [] }),
  ]) {
    assert.throws(() => evaluateAudit(value, [exception], today));
  }
});

test("reports audit stderr when stdout is absent, invalid JSON, or an incomplete report", () => {
  for (const stdout of ["", "not json", JSON.stringify({ error: "unavailable" })]) {
    assert.throws(
      () =>
        evaluateAuditCommand({ status: 1, stdout, stderr: "registry authentication failed" }, []),
      /Audit stderr: registry authentication failed/,
    );
  }
});

test("accepts valid audit output with status 0 or 1 and rejects command failures", () => {
  for (const status of [0, 1]) {
    const result = evaluateAuditCommand(
      { status, stdout: JSON.stringify(report()), stderr: "" },
      [exception],
      today,
    );
    assert.equal(result.failures.length, 0);
  }
  assert.throws(
    () => evaluateAuditCommand({ status: 2, stderr: "unknown flag" }, []),
    /unknown flag/,
  );
  assert.throws(
    () => evaluateAuditCommand({ error: new Error("spawn failed") }, []),
    /spawn failed/,
  );
});

test("rejects malformed or impossible exception dates instead of accepting them indefinitely", () => {
  for (const reviewBy of [
    "9999-99-99",
    "2027-02-29",
    "2027-04-31",
    "2027-2-01",
    "2027-02-01T00:00:00Z",
    "",
    null,
    20270201,
  ]) {
    assert.throws(
      () => evaluateAudit(report(), [{ ...exception, reviewBy }], today),
      /Invalid exception review date/,
    );
  }
  assert.equal(
    evaluateAudit(report(), [{ ...exception, reviewBy: "2028-02-29" }], today).failures.length,
    0,
  );
});
