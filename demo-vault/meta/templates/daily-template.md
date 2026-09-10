---
tags:
  - daily
up:
  - "[[{{date:GGGG-[W]WW}}]]"
---

# {{date:YYYY-MM-DD}} — {{date:dddd}}

◀ [[{{yesterday}}]] | [[{{tomorrow}}]] ▶
Week: [[{{date:GGGG-[W]WW}}]] | Season: [[{{date:YYYY-[Q]Q}}]] | Year: [[{{date:YYYY}}]]

---

## Tasks

- [ ] #task

---

> [!todo]+ Today
>
> ```tasks
> not done
> (scheduled {{query.file.filenameWithoutExtension}} OR due {{query.file.filenameWithoutExtension}})
> hide scheduled date
> path does not include Periodic
> hide task count
> group by filename
> hide backlink
> ```

> [!tldr]- Rollover Inbox
>
> ```rollover
> mode: periodic
> ```

> [!warning]- Overdue
>
> ```tasks
> not done
> (scheduled before {{query.file.filenameWithoutExtension}} OR due before {{query.file.filenameWithoutExtension}})
> path does not include Periodic
> sort by scheduled
> hide scheduled date
> ```

> [!tldr]- Unscheduled & Long-Term Tasks
>
> ```rollover
> mode: collection
> title: Collection point
> ```
>
> ```rollover
> mode: unscheduled
> title: Unscheduled elsewhere in vault
> ```

> [!success]+ Completed Today
>
> ```tasks
> done on {{query.file.filenameWithoutExtension}}
> short mode
> hide scheduled date
> ```
