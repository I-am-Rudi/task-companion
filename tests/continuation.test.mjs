import { EditorState } from "@codemirror/state";
import { tagContinuationHandler } from "../src/tagging.ts";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
	const g = JSON.stringify(got), w = JSON.stringify(want);
	if (g === w) pass++; else { fail++; console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`); }
};

const run = tagContinuationHandler(() => "#task", () => true);

/** Simulate Enter at the "|" marker. Returns the resulting doc, or null if
 *  the handler declined and Obsidian's own list continuation would run. */
function press(docWithCursor, handler = run) {
	const anchor = docWithCursor.indexOf("|");
	const doc = docWithCursor.replace("|", "");
	const state = EditorState.create({ doc, selection: { anchor } });
	let result = null;
	const view = { state, dispatch: (tr) => { result = state.update(tr).state.doc.toString(); } };
	const claimed = handler(view);
	return claimed ? result : null;
}

eq("continues at end of line",
	press("- [ ] #task write the docs|"),
	"- [ ] #task write the docs\n- [ ] #task ");

eq("keeps indent and marker",
	press("\t* [ ] #task nested|"),
	"\t* [ ] #task nested\n\t* [ ] #task ");

eq("new item is always unchecked",
	press("- [x] #task done|"),
	"- [x] #task done\n- [ ] #task ");

eq("splits mid-content, tag on the new line only",
	press("- [ ] #task write |the docs"),
	"- [ ] #task write \n- [ ] #task the docs");

eq("declines on an empty tagged item (enter ends the list)",
	press("- [ ] #task |"), null);
eq("declines on an untagged task", press("- [ ] plain|"), null);
eq("declines on a plain bullet", press("- plain|"), null);
eq("declines on prose", press("just typing|"), null);
eq("declines on an ordered list", press("1. [ ] #task numbered|"), null);
eq("declines with the cursor before the tag", press("- [ ] |#task write"), null);
eq("declines with the cursor inside the tag", press("- [ ] #ta|sk write"), null);
eq("declines with the cursor in the bullet", press("- |[ ] #task write"), null);
eq("continues from just after the tag", press("- [ ] #task| write"),
	"- [ ] #task\n- [ ] #task  write");

eq("declines when the setting is off",
	press("- [ ] #task write|", tagContinuationHandler(() => "#task", () => false)), null);
eq("declines when no tag is configured",
	press("- [ ] #task write|", tagContinuationHandler(() => "", () => true)), null);

// A selection is a replace-and-split; leave it to Obsidian.
const st = EditorState.create({ doc: "- [ ] #task a b", selection: { anchor: 8, head: 12 } });
eq("declines with a non-empty selection", run({ state: st, dispatch: () => {} }), false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
