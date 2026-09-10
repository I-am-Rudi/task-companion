import { App, Editor, EditorChange, MarkdownView, TFile } from "obsidian";
import { noteAt } from "./paths";
import { TaskItem } from "./taskIndex";

/**
 * A line-level edit. Expressing changes this way lets the same plan run through
 * the Editor API — which preserves the cursor, selection and fold state of the
 * note the user is looking at — or through `Vault.process` for a background
 * file, which is atomic and safe alongside other plugins.
 */
type Edit =
	| { kind: "setLine"; line: number; text: string }
	/** Removes [from, to). */
	| { kind: "removeLines"; from: number; to: number }
	| { kind: "insertLines"; at: number; lines: string[] };

/** Given the current lines, what should change. An empty plan writes nothing. */
type Plan = (lines: string[]) => Edit[];

function editStart(edit: Edit): number {
	return edit.kind === "setLine" ? edit.line : edit.kind === "removeLines" ? edit.from : edit.at;
}

function applyToLines(lines: string[], edits: Edit[]): string[] {
	const out = lines.slice();
	// Descending, so an earlier edit never shifts a later one's indices.
	for (const edit of [...edits].sort((a, b) => editStart(b) - editStart(a))) {
		if (edit.kind === "setLine") out[edit.line] = edit.text;
		else if (edit.kind === "removeLines") out.splice(edit.from, edit.to - edit.from);
		else out.splice(edit.at, 0, ...edit.lines);
	}
	return out;
}

function toEditorChanges(editor: Editor, edits: Edit[]): EditorChange[] {
	const lastLine = editor.lastLine();
	const endOf = (line: number) => ({ line, ch: editor.getLine(line).length });
	const changes: EditorChange[] = [];

	for (const edit of [...edits].sort((a, b) => editStart(a) - editStart(b))) {
		if (edit.kind === "setLine") {
			changes.push({ from: { line: edit.line, ch: 0 }, to: endOf(edit.line), text: edit.text });
		} else if (edit.kind === "removeLines") {
			if (edit.to <= lastLine) {
				changes.push({
					from: { line: edit.from, ch: 0 },
					to: { line: edit.to, ch: 0 },
					text: ""
				});
			} else {
				// Removing through the end of the file: swallow the newline
				// that precedes the block rather than the one after it.
				changes.push({
					from: edit.from > 0 ? endOf(edit.from - 1) : { line: 0, ch: 0 },
					to: endOf(lastLine),
					text: ""
				});
			}
		} else if (edit.at <= lastLine) {
			changes.push({
				from: { line: edit.at, ch: 0 },
				to: { line: edit.at, ch: 0 },
				text: edit.lines.join("\n") + "\n"
			});
		} else {
			changes.push({ from: endOf(lastLine), text: "\n" + edit.lines.join("\n") });
		}
	}

	return changes;
}

/** The editor showing this file, if the user is looking at it right now. */
function activeEditorFor(app: App, file: TFile): Editor | null {
	const view = app.workspace.getActiveViewOfType(MarkdownView);
	return view && view.file?.path === file.path ? view.editor : null;
}

async function applyEdits(app: App, file: TFile, plan: Plan): Promise<boolean> {
	const editor = activeEditorFor(app, file);

	if (editor) {
		const edits = plan(editor.getValue().split("\n"));
		if (edits.length === 0) return false;
		editor.transaction({ changes: toEditorChanges(editor, edits) });
		return true;
	}

	let applied = false;
	await app.vault.process(file, (content) => {
		const lines = content.split("\n");
		const edits = plan(lines);
		if (edits.length === 0) return content;
		applied = true;
		return applyToLines(lines, edits).join("\n");
	});
	return applied;
}

function indentWidth(line: string): number {
	return (line.match(/^[ \t]*/) ?? [""])[0].replace(/\t/g, "    ").length;
}

export function stripAnnotations(text: string): string {
	return text
		.replace(/\[\w+::[^\]]*\]/g, "")
		.replace(/\(\w+::[^)]*\)/g, "")
		// `u`, because 📅 🛫 🔁 are two code units each: without it the class
		// matches their halves separately and can strip one, leaving the other.
		.replace(/[⏳📅➕✅❌🛫🔁]\s*\d{4}-\d{2}-\d{2}/gu, "")
		.replace(/[ \t]{2,}/g, " ")
		.trimEnd();
}

/** A task line reduced to the words in it: no checkbox, no tag, no annotations. */
export function lineSubject(line: string, tag: string): string {
	const content = line.replace(/^[ \t]*[-*+]\s*\[.\][ \t]?/, "");
	const withoutTag = content.replace(new RegExp("(^|\\s)" + tag + "(?=\\s|$)", "g"), " ");
	return stripAnnotations(withoutTag).trim();
}

export function displayText(task: TaskItem, tag: string): string {
	return lineSubject(task.raw, tag);
}

/**
 * What it takes to find a line again: where it was, and what it said. `TaskItem`
 * satisfies this, and so does a line picked straight out of a rendered note.
 */
