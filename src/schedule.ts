import { App, Modal, moment, setIcon, setTooltip } from "obsidian";
import {
	DATE_FIELDS,
	DateField,
	FIELD_EMOJI,
	FIELD_LABEL,
	parseFieldPrefix
} from "./actions";
import { ISO, Moment, monthMatrix, parseDateInput, weekdayLabels } from "./dates";

export interface ScheduleModalOptions {
	/** Shown above the field: what is being scheduled. */
	subject?: string;
	/** The date the task already carries for a field, if any. */
	current?: (field: DateField) => string | null;
	/** A date, or null meaning "remove the date". Not called when cancelled. */
	onPick: (date: string | null, field: DateField) => void | Promise<void>;
}

/**
 * A date prompt that is usable with the keyboard alone — the field takes focus
 * on open and accepts everything `parseDateInput` understands, so a date is one
 * short burst of typing and enter — while still offering a month to click
 * through for the times a date is easier recognised than named.
 *
 * The grid uses a roving tabindex: one day is tabbable and the arrow keys move
 * between them, so tabbing out of the field doesn't mean 42 stops.
 */
export class ScheduleModal extends Modal {
	private options: ScheduleModalOptions;
	private input: HTMLInputElement;
	private hint: HTMLElement;
	private grid: HTMLElement;
	private monthLabel: HTMLElement;
	private confirm: HTMLButtonElement;
	private clear: HTMLButtonElement | null = null;
	private fieldButtons = new Map<DateField, HTMLButtonElement>();

	/** The month on show, which is not always the month of the selected day. */
	private visible: Moment;
	private selected: string | null;
	/** Which date is being set. Scheduling is the common case, so it leads. */
	private field: DateField = "scheduled";
	/** True until the field is typed in, so switching can still refill it. */
	private pristine = true;

	constructor(app: App, options: ScheduleModalOptions) {
		super(app);
		this.options = options;
		this.selected = this.existing();
		this.visible = (this.selected ? moment(this.selected, ISO) : moment()).startOf("month");
	}

	/** The date the task already carries for the field on show. */
	private existing(): string | null {
		return this.options.current?.(this.field) ?? null;
	}

	onOpen() {
		const { contentEl, modalEl } = this;
		modalEl.addClass("trc-schedule-modal");
		this.titleEl.setText("Set a date");

		if (this.options.subject) {
			contentEl.createDiv({ cls: "trc-schedule-subject", text: this.options.subject });
		}

		const fields = contentEl.createDiv({ cls: "trc-schedule-fields" });
		for (const field of DATE_FIELDS) {
			const button = fields.createEl("button", {
				cls: "trc-schedule-field",
				text: FIELD_EMOJI[field] + " " + FIELD_LABEL[field]
			});
			button.type = "button";
			// Keep the caret in the text field: picking a date is still meant
			// to be one burst of typing, mouse or no mouse.
			button.addEventListener("mousedown", (event) => event.preventDefault());
			button.addEventListener("click", () => this.setField(field));
			this.fieldButtons.set(field, button);
		}

		this.input = contentEl.createEl("input", {
			cls: "trc-schedule-input",
			type: "text",
			value: this.selected ?? ""
		});
		this.input.placeholder = "Today, fri, +3d, 12, 2026-09-12";
		this.input.setAttr("aria-label", "Date");

		this.hint = contentEl.createDiv({ cls: "trc-schedule-hint" });

		const header = contentEl.createDiv({ cls: "trc-schedule-header" });
		this.navButton(header, "chevron-left", "Previous month", -1);
		this.monthLabel = header.createDiv({ cls: "trc-schedule-month" });
		this.navButton(header, "chevron-right", "Next month", 1);

		const weekdays = contentEl.createDiv({ cls: "trc-schedule-weekdays" });
		for (const label of weekdayLabels()) {
			weekdays.createDiv({ cls: "trc-schedule-weekday", text: label });
		}

		this.grid = contentEl.createDiv({ cls: "trc-schedule-grid" });
		this.grid.addEventListener("keydown", (event) => this.onGridKey(event));

		const footer = contentEl.createDiv({ cls: "trc-schedule-footer" });
		this.clear = footer.createEl("button", { cls: "trc-schedule-clear", text: "Clear date" });
		this.clear.type = "button";
		this.clear.addEventListener("click", () => this.commit(null));

		this.confirm = footer.createEl("button", { cls: "mod-cta" });
		this.confirm.type = "button";
		this.confirm.addEventListener("click", () => {
			if (this.selected) this.commit(this.selected);
		});

		this.input.addEventListener("input", () => {
			this.pristine = false;
			// A leading `due` or `start` switches the field as it is typed, so
			// the whole prompt stays reachable without leaving the box.
			const typed = parseFieldPrefix(this.input.value);
			if (typed.field) this.field = typed.field;

			const parsed = parseDateInput(typed.field ? typed.rest : this.input.value);
			this.selected = parsed;
			if (parsed) this.visible = moment(parsed, ISO).startOf("month");
			this.refresh();
		});

		this.input.addEventListener("keydown", (event) => {
			if (event.key !== "Enter") return;
			event.preventDefault();
			if (this.selected) this.commit(this.selected);
		});

		this.refresh();

		// Selecting rather than just focusing means typing over an existing
		// date replaces it, and the arrow keys still work for editing.
		this.input.focus();
		this.input.select();
	}

