import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const severities = ["info", "low", "moderate", "high", "critical"];
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export function evaluateAudit(report, exceptions, today = new Date().toISOString().slice(0, 10)) {
  if (
    !isRecord(report) ||
    report.error ||
    !isRecord(report.advisories) ||
    !isRecord(report.metadata) ||
    !isRecord(report.metadata.vulnerabilities)
  ) {
    throw new Error("The registry did not return a complete audit report.");
  }
  const vulnerabilities = report.metadata.vulnerabilities;
  if (
    Object.keys(vulnerabilities).length !== severities.length ||
    severities.some(
      (severity) =>
        !Object.hasOwn(vulnerabilities, severity) ||
        !Number.isSafeInteger(vulnerabilities[severity]) ||
        vulnerabilities[severity] < 0,
    )
  ) {
    throw new Error("Audit vulnerability counts are missing or invalid.");
  }
  for (const entry of exceptions) {
    const date = new Date(`${entry.reviewBy}T00:00:00Z`);
    if (
      typeof entry.reviewBy !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewBy) ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== entry.reviewBy
    ) {
      throw new Error(`Invalid exception review date: ${entry.reviewBy}`);
    }
  }
  const failures = [];
  const accepted = [];
  for (const advisory of Object.values(report.advisories)) {
    if (!advisory.findings?.length) throw new Error("Audit advisory has no findings.");
    for (const finding of advisory.findings) {
      if (!finding.paths?.length) throw new Error("Audit finding has no dependency paths.");
      for (const path of finding.paths) {
        const exception = exceptions.find(
          (entry) =>
            entry.advisory === advisory.github_advisory_id &&
            entry.package === advisory.module_name &&
            entry.version === finding.version &&
            entry.paths.includes(path) &&
            entry.reviewBy > today &&
            entry.reason &&
            finding.dev === true &&
            finding.bundled === false,
        );
        const message = `${advisory.severity}: ${advisory.github_advisory_id} ${advisory.module_name}@${finding.version} (${path})`;
        (exception ? accepted : failures).push(message);
      }
    }
  }
  const count = Object.values(report.metadata.vulnerabilities).reduce((sum, n) => sum + n, 0);
  if (count !== Object.keys(report.advisories).length) {
    throw new Error("Audit vulnerability counts do not match the advisory details.");
  }
  return { failures, accepted };
}

export function evaluateAuditCommand(result, exceptions, today) {
  if (result.error) throw result.error;
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(
      `Audit command failed: ${result.stderr || result.stdout || `exit ${result.status}`}`,
    );
  }
  try {
    return evaluateAudit(JSON.parse(result.stdout), exceptions, today);
  } catch (error) {
    throw new Error(
      `Invalid audit report: ${error.message}${result.stderr ? `\nAudit stderr: ${result.stderr}` : ""}`,
      { cause: error },
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = spawnSync("vp", ["pm", "audit", "--json"], {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    const exceptions = JSON.parse(
      readFileSync(new URL("./security-exceptions.json", import.meta.url)),
    );
    const { failures, accepted } = evaluateAuditCommand(result, exceptions);
    for (const message of accepted) console.log(`Reviewed exception: ${message}`);
    for (const message of failures) console.error(`Unreviewed vulnerability: ${message}`);
    console.log(
      `Security audit: ${failures.length} unreviewed paths, ${accepted.length} reviewed paths.`,
    );
    process.exitCode = failures.length ? 1 : 0;
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