export interface LineRef {
	path: string;
	line: number;
	/** The line's content after the checkbox. */
	raw: string;
}

/**
 * Line lookup by content rather than by stored index: an earlier edit in the
 * same file may have shifted everything below it. The tradeoff is that two
 * byte-identical task lines in one file can resolve to the wrong one.
 */
function findLine(lines: string[], task: LineRef): number {
	const needle = task.raw.trim();
	if (!needle) return -1;
	if (lines[task.line]?.includes(needle)) return task.line;
	return lines.findIndex((line) => /^[ \t]*[-*+]\s*\[.\]/.test(line) && line.includes(needle));
}

/**
 * A task's block is its own line plus every following line indented deeper than
 * it — its subtasks and any notes beneath them. A blank line ends the block.
 */
function blockEnd(lines: string[], start: number): number {
	const base = indentWidth(lines[start]);
	let end = start + 1;
	while (end < lines.length) {
		if (lines[end].trim() === "") break;
		if (indentWidth(lines[end]) <= base) break;
		end++;
	}
	return end;
}

/** The task and its subtasks, dedented to column zero, relative indent intact. */
function extractBlock(lines: string[], start: number): string[] {
	const end = blockEnd(lines, start);
	const base = (lines[start].match(/^[ \t]*/) ?? [""])[0].length;
	const block = lines
		.slice(start, end)
		.map((line) => line.slice(Math.min(base, (line.match(/^[ \t]*/) ?? [""])[0].length)));
	block[0] = stripAnnotations(block[0]);
	return block;
}

/** Read a task's block without touching the file. */
export async function readBlock(app: App, task: LineRef): Promise<string[] | null> {
	const file = app.vault.getFileByPath(task.path);
	if (!file) return null;

	const editor = activeEditorFor(app, file);
	const lines = (editor ? editor.getValue() : await app.vault.cachedRead(file)).split("\n");
	const start = findLine(lines, task);
	return start === -1 ? null : extractBlock(lines, start);
}

/** Remove a task's block from its source note. */
export async function removeBlock(app: App, task: LineRef): Promise<boolean> {
	const file = app.vault.getFileByPath(task.path);
	if (!file) return false;

	return applyEdits(app, file, (lines) => {
		const start = findLine(lines, task);
		if (start === -1) return [];
		return [{ kind: "removeLines", from: start, to: blockEnd(lines, start) }];
	});
}

