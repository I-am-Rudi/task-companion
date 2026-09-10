import { taskLineIndices } from "../src/inline.ts";
import { dateOn, lineSubject, parseFieldPrefix } from "../src/actions.ts";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
	const g = JSON.stringify(got), w = JSON.stringify(want);
	if (g === w) pass++; else { fail++; console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`); }
};

// --- pairing rendered task items with their source lines ---------------
eq("finds every task line",
	taskLineIndices(["- [ ] one", "- [x] two", "\t- [ ] nested"]),
	[0, 1, 2]);
eq("skips prose and bullets",
	taskLineIndices(["## Tasks", "- plain bullet", "- [ ] one", ""]),
	[2]);
eq("ignores tasks inside a fence",
	taskLineIndices(["- [ ] one", "\t```", "\t- [ ] not a task", "\t```", "- [ ] two"]),
	[0, 4]);
eq("tilde fences count too",
	taskLineIndices(["~~~", "- [ ] hidden", "~~~", "- [ ] shown"]),
	[3]);
eq("an unclosed fence swallows the rest",
	taskLineIndices(["- [ ] one", "```", "- [ ] two"]),
	[0]);
eq("no tasks at all", taskLineIndices(["just prose"]), []);

// --- the subject shown in the prompt -----------------------------------
eq("checkbox, tag and annotations all go",
	lineSubject("  - [ ] #task write it up  [scheduled:: 2026-09-12]", "#task"),
	"write it up");
eq("emoji annotation goes too",
	lineSubject("- [x] #task write it up ⏳ 2026-09-12", "#task"),
	"write it up");
eq("an untagged task still reads",
	lineSubject("- [ ] write it up", "#task"), "write it up");
eq("other tags stay",
	lineSubject("- [ ] #task write it up #work", "#task"), "write it up #work");

// --- reading a date back off a line ------------------------------------
eq("dataview date", dateOn("- [ ] a  [scheduled:: 2026-09-12]", "scheduled"), "2026-09-12");
eq("emoji date", dateOn("- [ ] a ⏳ 2026-09-12", "scheduled"), "2026-09-12");
eq("no date", dateOn("- [ ] a", "scheduled"), null);
eq("a due date is not a scheduled date", dateOn("- [ ] a  [due:: 2026-09-12]", "scheduled"), null);
eq("due, dataview", dateOn("- [ ] a  [due:: 2026-09-12]", "due"), "2026-09-12");
eq("due, emoji", dateOn("- [ ] a 📅 2026-09-12", "due"), "2026-09-12");
eq("start, emoji", dateOn("- [ ] a 🛫 2026-09-12", "start"), "2026-09-12");
eq("each field reads its own",
	["scheduled", "due", "start"].map((f) => dateOn("- [ ] a ⏳ 2026-01-01 📅 2026-02-02 🛫 2026-03-03", f)),
	["2026-01-01", "2026-02-02", "2026-03-03"]);

// --- a field named at the head of the input -----------------------------
eq("due prefix", parseFieldPrefix("due friday"), { field: "due", rest: "friday" });
eq("start prefix", parseFieldPrefix("start +3d"), { field: "start", rest: "+3d" });
eq("scheduled prefix and its short forms",
	["scheduled", "schedule", "sched"].map((w) => parseFieldPrefix(w + " fri").field),
	["scheduled", "scheduled", "scheduled"]);
eq("case ignored", parseFieldPrefix("DUE fri"), { field: "due", rest: "fri" });
eq("a bare field name leaves nothing to parse",
	parseFieldPrefix("due"), { field: "due", rest: "" });
eq("no prefix passes the input through",
	parseFieldPrefix("friday"), { field: null, rest: "friday" });
eq("a date is not a prefix", parseFieldPrefix("2026-09-12"), { field: null, rest: "2026-09-12" });
eq("an unknown word is not a prefix",
	parseFieldPrefix("duesday fri"), { field: null, rest: "duesday fri" });
eq("empty input", parseFieldPrefix(""), { field: null, rest: "" });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
