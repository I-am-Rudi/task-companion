import {
	Editor,
	MarkdownFileInfo,
	MarkdownPostProcessorContext,
	MarkdownView,
	Notice,
	Plugin,
	TAbstractFile,
	TFile
} from "obsidian";
import {
	moveTasksInRanges,
	scheduleInEditor,
	selectedLineRanges,
	selectionDate,
	selectionHasTask
} from "./actions";
import { noteAt } from "./paths";
import { inlineScheduleExtension, inlineSchedulePostProcessor } from "./inline";
import { ScheduleModal } from "./schedule";
import { DEFAULT_SETTINGS, RolloverSettings, RolloverSettingTab } from "./settings";
import { parseBlockOptions, RolloverBlock } from "./render";
import { tagContinuationExtension, toggleTagInEditor } from "./tagging";
import { TaskIndex } from "./taskIndex";

export default class TaskRolloverPlugin extends Plugin {
	settings: RolloverSettings;
	index: TaskIndex;

	async onload() {
		await this.loadSettings();

		this.index = new TaskIndex(this.app);
		// As a child component, the index's timers are torn down with the plugin.
		this.addChild(this.index);

		// The metadata cache hands us the new content, so a change costs one
		// parse of one file rather than a vault scan.
		this.registerEvent(
			this.app.metadataCache.on("changed", (file: TFile, data: string) => {
				this.index.updateFile(file, data);
			})
		);

		this.registerEvent(
			this.app.vault.on("delete", (file: TAbstractFile) => {
				this.index.removeFile(file.path);
			})
		);

		this.registerEvent(
			this.app.vault.on("rename", (file: TAbstractFile, oldPath: string) => {
				this.index.removeFile(oldPath);
				if (file instanceof TFile && file.extension === "md") {
					void this.index.refreshFile(file.path);
				}
			})
		);

		this.registerMarkdownCodeBlockProcessor(
			"rollover",
			(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
				ctx.addChild(new RolloverBlock(this, el, ctx.sourcePath, parseBlockOptions(source)));
			}
		);

		this.addCommand({
			id: "toggle-task-tag",
			name: "Toggle task tag on the current line or selection",
			editorCallback: (editor: Editor) => {
				const changed = toggleTagInEditor(
					editor,
					this.settings.taskTag,
					this.settings.promoteOnToggle
				);
				if (changed === 0) new Notice("Nothing to tag here.");
			}
		});

		this.addCommand({
			id: "schedule-task",
			name: "Schedule the task on the current line or selection",
			editorCallback: (editor: Editor) => {
				if (!selectionHasTask(editor)) {
					new Notice("No task on this line.");
					return;
				}
				new ScheduleModal(this.app, {
					current: (field) => selectionDate(editor, field),
					onPick: (date, field) => {
						const style = this.settings.scheduleStyle;
						const changed = scheduleInEditor(editor, field, date, style);
						if (changed === 0) new Notice("No task on this line.");
					}
				}).open();
			}
		});

		// Any task, tagged or not, at any time — the in-note counterpart of the
		// periodic block's "put on hold" button, and like it, the parent line
		// leaves its dates behind.
		this.addCommand({
			id: "move-task-to-collection",
			name: "Move the task on the current line or selection to the collection note",
			editorCallback: async (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
				const source = ctx.file;
				if (!source) return;
				const target = noteAt(this.app.vault, this.settings.collectionNote);
				if (!target) {
					new Notice(
						this.settings.collectionNote
							? `Collection note not found: ${this.settings.collectionNote}`
							: "No collection note is set."
					);
					return;
				}
				if (target.path === source.path) {
					new Notice("This is the collection note already.");
					return;
				}

				const result = await moveTasksInRanges(
					this.app,
					source.path,
					selectedLineRanges(editor),
					target.path,
					this.settings.tasksHeading
				);
				if (!result) new Notice("No task on this line.");
				else if (result.moved === 0) new Notice("Could not move that task.");
				else if (!result.cut) {
					new Notice("The note changed during the move, so the task was copied, not moved.");
				} else {
					new Notice(
						result.moved === 1
							? `Moved to ${target.basename}.`
							: `Moved ${result.moved} tasks to ${target.basename}.`
					);
				}
			}
		});

		// The schedule icon beside a tagged task: a CodeMirror widget in live
		// preview and source mode, a post processor in reading view.
		this.registerEditorExtension(inlineScheduleExtension(this));
		this.registerMarkdownPostProcessor(inlineSchedulePostProcessor(this));

		this.registerEditorExtension(
			tagContinuationExtension(
				() => this.settings.taskTag,
				() => this.settings.continueTagOnEnter
			)
		);

		this.addSettingTab(new RolloverSettingTab(this.app, this));

		// Warm the index in the background so the first block renders instantly.
		this.app.workspace.onLayoutReady(() => {
			void this.index.ready();
		});
	}

	async loadSettings() {
		const stored = (await this.loadData()) as Partial<RolloverSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, stored);
		this.settings.fallbackPeriodic = Object.assign(
			{},
			DEFAULT_SETTINGS.fallbackPeriodic,
			stored?.fallbackPeriodic
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
