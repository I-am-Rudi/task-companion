/*
 * A minimal test runner: bundle each suite with esbuild — swapping the
 * `obsidian` module for a stub — and run it in node. esbuild is already a
 * build dependency, so this adds no tooling of its own.
 *
 *   npm test              run every suite
 *   npm test -- tagging   run the suites whose name matches
 */
import { build } from "esbuild";
import { readdirSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { spawnSync } from "child_process";

const here = dirname(fileURLToPath(import.meta.url));
const filter = process.argv[2];

const suites = readdirSync(here)
	.filter((name) => name.endsWith(".test.mjs"))
	.filter((name) => !filter || name.includes(filter))
	.sort();

if (suites.length === 0) {
	console.error(filter ? `No suites match "${filter}".` : "No suites found.");
	process.exit(1);
}

const outDir = mkdtempSync(join(tmpdir(), "trc-tests-"));
let failed = 0;

try {
	for (const suite of suites) {
		const outfile = join(outDir, suite.replace(".test.mjs", ".bundle.mjs"));

		await build({
			entryPoints: [join(here, suite)],
			outfile,
			bundle: true,
			format: "esm",
			platform: "node",
			target: "esnext",
			alias: { obsidian: join(here, "obsidian-stub.mjs") },
			logLevel: "error"
		});

		console.log(`\n── ${suite.replace(".test.mjs", "")} ${"─".repeat(Math.max(0, 40 - suite.length))}`);
		const result = spawnSync(process.execPath, [outfile], { stdio: "inherit" });
		if (result.status !== 0) failed++;
	}
} finally {
	rmSync(outDir, { recursive: true, force: true });
}

if (failed > 0) {
	console.error(`\n${failed} of ${suites.length} suites failed.`);
	process.exit(1);
}
console.log(`\nAll ${suites.length} suites passed.`);
