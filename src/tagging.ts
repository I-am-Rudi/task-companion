import { Extension, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { Editor, EditorChange } from "obsidian";

/**
 * A checklist line, split into its parts:
 * indent, bullet marker, gap, checkbox status, content.
 */
const TASK_LINE_RE = /^([ \t]*)([-*+])([ \t]+)\[(.)\][ \t]?(.*)$/;

/** A plain bullet, with no checkbox. */
const BULLET_LINE_RE = /^([ \t]*)([-*+])([ \t]+)(.*)$/;

/** Lines that are structure rather than content, and are never promoted. */
const NON_CONTENT_RE = /^[ \t]*(#{1,6}\s|>|```|~~~|\||---\s*$|===)/;

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Matches the tag as a whole word. No lookbehind — it is unsupported on iOS
 * below 16.4 — so the leading boundary is captured rather than asserted.
 */
export function tagRegExp(tag: string, flags = ""): RegExp {
	return new RegExp("(^|\\s)" + escapeRegExp(tag) + "(?=\\s|$)", flags);
}

export function hasTag(text: string, tag: string): boolean {
	if (!tag) return false;
	return tagRegExp(tag).test(text);
}

/** Is this line a checklist item carrying the tag? */
export function isTaggedTask(line: string, tag: string): boolean {
	const match = line.match(TASK_LINE_RE);
	return match !== null && hasTag(match[5], tag);
}

/**
 * Would the toggle command touch this line? Task lines always; bullets and
 * prose only when the plugin is allowed to promote them into tasks.
 */
export function isToggleable(line: string, promote: boolean): boolean {
	if (TASK_LINE_RE.test(line)) return true;
	if (!promote) return false;
	if (line.trim() === "") return false;
	return !NON_CONTENT_RE.test(line);
}

function joinContent(tag: string, content: string): string {
	return content ? tag + " " + content : tag;
}

/**
 * Put the tag between the checkbox and the content — `- [ ] #task write it up`
 * — creating the checkbox first if the line is a plain bullet or plain prose
 * and promotion is allowed. Lines that already carry the tag are left alone.
 */
export function addTag(line: string, tag: string, promote: boolean): string {
	const task = line.match(TASK_LINE_RE);
	if (task) {
		const [, indent, marker, gap, status, content] = task;
		if (hasTag(content, tag)) return line;
		return indent + marker + gap + "[" + status + "] " + joinContent(tag, content);
	}

	if (!promote || !isToggleable(line, promote)) return line;

	const bullet = line.match(BULLET_LINE_RE);
	if (bullet) {
		const [, indent, marker, gap, content] = bullet;
		if (hasTag(content, tag)) return indent + marker + gap + "[ ] " + content;
		return indent + marker + gap + "[ ] " + joinContent(tag, content);
	}

	const indent = (line.match(/^[ \t]*/) ?? [""])[0];
	const content = line.slice(indent.length);
	if (hasTag(content, tag)) return indent + "- [ ] " + content;
	return indent + "- [ ] " + joinContent(tag, content);
}

/** Drop the tag from a line's content, leaving the checkbox in place. */
export function removeTag(line: string, tag: string): string {
	const task = line.match(TASK_LINE_RE);
	if (!task) return line;

	const [, indent, marker, gap, status, content] = task;
	const stripped = content
		.replace(tagRegExp(tag, "g"), "$1")
		.replace(/[ \t]{2,}/g, " ")
		.trim();

	return indent + marker + gap + "[" + status + "]" + (stripped ? " " + stripped : "");
}

/**
 * Toggle across a set of lines as a unit: the tag is removed only when every
 * affected line already carries it, so a mixed selection tags everything.
 * Returns one entry per input line; unchanged lines come back identical.
 */
export function toggleTagOnLines(lines: string[], tag: string, promote: boolean): string[] {
	const affected = lines.filter((line) => isToggleable(line, promote));
	if (affected.length === 0) return lines;

	const removing = affected.every((line) => isTaggedTask(line, tag));

	return lines.map((line) => {
		if (!isToggleable(line, promote)) return line;
		return removing ? removeTag(line, tag) : addTag(line, tag, promote);
	});
}

/**
 * Apply the toggle to every line the cursors or selections touch, as a single
 * transaction so it is one undo step.
 */
export function toggleTagInEditor(editor: Editor, tag: string, promote: boolean): number {
	const lineNumbers = new Set<number>();
	for (const selection of editor.listSelections()) {
		const from = Math.min(selection.anchor.line, selection.head.line);
		const to = Math.max(selection.anchor.line, selection.head.line);
		for (let line = from; line <= to; line++) lineNumbers.add(line);
	}

	const sorted = Array.from(lineNumbers).sort((a, b) => a - b);
	const original = sorted.map((line) => editor.getLine(line));
	const toggled = toggleTagOnLines(original, tag, promote);

	const changes: EditorChange[] = [];
	for (let i = 0; i < sorted.length; i++) {
		if (toggled[i] === original[i]) continue;
		changes.push({
			from: { line: sorted[i], ch: 0 },
			to: { line: sorted[i], ch: original[i].length },
			text: toggled[i]
		});
	}

	if (changes.length) editor.transaction({ changes });
	return changes.length;
}

/**
 * Enter on a tagged task continues the list with the tag already in place.
 *
 * This runs ahead of Obsidian's own list continuation and performs the whole
 * insertion itself, because there is no way to post-process the line Obsidian
 * inserts. It claims the keypress only for the narrow case it understands — a
 * tagged, non-empty, unordered checklist item with the cursor past the tag —
 * and returns false everywhere else so the built-in behaviour stands. Notably,
 * an empty tagged item falls through, so enter still ends the list.
 */
export function tagContinuationHandler(
	getTag: () => string,
	isEnabled: () => boolean
): (view: EditorView) => boolean {
	return (view: EditorView): boolean => {
		const tag = getTag();
		if (!isEnabled() || !tag) return false;

		const range = view.state.selection.main;
		if (!range.empty) return false;

		const line = view.state.doc.lineAt(range.head);
		const match = line.text.match(TASK_LINE_RE);
		if (!match) return false;

		const [, indent, marker, gap, , content] = match;

		const tagMatch = content.match(tagRegExp(tag));
		if (!tagMatch || tagMatch.index === undefined) return false;

		// An item holding nothing but the tag is an empty item: let Obsidian
		// end the list rather than extending it.
		if (removeTag(line.text, tag).match(TASK_LINE_RE)?.[5].trim() === "") return false;

		// Splitting at or before the tag would carry the tag onto both halves,
		// so only a cursor past it is treated as continuing the item.
		const contentStart = line.from + line.text.length - content.length;
		const tagEnd = contentStart + tagMatch.index + tagMatch[1].length + tag.length;
		if (range.head < tagEnd) return false;

		const insert = "\n" + indent + marker + gap + "[ ] " + tag + " ";
		view.dispatch({
			changes: { from: range.head, insert },
			selection: { anchor: range.head + insert.length },
			scrollIntoView: true,
			userEvent: "input"
		});
		return true;
	};
}

export function tagContinuationExtension(
	getTag: () => string,
	isEnabled: () => boolean
): Extension {
	const run = tagContinuationHandler(getTag, isEnabled);
	return Prec.highest(keymap.of([{ key: "Enter", run }]));
}
