import { App, Component, TFile } from "obsidian";

export interface TaskItem {
	path: string;
	line: number;
	indent: number;
	status: string;
	/** The line's content after the checkbox, verbatim. */
	raw: string;
	scheduled: string | null;
	due: string | null;
	children: TaskItem[];
}

const TASK_RE = /^(\s*)[-*+]\s*\[(.)\]\s?(.*)$/;

const FIELD_RE = (key: string) => new RegExp("\\[\\s*" + key + "\\s*::\\s*([^\\]]+)\\]", "i");

function extractDate(text: string, key: string, emoji: string): string | null {
	const field = text.match(FIELD_RE(key));
	if (field) {
		const iso = field[1].match(/\d{4}-\d{2}-\d{2}/);
		if (iso) return iso[0];
	}
	const emojiDate = text.match(new RegExp(emoji + "\\s*(\\d{4}-\\d{2}-\\d{2})"));
	return emojiDate ? emojiDate[1] : null;
}

/** Parse one file's checklist lines into a tree keyed on indentation. */
export function parseTasks(path: string, content: string): TaskItem[] {
	const lines = content.split("\n");
	const roots: TaskItem[] = [];
	const stack: TaskItem[] = [];

	for (let i = 0; i < lines.length; i++) {
		const match = lines[i].match(TASK_RE);
		if (!match) continue;

		const item: TaskItem = {
			path,
			line: i,
			indent: match[1].replace(/\t/g, "    ").length,
			status: match[2],
			raw: match[3],
			scheduled: extractDate(match[3], "scheduled", "⏳"),
			due: extractDate(match[3], "due", "📅"),
			children: []
		};

		while (stack.length && stack[stack.length - 1].indent >= item.indent) {
			stack.pop();
		}

		const parent = stack[stack.length - 1];
		if (parent) parent.children.push(item);
		else roots.push(item);

		stack.push(item);
	}

	return roots;
}

type Listener = () => void;

/** Renders are coalesced: one edit can fire several cache events. */
const NOTIFY_DELAY_MS = 50;

/**
 * Holds parsed tasks for the whole vault. Built once, then patched per file
 * from the metadata cache's change events — which hand us the new content, so
 * no re-read is needed. This is what keeps repeated renders cheap.
 *
 * A Component rather than a plain class so the debounce timer is torn down with
 * the plugin instead of outliving it.
 */
export class TaskIndex extends Component {
	private app: App;
	private byPath = new Map<string, TaskItem[]>();
	private listeners = new Set<Listener>();
	private buildPromise: Promise<void> | null = null;
	private notifyTimer: number | null = null;

	constructor(app: App) {
		super();
		this.app = app;
		this.register(() => this.clearTimer());
	}

	onChange(fn: Listener): () => void {
		this.listeners.add(fn);
		return () => this.listeners.delete(fn);
	}

	private clearTimer() {
		if (this.notifyTimer !== null) {
			window.clearTimeout(this.notifyTimer);
			this.notifyTimer = null;
		}
	}

	private notify() {
		this.clearTimer();
		this.notifyTimer = window.setTimeout(() => {
			this.notifyTimer = null;
			this.listeners.forEach((fn) => fn());
		}, NOTIFY_DELAY_MS);
	}

	ready(): Promise<void> {
		if (!this.buildPromise) this.buildPromise = this.build();
		return this.buildPromise;
	}

	private hasTasks(file: TFile): boolean {
		const cache = this.app.metadataCache.getFileCache(file);
		return !!cache?.listItems?.some((item) => item.task !== undefined);
	}

	private async build(): Promise<void> {
		for (const file of this.app.vault.getMarkdownFiles()) {
			// The metadata cache already knows which files contain checklist
			// items, so only those are read from disk.
			if (!this.hasTasks(file)) continue;
			try {
				const content = await this.app.vault.cachedRead(file);
				this.byPath.set(file.path, parseTasks(file.path, content));
			} catch (error) {
				// One unreadable file should not abandon the rest of the index.
				console.error(`Task Rollover Companion: could not index ${file.path}`, error);
			}
		}
		this.notify();
	}

	updateFile(file: TFile, content: string) {
		const parsed = parseTasks(file.path, content);
		if (parsed.length === 0) this.byPath.delete(file.path);
		else this.byPath.set(file.path, parsed);
		this.notify();
	}

	removeFile(path: string) {
		if (this.byPath.delete(path)) this.notify();
	}

	async refreshFile(path: string) {
		const file = this.app.vault.getFileByPath(path);
		if (!file) return;
		try {
			this.updateFile(file, await this.app.vault.cachedRead(file));
		} catch (error) {
			console.error(`Task Rollover Companion: could not read ${path}`, error);
		}
	}

	paths(): string[] {
		return Array.from(this.byPath.keys());
	}

	get(path: string): TaskItem[] {
		return this.byPath.get(path) ?? [];
	}
}
