import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export function evaluateAudit(report, exceptions, today = new Date().toISOString().slice(0, 10)) {
  if (!report.advisories || !report.metadata?.vulnerabilities || report.error) {
    throw new Error("The registry did not return a complete audit report.");
  }
  const counts = Object.values(report.metadata.vulnerabilities);
  if (!counts.length || counts.some((count) => !Number.isSafeInteger(count) || count < 0)) {
    throw new Error("Audit vulnerability counts are missing or invalid.");
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = spawnSync("vp", ["pm", "audit", "--json"], {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    if (result.error) throw result.error;
    if (result.status !== 0 && result.status !== 1) {
      throw new Error(`Audit command failed: ${result.stderr || result.stdout}`);
    }
    const exceptions = JSON.parse(
      readFileSync(new URL("./security-exceptions.json", import.meta.url)),
    );
    const { failures, accepted } = evaluateAudit(JSON.parse(result.stdout), exceptions);
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
