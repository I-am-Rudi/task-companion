# Task Rollover Companion

An Obsidian plugin for the tasks you didn't finish.

Place a `rollover` code block anywhere in a note or template and it renders an
interactive inbox: move tasks forward into today's note, park them for later,
schedule them, or tick them off — each action writing straight back to the note
the task actually lives in.

It works with [Periodic Notes](https://github.com/liamcain/obsidian-periodic-notes)
when that's installed, reading folders and date formats from its settings, and
works perfectly well on its own using its own settings. Obsidian has no plugin
dependency mechanism, so the integration is detected at runtime and is entirely
optional.

## Installation (manual)

Copy `main.js`, `manifest.json` and `styles.css` from a release into
`<vault>/.obsidian/plugins/task-rollover-companion/`, then enable the plugin in
Settings → Community plugins.

## Tagging tasks

The plugin tracks checklist items carrying a tag you choose — `#task` by
default. Two commands make that tag cheap to apply.

**Toggle task tag on the current line or selection.** Select a stretch of lines
and run it: the tag is inserted between the checkbox and the content.

    - [ ] call the plumber          →  - [ ] #task call the plumber
    - [ ] book the MOT              →  - [ ] #task book the MOT

Plain bullets and plain lines are turned into tasks on the way, so an ordinary
list becomes a tracked one in a single step. Turn off *Tagging also creates
checkboxes* if you'd rather only touch existing checklist items.

    - call the plumber              →  - [ ] #task call the plumber
    call the plumber                →  - [ ] #task call the plumber

The command is a real toggle: if every line it would touch is already tagged, it
strips the tag instead. A mixed selection tags everything. There's no default
hotkey — bind one in Settings → Hotkeys.

**Carrying the tag onto the next line.** With this on, pressing enter at the end
of a tagged task starts the next item already tagged, so a run of tasks can be
typed without repeating yourself.

    - [ ] #task call the plumber⏎
    - [ ] #task ▌

It only fires on a tagged, non-empty checklist item with the cursor past the
tag. Enter on an empty item still ends the list, and everything else keeps
Obsidian's normal behaviour.

Both features use the same tag as the rollover blocks, so tagging a line is what
puts it in the inbox.

## Scheduling tasks

**Schedule the task on the current line or selection.** Run it anywhere in the
vault — the task doesn't have to be tagged, or in a periodic note — and a small
date prompt opens with the field already focused, so a date is one short burst
of typing and enter.

The same prompt is a click away too: hover a tagged task anywhere in a note, in
either editing or reading view, and a calendar icon appears beside it. Turn that
off with *Calendar icon on tagged tasks* if you'd rather use the command alone.

The field takes rather more than an ISO date:

| You type | You get |
| --- | --- |
| `today`, `tomorrow`, `tmr`, `yesterday` | the obvious thing |
| `fri`, `friday`, `next friday` | the next Friday — never today |
| `next week`, `next month`, `next year` | a week, month or year out |
| `+3`, `+3d`, `2w`, `+1m`, `-2d` | an offset in days, weeks, months or years |
| `22` | the 22nd — this month, or next if it's gone |
| `12-01`, `12 dec`, `dec 12` | that day this year, or next if it's gone |
| `2026-12-01`, `2026/12/01` | exactly that |

Anything ambiguous resolves forwards, since this only ever schedules work. What
you've typed so far is spelled out beneath the field, and the month below
follows along: click a day to schedule it straight away, or tab into the grid
and walk it with the arrow keys (page up and down move by month). If the task
already has a date, it's there when the prompt opens, and **Clear date** removes
it.

The date is written in whichever notation *Schedule format* is set to —
`[scheduled:: 2026-12-01]` or `⏳ 2026-12-01` — replacing any date already on the
line, in either notation. A selection spanning several tasks schedules them all
in one step; lines that aren't checklist items are left alone. There's no
default hotkey — bind one in Settings → Hotkeys.

## Blocks

Three modes, each placed as its own block so you can position them freely.

**Unfinished tasks from earlier notes** — the classic rollover. Pulls from
periodic notes of the same granularity dated strictly before the current one.
Granularity is auto-detected from the note you're in, so the same block text
works in daily, weekly, monthly, quarterly and yearly templates.

    ```rollover
    mode: periodic
    title: Rollover inbox
    ```

Force a granularity when you want a weekly note to show the day-level backlog:

    ```rollover
    mode: periodic
    granularity: day
    title: Unfinished this week
    ```

**Collection note** — everything parked in your long-term note.

    ```rollover
    mode: collection
    title: Unscheduled & long-term
    ```

**Unscheduled elsewhere** — open tasks anywhere in the vault with no scheduled
or due date. Periodic note folders and the collection note are excluded
automatically.

    ```rollover
    mode: unscheduled
    title: Unscheduled elsewhere in the vault
    exclude: [Archive, Meta/Templates]
    ```

### Block options

| Key | Values | Notes |
| --- | --- | --- |
| `mode` | `periodic`, `collection`, `unscheduled` | Defaults to `periodic`. |
| `granularity` | `day`, `week`, `month`, `quarter`, `year` | `periodic` mode only. Defaults to the current note's own granularity. |
| `title` | any text | Omit for no heading. |
| `exclude` | `[A, B]` or `A, B` | Added to the folders excluded in settings. |
| `limit` | number | Cap the number of rows. |
| `show-source` | `true` / `false` | Whether to show the originating note. |

## Actions

Each row carries the actions that make sense for it:

- **checkbox** — writes `[x]` to the line in its source note
- **open** — open the source note
- **move here** — move the task and its subtasks under the target heading in the current note
- **put on hold** — move the task and its subtasks to the collection note (`periodic` mode)
- **schedule** — opens the date prompt above (`unscheduled` mode)

Two looks for those buttons, set by **Row actions**:

- **Minimal** (default) — icon buttons, appearing only when you hover the row,
  so the list stays quiet until you reach for it.
- **Emoji** — 🔗 ➡️ ⏸️ ⏳, always visible. These are the emoji the
  [Tasks](https://github.com/obsidian-tasks-group/obsidian-tasks) plugin uses
  for the same ideas, so a vault built around it doesn't end up reading two
  visual languages at once.

Subtasks render nested and always travel with their parent. A move inserts into
the destination before cutting from the source, so an interrupted move leaves a
duplicate rather than losing the task.

## Settings

Task tag, whether the tag must start the line, target heading, collection note,
excluded folders, schedule format and row action style. Under **Editing**, the two tagging
behaviours above and whether tagged tasks show the calendar icon on hover. Under **Periodic notes**, per-granularity folder and format
fallbacks, used only where Periodic Notes isn't supplying them.

## Performance

Tasks are parsed once into an in-memory index, then patched per file from the
metadata cache's `changed` event — which supplies the new content, so no re-read
is needed. Only files the cache already reports as containing checklist items
are read at startup. Blocks render from the index rather than rescanning the
vault, so adding more blocks costs very little.

## Known limits

- A blank line between a parent task and its subtasks ends the block; subtasks
  after a blank line will not travel with the parent.
- Block detection is by indentation, so any deeper-indented line beneath a task
  moves with it, including non-task prose.
- Line lookup matches on task text, so two byte-identical task lines in one file
  could resolve to the wrong one.
- Scheduling stamps the parent line only; subtasks stay unannotated.
- Tag continuation doesn't extend ordered lists — enter there behaves normally.

## Development

```sh
npm install
npm run dev     # watch build
npm run build   # typecheck, then bundle to main.js
npm test        # run the test suites
```

`npm test` bundles each suite in `tests/` against a stub of the `obsidian`
module and runs it in node, covering the pure logic: task parsing, tagging, tag
continuation, path handling, periodic-note detection, date input and the
line-edit layer that writes to files. Anything needing a live app — rendering,
the settings tab, the date prompt, the metadata cache — has to be tried in
Obsidian.

Releases are cut by pushing a tag: the workflow in `.github/workflows/main.yml`
stamps the version into `manifest.json`, `versions.json` and `package.json`,
builds, and attaches `main.js`, `manifest.json` and `styles.css` to the release.

## License

MIT
