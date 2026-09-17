import { readBlock, removeBlock, insertUnderHeading, moveTask, moveTasksInRanges, taskBlocksIn, editTaskLine, markDone, setStatus, isOpenStatus, withDate, stripAnnotations } from "../src/actions.ts";
import { parseTasks } from "../src/taskIndex.ts";
import { TFile } from "obsidian";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
	const g = JSON.stringify(got), w = JSON.stringify(want);
	if (g === w) pass++; else { fail++; console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`); }
};

function makeApp(files) {
	const store = new Map(Object.entries(files));
	return {
		read: (p) => store.get(p),
		app: {
			vault: {
				getFileByPath: (p) => (store.has(p) ? new TFile(p) : null),
				cachedRead: async (f) => store.get(f.path),
				process: async (f, fn) => { store.set(f.path, fn(store.get(f.path))); }
			},
			// Nothing is open: every write goes through Vault.process.
			workspace: { getActiveViewOfType: () => null }
		}
	};
}

const task = (path, content, n = 0) => parseTasks(path, content)[n];

async function main() {
// readBlock
{
	const src = ["# Day", "- [ ] #task parent", "\t- [ ] sub one", "\t\t- note under sub", "- [ ] #task other"].join("\n");
	const { app } = makeApp({ "a.md": src });
	// The parent is already at column zero, so nothing is stripped and the
	// subtasks keep the indentation that nests them under it.
	eq("block carries subtasks", await readBlock(app, task("a.md", src)),
		["- [ ] #task parent", "\t- [ ] sub one", "\t\t- note under sub"]);
	eq("later task is its own block", await readBlock(app, task("a.md", src, 1)), ["- [ ] #task other"]);
}
{
	const src = ["- [ ] #task parent", "", "\t- [ ] orphan"].join("\n");
	const { app } = makeApp({ "a.md": src });
	eq("a blank line ends the block", await readBlock(app, task("a.md", src)), ["- [ ] #task parent"]);
}
{
	const src = "- [ ] #task parent  [scheduled:: 2026-01-01]";
	const { app } = makeApp({ "a.md": src });
	eq("annotations stripped from the parent line", await readBlock(app, task("a.md", src)), ["- [ ] #task parent"]);
}

{
	// An indented parent is dedented to column zero; its subtasks shift with it.
	const src = ["- [ ] outer", "\t- [ ] #task parent", "\t\t- [ ] sub"].join("\n");
	const { app } = makeApp({ "a.md": src });
	eq("indented block is dedented, relative indent kept",
		await readBlock(app, parseTasks("a.md", src)[0].children[0]),
		["- [ ] #task parent", "\t- [ ] sub"]);
}

// removeBlock
{
	const src = ["# Day", "- [ ] #task parent", "\t- [ ] sub", "- [ ] #task keep"].join("\n");
	const { app, read } = makeApp({ "a.md": src });
	await removeBlock(app, task("a.md", src));
	eq("removes the whole block, leaves the rest", read("a.md"), "# Day\n- [ ] #task keep");
}
{
	const src = ["# Day", "- [ ] #task last", "\t- [ ] sub"].join("\n");
	const { app, read } = makeApp({ "a.md": src });
	await removeBlock(app, task("a.md", src));
	eq("removing through end of file", read("a.md"), "# Day");
}

// insertUnderHeading
{
	const { app, read } = makeApp({ "t.md": "# Today\n\n## Tasks\n\n## Notes\n" });
	eq("reports success", await insertUnderHeading(app, "t.md", "## Tasks", ["- [ ] #task new"]), true);
	eq("inserts directly beneath the heading", read("t.md"), "# Today\n\n## Tasks\n- [ ] #task new\n\n## Notes\n");
}
{
	const { app, read } = makeApp({ "t.md": "# Today\n" });
	await insertUnderHeading(app, "t.md", "## Tasks", ["- [ ] #task new"]);
	eq("appends the heading when missing", read("t.md"), "# Today\n\n## Tasks\n- [ ] #task new");
}
{
	const { app, read } = makeApp({ "t.md": "# Today" });
	await insertUnderHeading(app, "t.md", "## Tasks", ["- [ ] #task new"]);
	eq("appends with a blank line on an unterminated file", read("t.md"), "# Today\n\n## Tasks\n- [ ] #task new");
}
{
	const { app, read } = makeApp({ "t.md": "# Today\n### Tasks\ntail" });
	await insertUnderHeading(app, "t.md", "## Tasks", ["- [ ] x"]);
	eq("heading matches regardless of level", read("t.md"), "# Today\n### Tasks\n- [ ] x\ntail");
}
{
	const { app } = makeApp({ "t.md": "# Today" });
	eq("missing note reports failure", await insertUnderHeading(app, "nope.md", "## Tasks", ["- [ ] x"]), false);
}
{
	const { app, read } = makeApp({ "Today.md": "# Today\n## Tasks\n" });
	await insertUnderHeading(app, "Today", "## Tasks", ["- [ ] x"]);
	eq("path without .md resolves", read("Today.md"), "# Today\n## Tasks\n- [ ] x\n");
}

// moveTask
{
	const src = ["# Yesterday", "- [ ] #task carry me", "\t- [ ] sub"].join("\n");
	const { app, read } = makeApp({ "y.md": src, "t.md": "# Today\n## Tasks\n" });
	eq("move reports success", await moveTask(app, task("y.md", src), "t.md", "## Tasks"), true);
	eq("target gained the block", read("t.md"), "# Today\n## Tasks\n- [ ] #task carry me\n\t- [ ] sub\n");
	eq("source lost the block", read("y.md"), "# Yesterday");
}
{
	const src = "- [ ] #task carry me";
	const { app, read } = makeApp({ "y.md": src });
	eq("move to a missing note fails", await moveTask(app, task("y.md", src), "gone.md", "## Tasks"), false);
	eq("and leaves the source intact", read("y.md"), "- [ ] #task carry me");
}

// editTaskLine
{
	const src = ["intro", "- [ ] #task tick me", "- [ ] #task other"].join("\n");
	const { app, read } = makeApp({ "a.md": src });
	await editTaskLine(app, task("a.md", src, 1), markDone);
	eq("ticks the right line", read("a.md"), "intro\n- [ ] #task tick me\n- [x] #task other");
}
{
	const src = ["new line added above", "- [ ] #task find me"].join("\n");
	const { app, read } = makeApp({ "a.md": src });
	const stale = { ...task("a.md", src), line: 0 };
	await editTaskLine(app, stale, markDone);
	eq("stale line number recovers by content", read("a.md"), "new line added above\n- [x] #task find me");
}
{
	const src = "- [ ] #task schedule me";
	const { app, read } = makeApp({ "a.md": src });
	await editTaskLine(app, task("a.md", src), (l) => withDate(l, "scheduled", "2026-01-31", "dataview"));
	eq("dataview schedule", read("a.md"), "- [ ] #task schedule me  [scheduled:: 2026-01-31]");
}
{
	const src = "- [ ] #task schedule me ⏳ 2025-01-01";
	const { app, read } = makeApp({ "a.md": src });
	await editTaskLine(app, task("a.md", src), (l) => withDate(l, "scheduled", "2026-01-31", "emoji"));
	eq("emoji schedule replaces the old date", read("a.md"), "- [ ] #task schedule me ⏳ 2026-01-31");
}
{
	const src = "- [ ] #task gone";
	const { app } = makeApp({ "a.md": "unrelated content" });
	eq("missing task reports failure", await editTaskLine(app, task("a.md", src), markDone), false);
}

// --- task statuses ------------------------------------------------------
eq("in progress", setStatus("- [ ] #task a", "/"), "- [/] #task a");
eq("cancelled, indented", setStatus("\t- [ ] #task a", "-"), "\t- [-] #task a");
eq("back to todo", setStatus("- [x] #task a", " "), "- [ ] #task a");
eq("only the checkbox changes", setStatus("- [ ] see [x] in text", "/"), "- [/] see [x] in text");
eq("open statuses", [" ", "", "/", "x", "X", "-"].map(isOpenStatus), [true, true, true, false, false, false]);
{
	const src = ["intro", "- [ ] #task start me"].join("\n");
	const { app, read } = makeApp({ "a.md": src });
	await editTaskLine(app, task("a.md", src), (l) => setStatus(l, "/"));
	eq("status written to the source", read("a.md"), "intro\n- [/] #task start me");
}

// --- which blocks a selection moves ------------------------------------------
{
	const lines = ["# Day", "- [ ] one", "\t- [ ] sub", "- [ ] two", "prose", "- [ ] three"];
	eq("cursor on a parent takes its subtasks",
		taskBlocksIn(lines, [{ from: 1, to: 1 }]), [{ start: 1, end: 3 }]);
	eq("a subtask inside a taken block isn't taken twice",
		taskBlocksIn(lines, [{ from: 1, to: 3 }]), [{ start: 1, end: 3 }, { start: 3, end: 4 }]);
	eq("cursor on a subtask takes only it",
		taskBlocksIn(lines, [{ from: 2, to: 2 }]), [{ start: 2, end: 3 }]);
	eq("non-task lines contribute nothing",
		taskBlocksIn(lines, [{ from: 0, to: 0 }, { from: 4, to: 4 }]), []);
	eq("several cursors, in file order",
		taskBlocksIn(lines, [{ from: 5, to: 5 }, { from: 3, to: 3 }]), [{ start: 3, end: 4 }, { start: 5, end: 6 }]);
}

// --- moving a selection to the collection note ------------------------------
{
	const src = ["# Day", "- [ ] #task park me  [scheduled:: 2026-09-20] 📅 2026-09-30", "\t- [ ] sub", "- [ ] stay", "- [ ] untagged too ⏳ 2026-09-18"].join("\n");
	const { app, read } = makeApp({ "d.md": src, "c.md": "## Tasks\n" });
	eq("reports what moved",
		await moveTasksInRanges(app, "d.md", [{ from: 1, to: 1 }, { from: 4, to: 4 }], "c.md", "## Tasks"),
		{ moved: 2, cut: true });
	eq("collection gains both, dates stripped, subtask kept", read("c.md"),
		"## Tasks\n- [ ] #task park me\n\t- [ ] sub\n- [ ] untagged too\n");
	eq("source loses both", read("d.md"), "# Day\n- [ ] stay");
}
{
	const src = ["- [ ] a", "- [ ] b", "- [ ] c"].join("\n");
	const { app, read } = makeApp({ "d.md": src, "c.md": "" });
	await moveTasksInRanges(app, "d.md", [{ from: 0, to: 1 }], "c.md", "## Tasks");
	eq("adjacent blocks cut as one run", read("d.md"), "- [ ] c");
}
{
	const { app } = makeApp({ "d.md": "just prose", "c.md": "" });
	eq("nothing to move", await moveTasksInRanges(app, "d.md", [{ from: 0, to: 0 }], "c.md", "## Tasks"), null);
}
{
	const { app, read } = makeApp({ "d.md": "- [ ] a" });
	eq("missing target reports failure",
		await moveTasksInRanges(app, "d.md", [{ from: 0, to: 0 }], "gone.md", "## Tasks"), { moved: 0, cut: false });
	eq("and leaves the source intact", read("d.md"), "- [ ] a");
}

// --- emoji dates are stripped whole --------------------------------------
// 📅 🛫 🔁 are two UTF-16 code units each; stripping must take both halves.
{
	const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/;
	for (const emoji of ["📅", "🛫", "🔁", "⏳", "✅"]) {
		const stripped = stripAnnotations(`write it up ${emoji} 2026-01-01`);
		eq(`${emoji} date strips cleanly`, [stripped, lone.test(stripped)], ["write it up", false]);
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
}
main();
