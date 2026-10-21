/**
 * Set up a Twenty workspace with every object and field the dialer uses
 * (manifest.ts). Additive and safe to re-run.
 *
 *   bun run twenty:schema          create whatever is missing, then tidy the sidebar
 *   bun run twenty:schema:check    dry run: only report what is missing
 *   ... -- --json                  print the full report as JSON
 *   ... -- --no-sidebar            skip the sidebar step
 *   ... -- --sidebar-only          only run the sidebar step
 *   ... -- --restore-sidebar       put back the entries the last run removed
 *
 * The sidebar step removes the navigation entries of the dialer's own objects
 * (sidebar.ts) so the workspace sidebar keeps only the business objects. No
 * object, field or record is deleted.
 *
 * Reads TWENTY_BASE_URL / TWENTY_API_KEY from the environment, then from
 * .env.local (repo root, then backend/). Exits 1 when anything failed, or in
 * a dry run when anything is missing.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ApplyItem } from "./types.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");

/** KEY=value lines; the real environment and earlier files win. */
function loadEnvFiles(): void {
  for (const file of [path.join(ROOT, ".env.local"), path.join(ROOT, "backend", ".env.local")]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

loadEnvFiles();
const dryRun = process.argv.includes("--dry-run");
const asJson = process.argv.includes("--json");
if (!process.env.TWENTY_BASE_URL || !process.env.TWENTY_API_KEY) {
  console.error("TWENTY_BASE_URL and TWENTY_API_KEY must be set (environment or .env.local).");
  process.exit(1);
}

const sidebarOnly = process.argv.includes("--sidebar-only");
const skipSidebar = process.argv.includes("--no-sidebar");
const restoreSidebar = process.argv.includes("--restore-sidebar");
const backupFile = path.join(ROOT, ".scratch", "twenty-sidebar-backup.json");

// Imported after the env is loaded: the logger and client read it.
const { applySchema, metadataRequest } = await import("./applySchema.js");
const { hideInternalObjects, readSidebarBackup } = await import("./sidebar.js");

const line = (i: ApplyItem) =>
  `  ${i.status.padEnd(8)} ${i.kind.padEnd(9)} ${i.object}.${i.name}${i.note ? `  (${i.note})` : ""}`;

try {
  if (!sidebarOnly) {
    const report = await applySchema({ dryRun, onItem: asJson ? undefined : (i) => i.status !== "present" && console.log(line(i)) });
    const count = (s: ApplyItem["status"]) => report.items.filter((i) => i.status === s).length;
    const drift = report.items.filter((i) => i.status === "present" && i.note);
    if (asJson) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      for (const i of drift) console.log(line(i));
      console.log(
        `\n${dryRun ? "Dry run" : "Applied"} against ${process.env.TWENTY_BASE_URL}: ` +
          `${count("present")} present, ${dryRun ? `${count("missing")} missing` : `${count("created")} created`}, ` +
          `${count("failed")} failed, ${drift.length} drifted.`,
      );
    }
    if (count("failed") > 0 || (dryRun && count("missing") > 0)) process.exitCode = 1;
  }

  if (!skipSidebar) {
    const restore = restoreSidebar && existsSync(backupFile) ? JSON.parse(readFileSync(backupFile, "utf8")).items : undefined;
    if (restoreSidebar && !restore) console.error(`No sidebar backup at ${backupFile}; nothing to restore.`);
    else {
      if (!restore) {
        // Read the rows before they go, so `--restore-sidebar` can put them back.
        const items = await readSidebarBackup(metadataRequest);
        if (!dryRun && items.length > 0) {
          mkdirSync(path.dirname(backupFile), { recursive: true });
          writeFileSync(backupFile, JSON.stringify({ takenAt: new Date().toISOString(), items }, null, 2));
        }
      }
      const sidebar = await hideInternalObjects(metadataRequest, { dryRun, restore });
      const done = sidebar.changes.filter((c) => c.status === "done").length;
      const planned = sidebar.changes.filter((c) => c.status === "planned").length;
      const failed = sidebar.changes.filter((c) => c.status === "failed");
      if (asJson) {
        console.log(JSON.stringify(sidebar, null, 2));
      } else {
        for (const c of sidebar.changes) {
          const mark = c.status === "done" ? "  " : c.status === "planned" ? "? " : "! ";
          if (c.status !== "failed") console.log(`  sidebar ${mark}${c.action.padEnd(9)} ${c.object}${c.name ? `  (${c.name})` : ""}`);
          else console.log(`  sidebar !  FAILED    ${c.object}  (${c.note})`);
        }
        const verb = restore ? "restored" : dryRun ? "would hide" : "hidden";
        console.log(
          `\nSidebar against ${process.env.TWENTY_BASE_URL}: ${dryRun ? `${planned} entries ` + verb : `${done} entries ` + verb}` +
            `, ${sidebar.alreadyHidden.length} already absent, ${failed.length} failed.`,
        );
        if (sidebar.alreadyHidden.length) console.log(`  already absent: ${sidebar.alreadyHidden.join(", ")}`);
      }
      if (failed.length > 0) process.exitCode = 1;
    }
  }
} catch (err) {
  console.error(`Schema setup failed: ${(err as Error).message}`);
  process.exit(1);
}
