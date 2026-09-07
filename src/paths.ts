import { normalizePath, TFile, Vault } from "obsidian";

/**
 * Vault-relative folder path, normalised. Every folder in this plugin comes
 * from user settings or from another plugin's settings, so none of them can be
 * trusted to be well formed.
 *
 * `normalizePath` returns "/" for an empty path, which is not what a folder
 * setting means: an empty folder setting means the vault root, and the root is
 * best represented as "" so that `inFolder` can special-case it.
 */
export function normalizeFolder(raw: string | undefined | null): string {
	const trimmed = (raw ?? "").trim();
	if (!trimmed) return "";
	const normalized = normalizePath(trimmed);
	return normalized === "/" ? "" : normalized;
}

/** Vault-relative note path, normalised, with the extension added if missing. */
export function normalizeNotePath(raw: string | undefined | null): string {
	const trimmed = (raw ?? "").trim();
	if (!trimmed) return "";
	const withExt = trimmed.toLowerCase().endsWith(".md") ? trimmed : trimmed + ".md";
	return normalizePath(withExt);
}

/** Is this file directly inside, or below, that folder? "" means the vault root. */
export function inFolder(path: string, folder: string): boolean {
	if (!folder) return !path.includes("/");
	return path.startsWith(folder + "/");
}

/** Is this file inside any of these folders? Empty entries are ignored. */
export function inAnyFolder(path: string, folders: string[]): boolean {
	return folders.some((folder) => folder !== "" && path.startsWith(folder + "/"));
}

/**
 * Resolve a note path without iterating the vault. `getFileByPath` is a map
 * lookup; scanning `getMarkdownFiles()` for a basename is the antipattern the
 * plugin guidelines call out.
 */
export function noteAt(vault: Vault, path: string): TFile | null {
	const normalized = normalizeNotePath(path);
	if (!normalized) return null;
	return vault.getFileByPath(normalized);
}
