import moment from "moment";
import { parseDateInput, monthMatrix, weekdayLabels } from "../src/dates.ts";
import { scheduleLines, withDate, withoutDate, isTaskLine } from "../src/actions.ts";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
	const g = JSON.stringify(got), w = JSON.stringify(want);
	if (g === w) pass++; else { fail++; console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`); }
};

// A Thursday, mid-month, mid-year: nothing about it is a special case.
const TODAY = moment("2026-09-10", "YYYY-MM-DD");
const on = (input) => parseDateInput(input, TODAY);

// --- words -------------------------------------------------------------
eq("today", on("today"), "2026-09-10");
eq("case and padding ignored", on("  ToDay "), "2026-09-10");
eq("tomorrow", on("tomorrow"), "2026-09-11");
eq("tmr", on("tmr"), "2026-09-11");
eq("yesterday", on("yesterday"), "2026-09-09");
eq("next week", on("next week"), "2026-09-17");
eq("next month", on("next month"), "2026-10-10");
eq("next year", on("next year"), "2027-09-10");
eq("empty is not a date", on("   "), null);
eq("nonsense is not a date", on("blah"), null);

// --- weekdays ----------------------------------------------------------
eq("friday", on("friday"), "2026-09-11");
eq("fri", on("fri"), "2026-09-11");
eq("next friday is the same friday", on("next friday"), "2026-09-11");
eq("monday wraps into next week", on("mon"), "2026-09-14");
eq("today's own weekday means the next one", on("thursday"), "2026-09-17");
eq("two letters are too few", on("mo"), null);
eq("tues", on("tues"), "2026-09-15");

// --- offsets -----------------------------------------------------------
eq("+3 is three days", on("+3"), "2026-09-13");
eq("+3d", on("+3d"), "2026-09-13");
eq("3d without a sign", on("3d"), "2026-09-13");
eq("2w", on("2w"), "2026-09-24");
eq("+1m", on("+1m"), "2026-10-10");
eq("-2d goes back", on("-2d"), "2026-09-08");
eq("space before the unit", on("+3 d"), "2026-09-13");

// --- explicit dates ----------------------------------------------------
eq("iso", on("2026-12-01"), "2026-12-01");
eq("iso with slashes", on("2026/12/01"), "2026-12-01");
eq("iso with dots", on("2026.12.01"), "2026-12-01");
eq("iso unpadded", on("2026-9-3"), "2026-09-03");
eq("impossible iso", on("2026-13-01"), null);
eq("month-day later this year", on("12-01"), "2026-12-01");
eq("month-day already past rolls to next year", on("01-05"), "2027-01-05");
eq("bare day later this month", on("22"), "2026-09-22");
eq("bare day already past rolls to next month", on("2"), "2026-10-02");
eq("day 31 in a 30-day month is refused", on("31"), null);
eq("day 0 is not a day", on("0"), null);
eq("day 32 is not a day", on("32"), null);

// --- month names -------------------------------------------------------
eq("day month", on("12 dec"), "2026-12-12");
eq("month day", on("dec 12"), "2026-12-12");
eq("full month name", on("3 january"), "2027-01-03");
eq("month name with a year", on("3 january 2026"), "2026-01-03");

// --- the calendar grid -------------------------------------------------
const grid = monthMatrix(moment("2026-09-01", "YYYY-MM-DD"));
eq("six weeks", grid.length, 6);
eq("seven days a week", grid[0].length, 7);
eq("starts on a week boundary", grid[0][0].day(), moment.localeData().firstDayOfWeek());
eq("covers the whole month", [grid[0][0].isSameOrBefore("2026-09-01"), grid[5][6].isSameOrAfter("2026-09-30")], [true, true]);
eq("seven weekday labels", weekdayLabels().length, 7);

// --- writing the date back ---------------------------------------------
eq("dataview style", withDate("- [ ] #task write it up", "scheduled", "2026-09-12", "dataview"),
	"- [ ] #task write it up  [scheduled:: 2026-09-12]");
eq("emoji style", withDate("- [ ] #task write it up", "scheduled", "2026-09-12", "emoji"),
	"- [ ] #task write it up ⏳ 2026-09-12");
eq("rescheduling replaces, dataview",
	withDate("- [ ] #task write it up  [scheduled:: 2026-01-01]", "scheduled", "2026-09-12", "dataview"),
	"- [ ] #task write it up  [scheduled:: 2026-09-12]");
eq("rescheduling replaces, emoji",
	withDate("- [ ] #task write it up ⏳ 2026-01-01", "scheduled", "2026-09-12", "emoji"),
	"- [ ] #task write it up ⏳ 2026-09-12");
eq("switching style drops the old notation",
	withDate("- [ ] #task write it up ⏳ 2026-01-01", "scheduled", "2026-09-12", "dataview"),
	"- [ ] #task write it up  [scheduled:: 2026-09-12]");
eq("clearing", withoutDate("- [ ] #task write it up  [scheduled:: 2026-01-01]", "scheduled"),
	"- [ ] #task write it up");
eq("clearing an unscheduled line", withoutDate("- [ ] #task write it up", "scheduled"),
	"- [ ] #task write it up");
eq("a due date survives clearing",
	withoutDate("- [ ] #task write it up  [due:: 2026-01-01]", "scheduled"),
	"- [ ] #task write it up  [due:: 2026-01-01]");
eq("indentation and other annotations survive rescheduling",
	withDate("  * [/] #task sub  [due:: 2026-01-01]  [scheduled:: 2026-01-01]", "scheduled", "2026-09-12", "dataview"),
	"  * [/] #task sub  [due:: 2026-01-01]  [scheduled:: 2026-09-12]");

// --- the other two date fields -----------------------------------------
eq("a due date, dataview", withDate("- [ ] #task a", "due", "2026-09-12", "dataview"),
	"- [ ] #task a  [due:: 2026-09-12]");
eq("a due date, emoji", withDate("- [ ] #task a", "due", "2026-09-12", "emoji"),
	"- [ ] #task a 📅 2026-09-12");
eq("a start date, emoji", withDate("- [ ] #task a", "start", "2026-09-12", "emoji"),
	"- [ ] #task a 🛫 2026-09-12");
eq("setting one field leaves the others alone",
	withDate("- [ ] #task a ⏳ 2026-01-01 📅 2026-02-02", "due", "2026-09-12", "emoji"),
	"- [ ] #task a ⏳ 2026-01-01 📅 2026-09-12");
eq("clearing one field leaves the others alone",
	withoutDate("- [ ] #task a ⏳ 2026-01-01 📅 2026-02-02", "scheduled"),
	"- [ ] #task a 📅 2026-02-02");
eq("all three can sit on one line",
	["scheduled", "due", "start"].reduce(
		(line, field) => withDate(line, field, "2026-09-12", "dataview"), "- [ ] #task a"),
	"- [ ] #task a  [scheduled:: 2026-09-12]  [due:: 2026-09-12]  [start:: 2026-09-12]");

// --- across a selection ------------------------------------------------
eq("task lines only", isTaskLine("## Tasks"), false);
eq("indented task line", isTaskLine("\t- [x] done"), true);
eq("stamps every task, skips the rest",
	scheduleLines(["## Tasks", "- [ ] one", "", "  * [/] two", "plain prose"], "scheduled", "2026-09-12", "dataview"),
	["## Tasks", "- [ ] one  [scheduled:: 2026-09-12]", "", "  * [/] two  [scheduled:: 2026-09-12]", "plain prose"]);
eq("a null date clears instead",
	scheduleLines(["- [ ] one ⏳ 2026-01-01", "## Tasks"], "scheduled", null, "emoji"),
	["- [ ] one", "## Tasks"]);
eq("a whole selection takes a due date",
	scheduleLines(["- [ ] one", "- [ ] two"], "due", "2026-09-12", "emoji"),
	["- [ ] one 📅 2026-09-12", "- [ ] two 📅 2026-09-12"]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
