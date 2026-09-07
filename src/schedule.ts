import { App, Modal, moment, setIcon, setTooltip } from "obsidian";
import { ISO, Moment, monthMatrix, parseDateInput, weekdayLabels } from "./dates";

export interface ScheduleModalOptions {
	/** Shown above the field: what is being scheduled. */
	subject?: string;
	/** The date the task already carries, if any. */
	initial?: string | null;
	/** Whether to offer clearing the date. Off when there is nothing to clear. */
	allowClear?: boolean;
	/** A date, or null meaning "remove the date". Not called when cancelled. */
	onPick: (date: string | null) => void | Promise<void>;
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

	/** The month on show, which is not always the month of the selected day. */
	private visible: Moment;
	private selected: string | null;

	constructor(app: App, options: ScheduleModalOptions) {
		super(app);
		this.options = options;
		this.selected = options.initial ?? null;
		this.visible = (this.selected ? moment(this.selected, ISO) : moment()).startOf("month");
	}

	onOpen() {
		const { contentEl, modalEl } = this;
		modalEl.addClass("trc-schedule-modal");
		this.titleEl.setText("Schedule task");

		if (this.options.subject) {
			contentEl.createDiv({ cls: "trc-schedule-subject", text: this.options.subject });
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
		if (this.options.allowClear) {
			const clear = footer.createEl("button", {
				cls: "trc-schedule-clear",
				text: "Clear date"
			});
			clear.type = "button";
			clear.addEventListener("click", () => this.commit(null));
		}

		this.confirm = footer.createEl("button", { cls: "mod-cta", text: "Schedule" });
		this.confirm.type = "button";
		this.confirm.addEventListener("click", () => {
			if (this.selected) this.commit(this.selected);
		});

		this.input.addEventListener("input", () => {
			const parsed = parseDateInput(this.input.value);
			this.selected = parsed;
			if (parsed) this.visible = moment(parsed, ISO).startOf("month");
			this.refresh();
		});

		this.input.addEventListener("keydown", (event) => {
			if (event.key !== "Enter") return;
			event.preventDefault();
			const parsed = parseDateInput(this.input.value);
			if (parsed) this.commit(parsed);
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

	private async commit(date: string | null) {
		this.close();
		await this.options.onPick(date);
	}

	/** Redraw the month grid and everything that depends on the selection. */
	private refresh() {
		const today = moment().format(ISO);
		this.monthLabel.setText(this.visible.format("MMMM YYYY"));
		this.confirm.disabled = this.selected === null;

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
