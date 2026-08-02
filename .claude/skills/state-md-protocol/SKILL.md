---
name: state-md-protocol
description: Use after completing any meaningful task, fixing a bug, or finishing a phase.
---

## Always update STATE.md

After every completed task, bug fix, or phase milestone: update `STATE.md` at the project root.

No exceptions. This is the single source of truth between Claude sessions.

## Required sections

```markdown
# KenyonExpress State

## Current Phase
<phase name and one-line description>

## Last Completed
<what just finished -- be specific, include file names>

## In Progress
<what is currently being worked on, or "nothing">

## Blocking Issues
<exact error messages, file:line references, or "none">

## Next Task
<the single next thing to do>

## Working Directory
/Users/ofir/kenyonexpress-web/kenyonexpress

## Supabase Project URL
<project URL or "not set">
```

## When a task fails

Write the EXACT error message under Blocking Issues. Include:
- Error code (e.g. `ERROR: 23514`)
- Full detail line
- Which migration / file / line caused it

Example:
```
ERROR: 23514: new row for relation "profiles" violates check constraint "profiles_role_check"
DETAIL: Failing row contains (..., customer, ...)
CONTEXT: SQL statement in 003_rbac.sql DO block line 10
```

## History

Never delete previous entries. Append a dated section at the bottom when a phase completes:

```markdown
---
## History

### 2026-05-17 -- Phase 2 Auth complete
- Google OAuth + OTP working
- Migrations 001-004 applied to prod
```

## Read before answering

At the start of every session, read STATE.md before making any assumption about what phase we are in or what to do next. Never ask Ofir what the current state is -- read the file.
