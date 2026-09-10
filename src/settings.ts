import { App, PluginSettingTab, Setting, SettingDefinitionItem } from "obsidian";
import type TaskRolloverPlugin from "./main";
import {
	DEFAULT_FORMAT,
	GRANULARITIES,
	GRANULARITY_LABEL,
	Granularity,
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

/** The settings the tab edits through controls. */
type ControlKey =
	| "taskTag"
	| "requireTagAtStart"
	| "tasksHeading"
	| "collectionNote"
	| "excludedFolders"
	| "scheduleStyle"
	| "actionStyle"
	| "promoteOnToggle"
	| "continueTagOnEnter"
	| "showScheduleIcon";

export class RolloverSettingTab extends PluginSettingTab {
	private plugin: TaskRolloverPlugin;

	constructor(app: App, plugin: TaskRolloverPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * Declarative, so Obsidian draws the tab itself and indexes every entry for
	 * its settings search. Values pass through getControlValue and
	 * setControlValue below, which is where trimming, defaults and side effects
	 * live.
	 */
	getSettingDefinitions(): SettingDefinitionItem<ControlKey>[] {
		const app = this.app;

		return [
			{
				name: "Task tag",
				desc: "Only checklist items carrying this tag are rolled over. The same tag is used by the tagging command and by tag continuation.",
				control: { type: "text", key: "taskTag" }
			},
			{
				name: "Tag must start the line",
				desc: "On: only '- [ ] #task …' matches. Off: the tag may appear anywhere in the line.",
				control: { type: "toggle", key: "requireTagAtStart" }
			},
			{
				name: "Target heading",
				desc: "Moved tasks are inserted directly beneath this heading.",
				control: { type: "text", key: "tasksHeading" }
			},
			{
				name: "Collection note",
				desc: "Where 'put on hold' sends tasks. Vault path, with or without the .md extension.",
				control: { type: "text", key: "collectionNote" }
			},
			{
				name: "Excluded folders",
				desc: "Comma-separated. Skipped in vault-wide searches. Periodic note folders are excluded automatically.",
				control: { type: "textarea", key: "excludedFolders" }
			},
			{
				name: "Schedule format",
				desc: "How the date picker writes a scheduled date.",
				control: {
					type: "dropdown",
					key: "scheduleStyle",
					options: {
						dataview: "Dataview — [scheduled:: 2026-01-31]",
						emoji: "Tasks — ⏳ 2026-01-31"
					}
				}
			},
			{
				name: "Row actions",
				desc: "How each row's buttons are drawn. Minimal: icon buttons that appear when you hover the row. Emoji: always visible, in the style the Tasks plugin uses.",
				control: {
					type: "dropdown",
					key: "actionStyle",
					options: {
						minimal: "Minimal — icons on hover",
						emoji: "Emoji — ➡️ ⏸️ ⏳, always visible"
					}
				}
			},
			{
				type: "group",
				heading: "Editing",
				items: [
					{
						name: "Tagging also creates checkboxes",
						desc: "The tagging command turns plain bullets and plain lines into tasks. Off: only existing checklist items are tagged.",
						control: { type: "toggle", key: "promoteOnToggle" }
					},
					{
						name: "Carry the tag onto the next line",
						desc: "Pressing enter on a tagged task starts the next item already tagged. Enter on an empty item still ends the list.",
						control: { type: "toggle", key: "continueTagOnEnter" }
					},
					{
						name: "Calendar icon on tagged tasks",
						desc: "Hovering a tagged task anywhere in a note reveals a button that opens the date picker. The command works either way.",
						control: { type: "toggle", key: "showScheduleIcon" }
					}
				]
			},
			{
				type: "group",
				heading: "Periodic notes",
				items: [
					// A group carries no description, so what used to be the
					// heading's note is a row of its own. `visible` is evaluated
					// on every render, so it follows the plugin being installed
					// or removed while the tab is open.
					{
						name: "Periodic Notes is installed",
						desc: "Its folders and formats are used automatically; the values below apply only to granularities it doesn't define.",
						visible: () => periodicNotesAvailable(app)
					},
					{
						name: "Periodic Notes is not installed",
						desc: "The values below are used instead.",
						visible: () => !periodicNotesAvailable(app)
					},
					...GRANULARITIES.map((granularity) => ({
						name: GRANULARITY_LABEL[granularity],
						aliases: ["folder", "format", "periodic notes"],
						render: (setting: Setting) => this.renderPeriodicRow(setting, granularity)
					}))
				]
			}
		];
	}

	/**
	 * Folder and format side by side in one row. A control definition holds a
	 * single value, so this row is drawn by hand; its name still feeds search.
	 */
	private renderPeriodicRow(setting: Setting, granularity: Granularity) {
		const config = this.plugin.settings.fallbackPeriodic[granularity];
		setting
			.addText((text) =>
				text
					.setPlaceholder("Folder")
					.setValue(config.folder)
					.onChange(async (value) => {
						config.folder = value.trim();
						await this.plugin.saveSettings();
					})
			)
			.addText((text) =>
				text
					.setPlaceholder("Format")
					.setValue(config.format)
					.onChange(async (value) => {
						config.format = value.trim() || DEFAULT_FORMAT[granularity];
						await this.plugin.saveSettings();
					})
			);
	}

	getControlValue(key: string): unknown {
		const settings = this.plugin.settings;
		// Stored as a list, edited as one comma-separated line.
		if (key === "excludedFolders") return settings.excludedFolders.join(", ");
		return settings[key as keyof RolloverSettings];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const settings = this.plugin.settings;
		const text = typeof value === "string" ? value : "";
		const on = value === true;

		switch (key as ControlKey) {
			case "taskTag":
				settings.taskTag = text.trim() || DEFAULT_SETTINGS.taskTag;
				break;
			case "tasksHeading":
				settings.tasksHeading = text.trim() || DEFAULT_SETTINGS.tasksHeading;
				break;
			case "collectionNote":
				settings.collectionNote = text.trim();
				break;
			case "excludedFolders":
				settings.excludedFolders = text
					.split(",")
					.map((folder) => folder.trim())
					.filter(Boolean);
				break;
			case "scheduleStyle":
				settings.scheduleStyle = text === "emoji" ? "emoji" : "dataview";
				break;
			case "actionStyle":
				settings.actionStyle = text === "emoji" ? "emoji" : "minimal";
				break;
			case "requireTagAtStart":
				settings.requireTagAtStart = on;
				break;
			case "promoteOnToggle":
				settings.promoteOnToggle = on;
				break;
			case "continueTagOnEnter":
				settings.continueTagOnEnter = on;
				break;
			case "showScheduleIcon":
				settings.showScheduleIcon = on;
				break;
			default:
				return;
		}

		await this.plugin.saveSettings();

		// Drawing only, so nothing re-reads it on its own: redraw open blocks.
		if (key === "actionStyle") this.plugin.index.refresh();
		// The editor extension reads this when it builds, so the open editors
		// need telling to rebuild.
		if (key === "showScheduleIcon") this.app.workspace.updateOptions();
	}
}
