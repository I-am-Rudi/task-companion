import { MarkdownRenderChild, Notice, moment, setIcon, setTooltip } from "obsidian";
import type TaskRolloverPlugin from "./main";
import {
	displayText,
	editTaskLine,
	markDone,
	moveTask,
	withoutSchedule,
	withSchedule
} from "./actions";
import { ScheduleModal } from "./schedule";
import { inAnyFolder, noteAt, normalizeFolder } from "./paths";
import {
	allPeriodicFolders,
	configFor,
	dateOf,
	Granularity,
	GRANULARITIES,
	granularityOf
} from "./periodic";
import { hasTag } from "./tagging";
import { TaskItem } from "./taskIndex";

export type Mode = "periodic" | "collection" | "unscheduled";

const MODES: Mode[] = ["periodic", "collection", "unscheduled"];

export interface BlockOptions {
	mode: Mode;
	granularity: Granularity | null;
	title: string | null;
	exclude: string[];
	limit: number | null;
	showSource: boolean | null;
}

/** Minimal key: value parsing — the block bodies are short and hand-written. */
export function parseBlockOptions(source: string): BlockOptions {
	const options: BlockOptions = {
		mode: "periodic",
		granularity: null,
		title: null,
		exclude: [],
		limit: null,
		showSource: null
	};

	for (const rawLine of source.split("\n")) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const separator = line.indexOf(":");
		if (separator === -1) continue;

		const key = line.slice(0, separator).trim().toLowerCase();
		const value = line.slice(separator + 1).trim();

		switch (key) {
			case "mode":
				if ((MODES as string[]).includes(value)) options.mode = value as Mode;
				break;
			case "granularity":
				if ((GRANULARITIES as string[]).includes(value)) {
					options.granularity = value as Granularity;
				}
				break;
			case "title":
				options.title = value;
				break;
			case "exclude":
				options.exclude = value
					.replace(/^\[|\]$/g, "")
					.split(",")
					.map((entry) => entry.trim().replace(/^["']|["']$/g, ""))
					.filter(Boolean);
				break;
			case "limit": {
				const limit = Number.parseInt(value, 10);
				if (Number.isFinite(limit) && limit > 0) options.limit = limit;
				break;
			}
			case "show-source":
			case "showsource":
				options.showSource = value === "true" || value === "yes";
				break;
		}
	}

	return options;
}

export class RolloverBlock extends MarkdownRenderChild {
	private plugin: TaskRolloverPlugin;
	private options: BlockOptions;
	private sourcePath: string;
	private unsubscribe: (() => void) | null = null;

	constructor(
		plugin: TaskRolloverPlugin,
		containerEl: HTMLElement,
		sourcePath: string,
		options: BlockOptions
	) {
		super(containerEl);
		this.plugin = plugin;
		this.options = options;
		this.sourcePath = sourcePath;
	}

	async onload() {
		this.unsubscribe = this.plugin.index.onChange(() => this.render());
		this.render();
		await this.plugin.index.ready();
		this.render();
	}

	onunload() {
		this.unsubscribe?.();
		this.unsubscribe = null;
	}

	// ── Querying ─────────────────────────────────────────────
	private get settings() {
		return this.plugin.settings;
	}

	private isOpen(task: TaskItem): boolean {
		return task.status === " " || task.status === "";
	}

	private isTagged(task: TaskItem): boolean {
		const tag = this.settings.taskTag;
		return this.settings.requireTagAtStart
			? task.raw.trim().startsWith(tag)
			: hasTag(task.raw, tag);
	}

	private collectionPath(): string | null {
		return noteAt(this.plugin.app.vault, this.settings.collectionNote)?.path ?? null;
	}

	private gather(): TaskItem[] {
		const app = this.plugin.app;
		const settings = this.settings;
		const index = this.plugin.index;

		if (this.options.mode === "collection") {
			const path = this.collectionPath();
			if (!path) return [];
			return index.get(path).filter((task) => this.isOpen(task) && this.isTagged(task));
		}

		if (this.options.mode === "unscheduled") {
			const skip = [
				...allPeriodicFolders(app, settings.fallbackPeriodic),
				...settings.excludedFolders.map(normalizeFolder),
				...this.options.exclude.map(normalizeFolder)
			];
			const collection = this.collectionPath();
			const found: TaskItem[] = [];

			for (const path of index.paths()) {
				if (path === this.sourcePath || path === collection) continue;
				if (inAnyFolder(path, skip)) continue;
				for (const task of index.get(path)) {
					if (this.isOpen(task) && this.isTagged(task) && !task.scheduled && !task.due) {
						found.push(task);
					}
				}
			}

			return this.sorted(found);
		}

		// periodic: earlier notes of this granularity only
		const granularity =
			this.options.granularity ??
			granularityOf(app, this.sourcePath, settings.fallbackPeriodic) ??
			"day";
		const config = configFor(app, granularity, settings.fallbackPeriodic);
		const own = dateOf(this.sourcePath, config) ?? moment();

		const found: TaskItem[] = [];
		for (const path of index.paths()) {
			if (path === this.sourcePath) continue;
			// Dates, not paths: a note dated after this one is in the future
			// even though it sits in the same folder.
			const date = dateOf(path, config);
			if (!date || !date.isBefore(own)) continue;
			for (const task of index.get(path)) {
				if (this.isOpen(task) && this.isTagged(task)) found.push(task);
			}
		}

		return this.sorted(found);
	}

	private sorted(tasks: TaskItem[]): TaskItem[] {
		return tasks.sort((a, b) =>
			a.path === b.path ? a.line - b.line : a.path.localeCompare(b.path)
		);
	}

	// ── Rendering ────────────────────────────────────────────
	private render() {
		const el = this.containerEl;
		el.empty();
		el.addClass("trc-block");

		if (this.options.title) {
			el.createDiv({ cls: "trc-title", text: this.options.title });
		}

		if (this.options.mode === "collection" && !this.collectionPath()) {
			el.createEl("p", {
				cls: "trc-empty",
				text: this.settings.collectionNote
					? `Collection note not found: ${this.settings.collectionNote}`
					: "No collection note is set."
			});
			return;
		}

		let tasks = this.gather();
		if (this.options.limit !== null) tasks = tasks.slice(0, this.options.limit);

		if (tasks.length === 0) {
			el.createEl("p", { cls: "trc-empty", text: "Nothing to roll over." });
			return;
		}

		const list = el.createEl("ul", { cls: "trc-list" });
		for (const task of tasks) this.renderTask(list, task, true);
	}

	private renderTask(list: HTMLElement, task: TaskItem, isRoot: boolean) {
		const item = list.createEl("li", { cls: "trc-item" });
		const row = item.createDiv({ cls: "trc-row" });
		const done = !this.isOpen(task);

		const checkbox = row.createEl("input", {
			cls: "task-list-item-checkbox trc-check",
			type: "checkbox"
		});
		checkbox.checked = done;
		setTooltip(checkbox, "Mark done in the source note");

		const label = row.createSpan({ cls: "trc-text", text: displayText(task, this.settings.taskTag) });
		label.toggleClass("is-done", done);

		checkbox.addEventListener("click", async (event) => {
			event.stopPropagation();
			checkbox.disabled = true;
			const ok = await editTaskLine(this.plugin.app, task, markDone);
			if (!ok) {
				checkbox.checked = false;
				checkbox.disabled = false;
				new Notice("Could not find that task in its note.");
				return;
			}
			label.addClass("is-done");
		});

		if (isRoot) {
			const showSource = this.options.showSource ?? this.options.mode !== "collection";
			if (showSource) {
				const name = task.path.split("/").pop()?.replace(/\.md$/, "") ?? task.path;
				row.createSpan({ cls: "trc-source", text: name });
			}

			const actions = row.createDiv({ cls: "trc-actions" });
			this.addAction(actions, "external-link", "Open source note", () => {
				this.plugin.app.workspace.openLinkText(task.path, "", false);
			});

			if (this.options.mode === "unscheduled") this.addScheduleControl(actions, item, task);
			else this.addMoveControls(actions, item, task);
		}

		if (task.children.length) {
			const sublist = item.createEl("ul", { cls: "trc-list trc-sublist" });
			for (const child of task.children) this.renderTask(sublist, child, false);
		}
	}

	private addAction(
		parent: HTMLElement,
		icon: string,
		tooltip: string,
		onClick: () => void | Promise<void>
	): HTMLButtonElement {
		const button = parent.createEl("button", { cls: "clickable-icon trc-action" });
		button.type = "button";
		setIcon(button, icon);
		setTooltip(button, tooltip);
		button.setAttr("aria-label", tooltip);
		button.addEventListener("click", async (event) => {
			event.stopPropagation();
			await onClick();
		});
		return button;
	}

	/** Grey the row out once its task has been dealt with. */
	private retire(item: HTMLElement) {
		item.addClass("is-retired");
		item.querySelectorAll("input, button").forEach((el) => {
			(el as HTMLInputElement | HTMLButtonElement).disabled = true;
		});
	}

	private addMoveControls(actions: HTMLElement, item: HTMLElement, task: TaskItem) {
		const app = this.plugin.app;

		this.addAction(actions, "arrow-right", "Move here, with subtasks", async () => {
			const ok = await moveTask(app, task, this.sourcePath, this.settings.tasksHeading);
			if (!ok) {
				new Notice("Could not move that task.");
				return;
			}
			this.retire(item);
		});

		if (this.options.mode === "collection") return;

		this.addAction(actions, "pause", "Put on hold, in the collection note", async () => {
			const target = this.collectionPath();
			if (!target) {
				new Notice(`Collection note not found: ${this.settings.collectionNote}`);
				return;
			}
			const ok = await moveTask(app, task, target, this.settings.tasksHeading);
			if (!ok) {
				new Notice("Could not move that task.");
				return;
			}
			this.retire(item);
		});
	}

	/**
	 * The one control `unscheduled` mode has ever had, now opening the same
	 * prompt as the command and the in-note icon rather than a bare date input.
	 * The other modes deliberately don't get one: their rows already carry the
	 * actions that matter there, and a task can be scheduled from the note it
	 * lives in.
	 */
	private addScheduleControl(actions: HTMLElement, item: HTMLElement, task: TaskItem) {
		const existing = task.scheduled;

		this.addAction(actions, "calendar", existing ? `Scheduled ${existing}` : "Schedule", () => {
			new ScheduleModal(this.plugin.app, {
				subject: displayText(task, this.settings.taskTag),
				initial: existing,
				allowClear: existing !== null,
				onPick: async (date) => {
					const ok = await editTaskLine(this.plugin.app, task, (line) =>
						date === null
							? withoutSchedule(line)
							: withSchedule(line, date, this.settings.scheduleStyle)
					);
					if (!ok) {
						new Notice("Could not find that task in its note.");
						return;
					}
					if (date === null) {
						new Notice("Date cleared.");
						return;
					}
					new Notice(`Scheduled for ${date}.`);
					// In unscheduled mode the task has just left the query, so
					// grey it out rather than leave it looking actionable until
					// the index catches up.
					if (this.options.mode === "unscheduled") this.retire(item);
				}
			}).open();
		});
	}
}
