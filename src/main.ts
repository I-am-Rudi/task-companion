import { Editor, MarkdownPostProcessorContext, Notice, Plugin, TAbstractFile, TFile } from "obsidian";
import { dateOn, scheduleInEditor, selectionDate, selectionHasTask } from "./actions";
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
