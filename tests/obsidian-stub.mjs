/*
 * The `obsidian` module only exists inside the app. These tests exercise the
 * plugin's pure logic — parsing, tagging, path handling, line edits — so the
 * module is stubbed with just the pieces that logic actually touches.
 */
export { default as moment } from "moment";

export class TFile {
	constructor(path) {
		this.path = path;
	}
}
export class MarkdownView {}
export class Vault {}
export class Plugin {}
export class Component {
	register() {}
	onunload() {}
}

/** Mirrors Obsidian's own normalizePath closely enough for these tests. */
export function normalizePath(path) {
	const normalized = path
		.replace(/\\/g, "/")
		.replace(/\/{2,}/g, "/")
		.replace(/^\/+|\/+$/g, "");
	return normalized === "" ? "/" : normalized;
}
