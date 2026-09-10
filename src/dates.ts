import { moment, type Moment } from "./moment";

/** The one date format the plugin ever writes into a note. */
export const ISO = "YYYY-MM-DD";

const WEEKDAYS = [
	"sunday",
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday"
];

const UNITS: Record<string, "days" | "weeks" | "months" | "years"> = {
	d: "days",
	w: "weeks",
	m: "months",
	y: "years"
};

/** Month-name spellings, tried strictly so "12" never lands here by accident. */
const NAMED_FORMATS = [
	"D MMM",
	"D MMMM",
	"MMM D",
	"MMMM D",
	"D MMM YYYY",
	"D MMMM YYYY",
	"MMM D YYYY",
	"MMMM D YYYY"
];

function iso(date: Moment): string {
	return date.format(ISO);
}

/**
 * A bare day or day-month is read as the next time that date comes round, not
 * as a date in the past: this input only ever schedules work.
 */
function forward(date: Moment, base: Moment, unit: "month" | "year"): Moment {
	return date.isBefore(base) ? date.add(1, unit) : date;
}

function ymd(year: string, month: string, day: string): Moment | null {
	const text = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
	const date = moment(text, ISO, true);
	return date.isValid() ? date : null;
}

function weekdayIndex(word: string): number {
	if (word.length < 3) return -1;
	return WEEKDAYS.findIndex((name) => name.startsWith(word));
}

/**
 * Turn what someone typed into an ISO date, or null if it isn't one yet.
 *
 * Accepts ISO dates (`2026-09-12`, with `/` or `.` for separators too), partial
 * dates (`09-12`, `12`), month names (`12 Sep`), relative words (`today`,
 * `tomorrow`, `next month`), weekday names (`fri`, `next friday`) and offsets
 * (`+3`, `+3d`, `2w`, `-1m`). Anything ambiguous resolves forwards.
 */
export function parseDateInput(input: string, today?: Moment): string | null {
	const base = (today ? today.clone() : moment()).startOf("day");
	const text = input.trim().toLowerCase().replace(/\s+/g, " ");
	if (!text) return null;

	if (text === "today" || text === "now") return iso(base);
	if (text === "tomorrow" || text === "tom" || text === "tmr") {
		return iso(base.clone().add(1, "day"));
	}
	if (text === "yesterday") return iso(base.clone().subtract(1, "day"));

	// next week / next month / next friday
	const next = text.match(/^next (\w+)$/);
	if (next) {
		const word = next[1];
		if (word === "week") return iso(base.clone().add(1, "week"));
		if (word === "month") return iso(base.clone().add(1, "month"));
		if (word === "year") return iso(base.clone().add(1, "year"));
		const day = weekdayIndex(word);
		if (day !== -1) return iso(nextWeekday(base, day));
	}

	const weekday = weekdayIndex(text);
	if (weekday !== -1) return iso(nextWeekday(base, weekday));

	// +3, +3d, 2w, -1m. A bare number without a sign or unit is a day of the
	// month instead, which is the far more common thing to type.
	const offset = text.match(/^([+-]?)(\d+) ?([dwmy])?$/);
	if (offset && (offset[1] || offset[3])) {
		const amount = Number.parseInt(offset[2], 10) * (offset[1] === "-" ? -1 : 1);
		return iso(base.clone().add(amount, UNITS[offset[3] || "d"]));
	}

	const digits = text.replace(/[./]/g, "-");

	// Padded and parsed strictly, because moment's strict mode reads `D` as one
	// digit and would reject an ordinary `2026-09-01`.
	const full = digits.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
	if (full) {
		const date = ymd(full[1], full[2], full[3]);
		return date ? iso(date) : null;
	}

	const monthDay = digits.match(/^(\d{1,2})-(\d{1,2})$/);
	if (monthDay) {
		const date = ymd(String(base.year()), monthDay[1], monthDay[2]);
		return date ? iso(forward(date, base, "year")) : null;
	}

	const dayOnly = digits.match(/^(\d{1,2})$/);
	if (dayOnly) {
		const day = Number.parseInt(dayOnly[1], 10);
		if (day < 1 || day > 31) return null;
		const date = base.clone().date(day);
		// A 31st in a 30-day month rolls into the next one, which is wrong.
		if (date.date() !== day) return null;
		return iso(forward(date, base, "month"));
	}

	const named = moment(text, NAMED_FORMATS, true);
	if (named.isValid()) {
		const dated = /\d{4}/.test(text) ? named : forward(named.year(base.year()), base, "year");
		return iso(dated);
	}

	return null;
}

/** The next occurrence of a weekday, never today — "friday" on a Friday means the next one. */
function nextWeekday(base: Moment, weekday: number): Moment {
	const date = base.clone();
	do {
		date.add(1, "day");
	} while (date.day() !== weekday);
	return date;
}

/**
 * Six weeks of days covering a month, starting on the locale's first day of the
 * week. Always six rows so the grid doesn't change height as months are paged.
 */
export function monthMatrix(month: Moment): Moment[][] {
	const start = month.clone().startOf("month").startOf("week");
	const weeks: Moment[][] = [];
	for (let week = 0; week < 6; week++) {
		const days: Moment[] = [];
		for (let day = 0; day < 7; day++) days.push(start.clone().add(week * 7 + day, "day"));
		weeks.push(days);
	}
	return weeks;
}

/** Short weekday names, rotated to the locale's first day of the week. */
export function weekdayLabels(): string[] {
	const first = moment.localeData().firstDayOfWeek();
	const names = moment.weekdaysMin();
	return names.slice(first).concat(names.slice(0, first));
}
