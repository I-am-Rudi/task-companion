import { configFor, dateOf, granularityOf, allPeriodicFolders, DEFAULT_FORMAT } from "../src/periodic.ts";
import { normalizeFolder, normalizeNotePath, inFolder, inAnyFolder } from "../src/paths.ts";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
	const g = JSON.stringify(got), w = JSON.stringify(want);
	if (g === w) pass++; else { fail++; console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`); }
};

const fallback = {
	day: { folder: "Journal/Daily", format: DEFAULT_FORMAT.day },
	week: { folder: "Journal/Weekly", format: DEFAULT_FORMAT.week },
	month: { folder: "Journal/Monthly", format: DEFAULT_FORMAT.month },
	quarter: { folder: "Journal/Quarterly", format: DEFAULT_FORMAT.quarter },
	year: { folder: "Journal/Yearly", format: DEFAULT_FORMAT.year }
};

const bare = { plugins: { plugins: {} } };
const withPN = (settings) => ({ plugins: { plugins: { "periodic-notes": { settings } } } });

// paths
eq("folder trailing slash", normalizeFolder("Journal/Daily/"), "Journal/Daily");
eq("folder leading slash", normalizeFolder("/Journal//Daily"), "Journal/Daily");
eq("empty folder is the vault root", normalizeFolder("  "), "");
eq("root folder normalises to empty", normalizeFolder("/"), "");
eq("note path gains .md", normalizeNotePath("Some/Note"), "Some/Note.md");
eq("note path keeps .md", normalizeNotePath("Some/Note.md"), "Some/Note.md");
eq("note path uppercase extension kept once", normalizeNotePath("Note.MD"), "Note.MD");
eq("root-level file is in the root folder", inFolder("Note.md", ""), true);
eq("nested file is not in the root folder", inFolder("A/Note.md", ""), false);
eq("empty folders never match", inAnyFolder("Note.md", ["", "Other"]), false);

// Periodic Notes absent: fall back to our own settings
eq("fallback config", configFor(bare, "day", fallback), { folder: "Journal/Daily", format: "YYYY-MM-DD" });
eq("detects a daily note", granularityOf(bare, "Journal/Daily/2026-09-03.md", fallback), "day");
eq("detects a quarterly note", granularityOf(bare, "Journal/Quarterly/2026-Q3.md", fallback), "quarter");
eq("a note outside the folders is not periodic", granularityOf(bare, "Projects/2026-09-03.md", fallback), null);
eq("a malformed name is not periodic", granularityOf(bare, "Journal/Daily/Scratch.md", fallback), null);
eq("periodic folders collected", allPeriodicFolders(bare, fallback).length, 5);

// Periodic Notes present: its folders and formats win
const pn = withPN({ daily: { enabled: true, folder: "PN/Days/", format: "DD-MM-YYYY" } });
eq("periodic notes folder wins", configFor(pn, "day", fallback), { folder: "PN/Days", format: "DD-MM-YYYY" });
eq("its format is applied", granularityOf(pn, "PN/Days/03-09-2026.md", fallback), "day");
eq("our folder no longer matches", granularityOf(pn, "Journal/Daily/2026-09-03.md", fallback), null);
eq("granularity it does not define still falls back",
	configFor(pn, "week", fallback), { folder: "Journal/Weekly", format: "gggg-[W]ww" });
eq("a disabled granularity falls back",
	configFor(withPN({ daily: { enabled: false, folder: "PN/Days" } }), "day", fallback),
	{ folder: "Journal/Daily", format: "YYYY-MM-DD" });
eq("a missing format falls back to the default",
	configFor(withPN({ daily: { folder: "PN/Days" } }), "day", fallback),
	{ folder: "PN/Days", format: "YYYY-MM-DD" });
eq("an empty settings object falls back",
	configFor(withPN({}), "day", fallback), { folder: "Journal/Daily", format: "YYYY-MM-DD" });
eq("a plugin with no settings at all falls back",
	configFor({ plugins: { plugins: { "periodic-notes": {} } } }, "day", fallback),
	{ folder: "Journal/Daily", format: "YYYY-MM-DD" });

// Commitment #4: never show future tasks. Dates are compared, not paths.
{
	const cfg = configFor(bare, "day", fallback);
	const today = dateOf("Journal/Daily/2026-09-03.md", cfg);
	const past = dateOf("Journal/Daily/2026-09-02.md", cfg);
	const future = dateOf("Journal/Daily/2026-09-04.md", cfg);
	eq("yesterday is before today", past.isBefore(today), true);
	eq("tomorrow is not before today", future.isBefore(today), false);
	eq("a note outside the folder has no date", dateOf("Other/2026-09-02.md", cfg), null);
}
{
	const cfg = configFor(bare, "week", fallback);
	eq("last week is before this week",
		dateOf("Journal/Weekly/2026-W35.md", cfg).isBefore(dateOf("Journal/Weekly/2026-W36.md", cfg)), true);
	eq("next week is not before this week",
		dateOf("Journal/Weekly/2026-W37.md", cfg).isBefore(dateOf("Journal/Weekly/2026-W36.md", cfg)), false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