function headingKey(text: string): string {
	return text.replace(/^[ \t]*#{1,6}[ \t]*/, "").trim().toLowerCase();
}

export async function insertUnderHeading(
	app: App,
	path: string,
	heading: string,
	newLines: string[]
): Promise<boolean> {
	const file = noteAt(app.vault, path);
	if (!file) return false;

	const wanted = headingKey(heading);

	return applyEdits(app, file, (lines) => {
		const index = lines.findIndex(
			(line) => /^[ \t]*#{1,6}[ \t]/.test(line) && headingKey(line) === wanted
		);

		if (index !== -1) return [{ kind: "insertLines", at: index + 1, lines: newLines }];

		// No such heading: append it, with a blank line before it unless the
		// note already ends in one.
		const trailingBlank = lines.length > 0 && lines[lines.length - 1].trim() === "";
		return [
			{
				kind: "insertLines",
				at: lines.length,
				lines: trailingBlank ? [heading, ...newLines] : ["", heading, ...newLines]
			}
		];
	});
}

/**
 * Move a task and its subtasks into another note. The insert happens before the
 * cut, so a failure at either end leaves a duplicate rather than losing work.
 */
export async function moveTask(
	app: App,
	task: TaskItem,
	targetPath: string,
	heading: string
): Promise<boolean> {
	const block = await readBlock(app, task);
	if (!block) return false;

	if (!(await insertUnderHeading(app, targetPath, heading, block))) return false;

	await removeBlock(app, task);
	return true;
}

export async function editTaskLine(
	app: App,
	task: LineRef,
	transform: (line: string) => string
): Promise<boolean> {
	const file = app.vault.getFileByPath(task.path);
	if (!file) return false;

	return applyEdits(app, file, (lines) => {
		const index = findLine(lines, task);
		if (index === -1) return [];
		const text = transform(lines[index]);
		return text === lines[index] ? [] : [{ kind: "setLine", line: index, text }];
	});
}

export function markDone(line: string): string {
	return line.replace(/\[.\]/, "[x]");
}

/** A checklist item, at any indent. Scheduling only ever touches these. */
const TASK_LINE = /^[ \t]*[-*+]\s*\[.\]/;

export function isTaskLine(line: string): boolean {
	return TASK_LINE.test(line);
}

/**
 * The dates a task can carry. These are the three planning dates the Tasks
 * plugin defines, under its own keys and emoji, so a line stamped here reads
 * correctly there and vice versa. Its record-keeping dates — created, done,
 * cancelled — are deliberately absent: they mark something that happened, and
 * this prompt only ever resolves forwards.
 */
export type DateField = "scheduled" | "due" | "start";

export const DATE_FIELDS: DateField[] = ["scheduled", "due", "start"];

export const FIELD_LABEL: Record<DateField, string> = {
	scheduled: "Scheduled",
	due: "Due",
	start: "Start"
};

export const FIELD_EMOJI: Record<DateField, string> = {
	scheduled: "⏳",
	due: "📅",
	start: "🛫"
};

/**
 * Drop the date a line carries for one field, in either notation. The
 * whitespace in front of the annotation goes with it, so nothing else on the
 * line — indentation, a neighbouring field's own spacing — is disturbed.
 */
export function withoutDate(line: string, field: DateField): string {
	return line
		.replace(new RegExp("[ \\t]*\\[\\s*" + field + "\\s*::[^\\]]*\\]", "gi"), "")
		.replace(new RegExp("[ \\t]*" + FIELD_EMOJI[field] + "\\s*\\d{4}-\\d{2}-\\d{2}", "g"), "")
		.trimEnd();
}

export function withDate(
	line: string,
	field: DateField,
	date: string,
	style: "dataview" | "emoji"
): string {
	const clean = withoutDate(line, field);
	return style === "emoji"
		? clean + " " + FIELD_EMOJI[field] + " " + date
		: clean + "  [" + field + ":: " + date + "]";
}

/** The date a line already carries for one field, in either notation. */
export function dateOn(line: string, field: DateField): string | null {
	const found =
		line.match(new RegExp("\\[\\s*" + field + "\\s*::\\s*(\\d{4}-\\d{2}-\\d{2})", "i")) ??
		line.match(new RegExp(FIELD_EMOJI[field] + "\\s*(\\d{4}-\\d{2}-\\d{2})"));
	return found ? found[1] : null;
}

/**
 * A field named at the head of what someone typed — `due fri`, `start monday`.
 * Keeps the prompt's keyboard path whole: switching field needn't mean leaving
 * the text box for the buttons.
 */
const FIELD_WORDS: Record<string, DateField> = {
	scheduled: "scheduled",
	schedule: "scheduled",
	sched: "scheduled",
	due: "due",
	start: "start",
	starts: "start"
};

export function parseFieldPrefix(input: string): { field: DateField | null; rest: string } {
	const match = input.match(/^[ \t]*([a-z]+)([ \t]+.*)?$/i);
	if (!match) return { field: null, rest: input };

	const field = FIELD_WORDS[match[1].toLowerCase()];
	if (!field) return { field: null, rest: input };

	return { field, rest: (match[2] ?? "").trim() };
}

/**
 * Stamp — or, with a null date, clear — one field on every checklist line
 * given. Non-task lines come back untouched, so a rough selection that caught a
 * heading or a blank line still does the right thing.
 */
export function scheduleLines(
	lines: string[],
	field: DateField,
	date: string | null,
	style: "dataview" | "emoji"
): string[] {
	return lines.map((line) => {
		if (!isTaskLine(line)) return line;
		return date === null ? withoutDate(line, field) : withDate(line, field, date, style);
	});
}

/**
 * Apply the schedule to every line the cursors or selections touch, as one
 * transaction so it is a single undo step. Returns the number of lines changed.
 */
export function scheduleInEditor(
	editor: Editor,
	field: DateField,
	date: string | null,
	style: "dataview" | "emoji"
): number {
	const lineNumbers = new Set<number>();
	for (const selection of editor.listSelections()) {
		const from = Math.min(selection.anchor.line, selection.head.line);
		const to = Math.max(selection.anchor.line, selection.head.line);
		for (let line = from; line <= to; line++) lineNumbers.add(line);
	}

	const sorted = Array.from(lineNumbers).sort((a, b) => a - b);
	const original = sorted.map((line) => editor.getLine(line));
	const scheduled = scheduleLines(original, field, date, style);

	const changes: EditorChange[] = [];
	for (let i = 0; i < sorted.length; i++) {
		if (scheduled[i] === original[i]) continue;
		changes.push({
			from: { line: sorted[i], ch: 0 },
			to: { line: sorted[i], ch: original[i].length },
			text: scheduled[i]
		});
	}

	if (changes.length) editor.transaction({ changes });
	return changes.length;
}

/** Does anything in the selection look like a task the command could stamp? */
export function selectionHasTask(editor: Editor): boolean {
	for (const selection of editor.listSelections()) {
		const from = Math.min(selection.anchor.line, selection.head.line);
		const to = Math.max(selection.anchor.line, selection.head.line);
		for (let line = from; line <= to; line++) {
			if (isTaskLine(editor.getLine(line))) return true;
		}
	}
	return false;
}

/** The date already on the first task line of the selection, if there is one. */
export function selectionDate(editor: Editor, field: DateField): string | null {
	for (const selection of editor.listSelections()) {
		const from = Math.min(selection.anchor.line, selection.head.line);
		const to = Math.max(selection.anchor.line, selection.head.line);
		for (let line = from; line <= to; line++) {
			const text = editor.getLine(line);
			if (!isTaskLine(text)) continue;
			const found = dateOn(text, field);
			if (found) return found;
		}
	}
	return null;
}
