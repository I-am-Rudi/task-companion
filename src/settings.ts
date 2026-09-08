import { App, PluginSettingTab, Setting } from "obsidian";
import type TaskRolloverPlugin from "./main";
import {
	DEFAULT_FORMAT,
	GRANULARITIES,
	GRANULARITY_LABEL,
	PeriodicFallbacks,
	periodicNotesAvailable
} from "./periodic";

export interface RolloverSettings {
	taskTag: string;
	requireTagAtStart: boolean;
	tasksHeading: string;
	collectionNote: string;
	excludedFolders: string[];
	scheduleStyle: "dataview" | "emoji";
	/** How the action buttons on a block's rows are drawn. */
	actionStyle: "minimal" | "emoji";
	/** Whether tagging a plain bullet or plain line turns it into a task. */
	promoteOnToggle: boolean;
	/** Whether Enter on a tagged task carries the tag onto the next line. */
	continueTagOnEnter: boolean;
	/** Whether hovering a tagged task in a note reveals a schedule button. */
	showScheduleIcon: boolean;
	/** Used only where Periodic Notes is absent or has no config for a granularity. */
	fallbackPeriodic: PeriodicFallbacks;
}

export const DEFAULT_SETTINGS: RolloverSettings = {
	taskTag: "#task",
	requireTagAtStart: true,
	tasksHeading: "## Tasks",
	collectionNote: "Unscheduled & Long-Term Tasks",
	excludedFolders: ["Meta/Templates"],
	scheduleStyle: "dataview",
	actionStyle: "minimal",
	promoteOnToggle: true,
	continueTagOnEnter: true,
	showScheduleIcon: true,
	fallbackPeriodic: {
		day: { folder: "Journal/Daily", format: DEFAULT_FORMAT.day },
		week: { folder: "Journal/Weekly", format: DEFAULT_FORMAT.week },
		month: { folder: "Journal/Monthly", format: DEFAULT_FORMAT.month },
		quarter: { folder: "Journal/Quarterly", format: DEFAULT_FORMAT.quarter },
		year: { folder: "Journal/Yearly", format: DEFAULT_FORMAT.year }
	}
};

export class RolloverSettingTab extends PluginSettingTab {
	private plugin: TaskRolloverPlugin;

	constructor(app: App, plugin: TaskRolloverPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		const settings = this.plugin.settings;
		const save = () => this.plugin.saveSettings();

		new Setting(containerEl)
			.setName("Task tag")
			.setDesc(
				"Only checklist items carrying this tag are rolled over. The same tag is used by the tagging command and by tag continuation."
			)
			.addText((text) =>
				text.setValue(settings.taskTag).onChange(async (value) => {
					settings.taskTag = value.trim() || DEFAULT_SETTINGS.taskTag;
					await save();
				})
			);

		new Setting(containerEl)
			.setName("Tag must start the line")
			.setDesc(
				"On: only '- [ ] #task …' matches. Off: the tag may appear anywhere in the line."
			)
			.addToggle((toggle) =>
				toggle.setValue(settings.requireTagAtStart).onChange(async (value) => {
					settings.requireTagAtStart = value;
					await save();
				})
			);

		new Setting(containerEl)
			.setName("Target heading")
			.setDesc("Moved tasks are inserted directly beneath this heading.")
			.addText((text) =>
				text.setValue(settings.tasksHeading).onChange(async (value) => {
					settings.tasksHeading = value.trim() || DEFAULT_SETTINGS.tasksHeading;
					await save();
				})
			);

		new Setting(containerEl)
			.setName("Collection note")
			.setDesc("Where 'put on hold' sends tasks. Vault path, with or without the .md extension.")
			.addText((text) =>
				text.setValue(settings.collectionNote).onChange(async (value) => {
					settings.collectionNote = value.trim();
					await save();
				})
			);

		new Setting(containerEl)
			.setName("Excluded folders")
			.setDesc(
				"Comma-separated. Skipped in vault-wide searches. Periodic note folders are excluded automatically."
			)
			.addTextArea((text) =>
				text.setValue(settings.excludedFolders.join(", ")).onChange(async (value) => {
					settings.excludedFolders = value
						.split(",")
						.map((folder) => folder.trim())
						.filter(Boolean);
					await save();
				})
			);

		new Setting(containerEl)
			.setName("Schedule format")
			.setDesc("How the date picker writes a scheduled date.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("dataview", "Dataview — [scheduled:: 2026-01-31]")
					.addOption("emoji", "Tasks — ⏳ 2026-01-31")
					.setValue(settings.scheduleStyle)
					.onChange(async (value) => {
						settings.scheduleStyle = value === "emoji" ? "emoji" : "dataview";
						await save();
					})
			);

		new Setting(containerEl)
			.setName("Row actions")
			.setDesc(
				"How each row's buttons are drawn. Minimal: icon buttons that appear when you hover the row. Emoji: always visible, in the style the Tasks plugin uses."
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption("minimal", "Minimal — icons on hover")
					.addOption("emoji", "Emoji — ➡️ ⏸️ ⏳, always visible")
					.setValue(settings.actionStyle)
					.onChange(async (value) => {
						settings.actionStyle = value === "emoji" ? "emoji" : "minimal";
						await save();
						this.plugin.index.refresh();
					})
			);

		new Setting(containerEl).setName("Editing").setHeading();

		new Setting(containerEl)
			.setName("Tagging also creates checkboxes")
			.setDesc(
				"The tagging command turns plain bullets and plain lines into tasks. Off: only existing checklist items are tagged."
			)
			.addToggle((toggle) =>
				toggle.setValue(settings.promoteOnToggle).onChange(async (value) => {
					settings.promoteOnToggle = value;
					await save();
				})
			);

		new Setting(containerEl)
			.setName("Carry the tag onto the next line")
			.setDesc(
				"Pressing enter on a tagged task starts the next item already tagged. Enter on an empty item still ends the list."
			)
			.addToggle((toggle) =>
				toggle.setValue(settings.continueTagOnEnter).onChange(async (value) => {
					settings.continueTagOnEnter = value;
					await save();
				})
			);

		new Setting(containerEl)
			.setName("Calendar icon on tagged tasks")
			.setDesc(
				"Hovering a tagged task anywhere in a note reveals a button that opens the date picker. The command works either way."
			)
			.addToggle((toggle) =>
				toggle.setValue(settings.showScheduleIcon).onChange(async (value) => {
					settings.showScheduleIcon = value;
					await save();
					// The editor extension reads this when it builds, so the
					// open editors need telling to rebuild.
					this.app.workspace.updateOptions();
				})
			);

		new Setting(containerEl)
			.setName("Periodic notes")
			.setDesc(
				periodicNotesAvailable(this.app)
					? "Periodic Notes is installed. Its folders and formats are used automatically; the values below apply only to granularities it doesn't define."
					: "Periodic Notes is not installed. The values below are used instead."
			)
			.setHeading();

		for (const granularity of GRANULARITIES) {
			const config = settings.fallbackPeriodic[granularity];
			new Setting(containerEl)
				.setName(GRANULARITY_LABEL[granularity])
				.addText((text) =>
					text
						.setPlaceholder("folder")
						.setValue(config.folder)
						.onChange(async (value) => {
							config.folder = value.trim();
							await save();
						})
				)
				.addText((text) =>
					text
						.setPlaceholder("format")
						.setValue(config.format)
						.onChange(async (value) => {
							config.format = value.trim() || DEFAULT_FORMAT[granularity];
							await save();
						})
				);
		}
	}
}