	onClose() {
		this.contentEl.empty();
	}

	private navButton(parent: HTMLElement, icon: string, tooltip: string, months: number) {
		const button = parent.createEl("button", { cls: "clickable-icon trc-schedule-nav" });
		button.type = "button";
		setIcon(button, icon);
		setTooltip(button, tooltip);
		button.setAttr("aria-label", tooltip);
		button.addEventListener("click", () => {
			this.visible = this.visible.clone().add(months, "month");
			this.refresh();
		});
	}

	/**
	 * Switch which date is being set. An untouched box is refilled with what
	 * the task already holds for the new field; anything typed is left alone,
	 * since it is worth more than the prefill it would replace.
	 */
	private setField(field: DateField) {
		this.field = field;

		if (this.pristine) {
			this.input.value = this.existing() ?? "";
			this.selected = this.existing();
			if (this.selected) this.visible = moment(this.selected, ISO).startOf("month");
		} else {
			// A typed `due ` prefix would otherwise flip the field straight
			// back on the next keystroke.
			const typed = parseFieldPrefix(this.input.value);
			if (typed.field) this.input.value = typed.rest;
		}

		this.input.focus();
		this.refresh();
	}

	private async commit(date: string | null) {
		this.close();
		await this.options.onPick(date, this.field);
	}

	/** Redraw the month grid and everything that depends on the selection. */
	private refresh() {
		const today = moment().format(ISO);
		const label = FIELD_LABEL[this.field].toLowerCase();

		this.monthLabel.setText(this.visible.format("MMMM YYYY"));
		this.confirm.disabled = this.selected === null;
		this.confirm.setText(`Set ${label} date`);

		for (const [field, button] of this.fieldButtons) {
			button.toggleClass("is-active", field === this.field);
		}

		// Nothing to clear until the task actually carries this date.
		if (this.clear) {
			this.clear.toggleClass("trc-hidden", this.existing() === null);
			this.clear.setText(`Clear ${label} date`);
		}

		if (!this.input.value.trim()) {
			this.hint.setText("Type a date, or pick one below.");
			this.hint.removeClass("is-error");
		} else if (this.selected) {
			this.hint.setText(moment(this.selected, ISO).format("dddd, D MMMM YYYY"));
			this.hint.removeClass("is-error");
		} else {
			this.hint.setText("Not a date yet.");
			this.hint.addClass("is-error");
		}

		this.grid.empty();
		// One tab stop into the grid: the selected day, else today, else the
		// first of the month on show.
		const tabbable =
			this.selected && moment(this.selected, ISO).isSame(this.visible, "month")
				? this.selected
				: this.visible.isSame(moment(), "month")
					? today
					: this.visible.format(ISO);

		for (const week of monthMatrix(this.visible)) {
			for (const day of week) {
				const date = day.format(ISO);
				const cell = this.grid.createEl("button", {
					cls: "trc-schedule-day",
					text: String(day.date())
				});
				cell.type = "button";
				cell.dataset.date = date;
				cell.tabIndex = date === tabbable ? 0 : -1;
				cell.toggleClass("is-outside", !day.isSame(this.visible, "month"));
				cell.toggleClass("is-today", date === today);
				cell.toggleClass("is-selected", date === this.selected);
				cell.setAttr("aria-label", day.format("dddd, D MMMM YYYY"));
				cell.addEventListener("click", () => this.commit(date));
			}
		}
	}

	/** Arrow keys walk the grid by day and week, paging months at the edges. */
	private onGridKey(event: KeyboardEvent) {
		const steps: Record<string, [number, "day" | "month"]> = {
			ArrowLeft: [-1, "day"],
			ArrowRight: [1, "day"],
			ArrowUp: [-7, "day"],
			ArrowDown: [7, "day"],
			PageUp: [-1, "month"],
			PageDown: [1, "month"]
		};
		const step = steps[event.key];
		if (!step) return;

		const focused = document.activeElement as HTMLElement | null;
		const from = focused?.dataset?.date;
		if (!from) return;

		event.preventDefault();
		const target = moment(from, ISO).add(step[0], step[1]);
		this.selected = target.format(ISO);
		this.input.value = this.selected;
		this.visible = target.clone().startOf("month");
		this.refresh();
		this.grid.querySelector<HTMLElement>(".trc-schedule-day.is-selected")?.focus();
	}
}
