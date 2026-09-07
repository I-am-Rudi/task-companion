import { toggleTagOnLines, addTag, removeTag, isTaggedTask, hasTag } from "../src/tagging.ts";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
	const g = JSON.stringify(got), w = JSON.stringify(want);
	if (g === w) { pass++; } else { fail++; console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`); }
};

const TAG = "#task";

// --- add ---------------------------------------------------------------
eq("tag a plain checkbox", addTag("- [ ] write the docs", TAG, true), "- [ ] #task write the docs");
eq("preserve status", addTag("- [/] write the docs", TAG, true), "- [/] #task write the docs");
eq("preserve marker + indent", addTag("\t* [ ] nested", TAG, true), "\t* [ ] #task nested");
eq("already tagged is untouched", addTag("- [ ] #task done deal", TAG, true), "- [ ] #task done deal");
eq("tag mid-line counts", addTag("- [ ] fix #task later", TAG, true), "- [ ] fix #task later");
eq("empty checkbox", addTag("- [ ] ", TAG, true), "- [ ] #task");
eq("promote plain bullet", addTag("- write the docs", TAG, true), "- [ ] #task write the docs");
eq("promote prose", addTag("  write the docs", TAG, true), "  - [ ] #task write the docs");
eq("no promote leaves bullet", addTag("- write the docs", TAG, false), "- write the docs");
eq("heading untouched", addTag("## Tasks", TAG, true), "## Tasks");
eq("quote untouched", addTag("> quoted", TAG, true), "> quoted");
eq("fence untouched", addTag("```js", TAG, true), "```js");
eq("blank untouched", addTag("", TAG, true), "");
eq("bullet already carrying tag text", addTag("- #task write", TAG, true), "- [ ] #task write");

// --- remove ------------------------------------------------------------
eq("remove tag", removeTag("- [ ] #task write the docs", TAG), "- [ ] write the docs");
eq("remove mid-line tag", removeTag("- [x] fix #task later", TAG), "- [x] fix later");
eq("remove keeps status+indent", removeTag("  * [/] #task nested", TAG), "  * [/] nested");
eq("remove leaving nothing", removeTag("- [ ] #task", TAG), "- [ ]");
eq("subtag is not the tag", removeTag("- [ ] #task/work thing", TAG), "- [ ] #task/work thing");
eq("non-task untouched", removeTag("- #task plain", TAG), "- #task plain");

// --- detection ---------------------------------------------------------
eq("isTaggedTask true", isTaggedTask("- [ ] #task a", TAG), true);
eq("isTaggedTask false for prefix match", isTaggedTask("- [ ] #tasks a", TAG), false);
eq("hasTag word boundary", hasTag("#taskish", TAG), false);
eq("tag with regex chars", addTag("- [ ] a", "#to.do", true), "- [ ] #to.do a");

// --- toggle over a selection ------------------------------------------
eq("mixed selection tags all",
	toggleTagOnLines(["- [ ] one", "- [ ] #task two"], TAG, true),
	["- [ ] #task one", "- [ ] #task two"]);
eq("fully tagged selection untags all",
	toggleTagOnLines(["- [ ] #task one", "- [ ] #task two"], TAG, true),
	["- [ ] one", "- [ ] two"]);
eq("blank lines and headings ride along untouched",
	toggleTagOnLines(["## Tasks", "", "- [ ] one"], TAG, true),
	["## Tasks", "", "- [ ] #task one"]);
eq("untag ignores non-task lines when deciding",
	toggleTagOnLines(["- [ ] #task one", "", "- [ ] #task two"], TAG, true),
	["- [ ] one", "", "- [ ] two"]);
eq("nothing eligible is a no-op",
	toggleTagOnLines(["## Tasks", ""], TAG, true),
	["## Tasks", ""]);
eq("promote off skips prose",
	toggleTagOnLines(["plain prose", "- [ ] one"], TAG, false),
	["plain prose", "- [ ] #task one"]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
