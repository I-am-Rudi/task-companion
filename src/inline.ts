import { Extension, RangeSetBuilder } from "@codemirror/state";
import {
	Decoration,
	DecorationSet,
	EditorView,
	PluginValue,
	ViewPlugin,
	ViewUpdate,
	WidgetType
} from "@codemirror/view";
import { App, MarkdownPostProcessorContext, Notice, setIcon, setTooltip } from "obsidian";
import {
	editTaskLine,
	lineSubject,
	scheduleOf,
	withoutSchedule,
	withSchedule
} from "./actions";
import type TaskRolloverPlugin from "./main";
import { ScheduleModal } from "./schedule";
import { isTaggedTask } from "./tagging";

/** A task line, split just far enough to read the content after the checkbox. */
const TASK_LINE_RE = /^[ \t]*[-*+][ \t]+\[.\][ \t]?(.*)$/;

/**
 * The icon shown beside a tagged task in a note. It is the same prompt the
 * command opens, reached with the mouse instead — nothing here needs to be
 * keyboard-navigable, because the keyboard already has the command.
 */
function scheduleButton(onClick: () => void): HTMLButtonElement {
	const button = createEl("button", { cls: "trc-inline-schedule" });
	button.type = "button";
	setIcon(button, "calendar");
	setTooltip(button, "Schedule");
	button.setAttr("aria-label", "Schedule");
	// Without this the press moves the cursor into the line before the click
	// lands, which in live preview also re-renders the widget out from under it.
	button.addEventListener("mousedown", (event) => event.preventDefault());
	button.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		onClick();
	});
	return button;
}

function openPrompt(
	app: App,
	tag: string,
	line: string,
	onPick: (date: string | null) => void | Promise<void>
) {
	const existing = scheduleOf(line);
	new ScheduleModal(app, {
		subject: lineSubject(line, tag),
		initial: existing,
		allowClear: existing !== null,
		onPick
	}).open();
}

// ── Live preview and source mode ─────────────────────────────

class ScheduleWidget extends WidgetType {
	private plugin: TaskRolloverPlugin;

	constructor(plugin: TaskRolloverPlugin) {
		super();
		this.plugin = plugin;
	}

	/** Every one of these is identical, so CodeMirror can reuse the DOM freely. */
	eq(): boolean {
		return true;
	}

	toDOM(view: EditorView): HTMLElement {
		const button = scheduleButton(() => this.open(view, button));
		return button;
	}

	/**
	 * The widget's own position is asked for at click time rather than captured
	 * when it was built, so an edit further up the note can't send the date to
	 * the wrong line.
	 */
	private open(view: EditorView, dom: HTMLElement) {
		const settings = this.plugin.settings;
		const at = view.state.doc.lineAt(view.posAtDOM(dom));

		openPrompt(this.plugin.app, settings.taskTag, at.text, (date) => {
			const line = view.state.doc.lineAt(view.posAtDOM(dom));
			const text =
				date === null
					? withoutSchedule(line.text)
					: withSchedule(line.text, date, settings.scheduleStyle);
			if (text === line.text) return;
			view.dispatch({ changes: { from: line.from, to: line.to, insert: text } });
		});
	}
}

function buildDecorations(view: EditorView, plugin: TaskRolloverPlugin): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	if (!plugin.settings.showScheduleIcon) return builder.finish();

	const tag = plugin.settings.taskTag;
	const decoration = Decoration.widget({ widget: new ScheduleWidget(plugin), side: 1 });

	// Only what's on screen: a long note is otherwise a lot of widgets nobody
	// is looking at.
	for (const { from, to } of view.visibleRanges) {
		for (let pos = from; pos <= to; ) {
			const line = view.state.doc.lineAt(pos);
			if (isTaggedTask(line.text, tag)) builder.add(line.to, line.to, decoration);
			pos = line.to + 1;
		}
	}

	return builder.finish();
}

export function inlineScheduleExtension(plugin: TaskRolloverPlugin): Extension {
	return ViewPlugin.fromClass(
		class implements PluginValue {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = buildDecorations(view, plugin);
			}

			update(update: ViewUpdate) {
				if (update.docChanged || update.viewportChanged) {
					this.decorations = buildDecorations(update.view, plugin);
				}
			}
		},
		{ decorations: (value) => value.decorations }
	);
}

// ── Reading view ─────────────────────────────────────────────

/**
 * The task lines of a stretch of source, by index. Fences are tracked because a
 * code block inside a list item can hold something that looks like a task.
 */
export function taskLineIndices(lines: string[]): number[] {
	const found: number[] = [];
	let fenced = false;

	for (let i = 0; i < lines.length; i++) {
		if (/^[ \t]*(```|~~~)/.test(lines[i])) {
			fenced = !fenced;
			continue;
		}
		if (!fenced && TASK_LINE_RE.test(lines[i])) found.push(i);
	}

	return found;
}

/**
 * The same icon in reading view. Rendered task items carry no line number, so
 * they are paired with the section's source task lines in order — and the whole
 * section is skipped when the two don't line up, rather than risk stamping a
 * date onto the wrong task.
 */
export function inlineSchedulePostProcessor(plugin: TaskRolloverPlugin) {
	return (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
		if (!plugin.settings.showScheduleIcon) return;

		const items = Array.from(el.querySelectorAll<HTMLElement>("li.task-list-item"));
		if (items.length === 0) return;

		const info = ctx.getSectionInfo(el);
		if (!info) return;

		const lines = info.text.split("\n").slice(info.lineStart, info.lineEnd + 1);
		const indices = taskLineIndices(lines);
		if (indices.length !== items.length) return;

		const tag = plugin.settings.taskTag;

		items.forEach((item, i) => {
			const source = lines[indices[i]];
			if (!isTaggedTask(source, tag)) return;

			const raw = source.match(TASK_LINE_RE)?.[1] ?? "";
			const ref = { path: ctx.sourcePath, line: info.lineStart + indices[i], raw };

			item.appendChild(
				scheduleButton(() => {
					openPrompt(plugin.app, tag, source, async (date) => {
						const ok = await editTaskLine(plugin.app, ref, (line) =>
							date === null
								? withoutSchedule(line)
								: withSchedule(line, date, plugin.settings.scheduleStyle)
						);
						if (!ok) new Notice("Could not find that task in its note.");
					});
				})
			);
		});
	};
}
