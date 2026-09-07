import { App, moment, Plugin } from "obsidian";
import { inFolder, normalizeFolder } from "./paths";

export type Granularity = "day" | "week" | "month" | "quarter" | "year";

export const GRANULARITIES: Granularity[] = ["day", "week", "month", "quarter", "year"];

export type Moment = ReturnType<typeof moment>;

/** Key used by the Periodic Notes plugin for each granularity. */
const PN_KEY: Record<Granularity, string> = {
	day: "daily",
	week: "weekly",
	month: "monthly",
	quarter: "quarterly",
	year: "yearly"
};

export const DEFAULT_FORMAT: Record<Granularity, string> = {
	day: "YYYY-MM-DD",
	week: "gggg-[W]ww",
	month: "YYYY-MM",
	quarter: "YYYY-[Q]Q",
	year: "YYYY"
};

export const GRANULARITY_LABEL: Record<Granularity, string> = {
	day: "Daily",
	week: "Weekly",
	month: "Monthly",
	quarter: "Quarterly",
	year: "Yearly"
};

export interface PeriodicConfig {
	folder: string;
	format: string;
}

export type PeriodicFallbacks = Record<Granularity, PeriodicConfig>;

/**
 * The shape we hope to find on the Periodic Notes plugin. Reading another
 * plugin's settings is undocumented API, so every field is optional and every
 * read is defensive.
 */
interface PeriodicNotesLike extends Plugin {
	settings?: Record<string, { enabled?: boolean; folder?: string; format?: string } | undefined>;
}

/**
 * Obsidian has no plugin dependency mechanism, so Periodic Notes is detected at
 * runtime and treated as optional. When it is missing (or has dropped a
 * granularity, as some forks have for quarters) we fall back to our own settings.
 */
export function getPeriodicNotes(app: App): PeriodicNotesLike | null {
	const plugins = (app as App & { plugins?: { plugins?: Record<string, Plugin> } }).plugins;
	return (plugins?.plugins?.["periodic-notes"] as PeriodicNotesLike | undefined) ?? null;
}

export function periodicNotesAvailable(app: App): boolean {
	return getPeriodicNotes(app) !== null;
}

/** The folder and format to use for a granularity, Periodic Notes first. */
export function configFor(
	app: App,
	granularity: Granularity,
	fallback: PeriodicFallbacks
): PeriodicConfig {
	const raw = getPeriodicNotes(app)?.settings?.[PN_KEY[granularity]];

	if (raw && raw.enabled !== false && (raw.folder !== undefined || raw.format !== undefined)) {
		return {
			folder: normalizeFolder(raw.folder),
			format: raw.format || DEFAULT_FORMAT[granularity]
		};
	}

	const own = fallback?.[granularity];
	return {
		folder: normalizeFolder(own?.folder),
		format: own?.format || DEFAULT_FORMAT[granularity]
	};
}

function basename(path: string): string {
	const last = path.split("/").pop() ?? path;
	return last.replace(/\.md$/, "");
}

/** The date a periodic note represents, or null if the name doesn't parse. */
export function dateOf(path: string, cfg: PeriodicConfig): Moment | null {
	if (!inFolder(path, cfg.folder)) return null;
	const parsed = moment(basename(path), cfg.format, true);
	return parsed.isValid() ? parsed : null;
}

/** Which granularity, if any, this file is a periodic note of. */
export function granularityOf(
	app: App,
	path: string,
	fallback: PeriodicFallbacks
): Granularity | null {
	for (const granularity of GRANULARITIES) {
		if (dateOf(path, configFor(app, granularity, fallback))) return granularity;
	}
	return null;
}

/** All periodic-note folders, used to keep them out of vault-wide searches. */
export function allPeriodicFolders(app: App, fallback: PeriodicFallbacks): string[] {
	return GRANULARITIES.map((g) => configFor(app, g, fallback).folder).filter(
		(folder) => folder !== ""
	);
}
