import { moment as obsidianMoment } from "obsidian";
import type { Locale, Moment, MomentFormatSpecification, MomentInput } from "moment";

export type { Moment };

/**
 * Obsidian's bundled moment, with its call signature written out.
 *
 * `obsidian.d.ts` types it as `typeof Moment`, a namespace import of moment's
 * `export =` function. Under `esModuleInterop` — as the community review's type
 * checker has it — a namespace import carries no call signature, so `moment()`
 * came back untyped and every date downstream of it was `any`. The object is
 * the same at runtime either way; only its declared type needed repairing.
 */
interface MomentFn {
	(inp?: MomentInput, format?: MomentFormatSpecification, strict?: boolean): Moment;
	localeData(): Locale;
	weekdaysMin(): string[];
}

export const moment = obsidianMoment as unknown as MomentFn;
