# Project Vision: Slate

> **Status**: Inception
> **Created**: 2026-05-18
> **Skill**: /project-vision

## Problem

Notes get scattered across multiple tools. Code notes land in Sublime or VS Code. Life notes and todos end up in Notion or Coda. Switching between apps for "where did I put that snippet?" or "where did I write down that idea?" is constant friction. Existing options fail in different ways:

- **Notion / Coda** — cloud-bound, heavy, opinionated structure, slow to open, friction to capture.
- **Sublime / VS Code** — great for code, not built for prose or life notes, no unified note library, no quick-capture concept.
- **Obsidian / Logseq / Bear / others** — closer to the goal, but each carries its own assumptions (graph database, vault complexity, ecosystem plugins, opinionated formats).

The user wants one **personal**, **local**, **frictionless** place that handles code and life notes equally well — without cloud, without complexity, without thinking about where to save anything.

## Core Value Proposition

A unified, frictionless, local-first notes app for both code and life — fast, file-based, no cloud, no friction.

## Target Audience

- **Primary user**: the developer themselves — a programmer who takes both code notes (snippets, configs, dev context) and personal/life notes (todos, ideas, reminders to self) on a desktop computer.
- **Not optimized for**: teams, non-programmers, shared/collaborative use, mobile-first users.

## Scope

### What We're Building (v1)

- Desktop, single-user, local-first application
- Unified library — no per-save folder picker; notes live in one place on disk
- Notes stored as plain markdown files (portable, future-proof)
- WYSIWYG-style editing — markdown rendered inline as you type (Typora/Notion live-preview feel)
- Fixed palette of highlight colors (4–6 colors), no font/size customization
- Code blocks with syntax highlighting
- Image paste/drag-in and file attachments
- Global quick-capture hotkey (from anywhere on the OS)
- Full-text search across the entire library
- Folders + inline `#hashtag` tags for cross-cutting organization
- Tabbed editor (multiple notes open simultaneously)
- Dark mode

### What We're NOT Building

- No mobile, no web, no browser version
- No sync, no cloud
- No collaboration, sharing, or multiplayer
- No reminders or notifications
- No plugin system
- No AI integration
- No browser webclipper / extension
- No Word-style per-character font/size formatting
- No Tier-2 niceties in v1 (backlinks, templates, daily notes, outlines) — added only when concrete pain justifies them after dogfooding

## Success Criteria

- **Daily use over 3+ months**, replacing Notion/Sublime for note-taking.
- **Quick-capture under 5 seconds** from any context — keystroke to note saved.
- **Notes are portable markdown** that survive even if Slate is abandoned — readable by any other markdown editor.
- **Search returns results in under 2 seconds** across the entire library.

## Risks & Assumptions

- **Assumption**: a markdown + WYSIWYG editing experience (Typora-style live preview) is achievable using existing editor frameworks rather than writing a custom rich-text engine.
- **Risk**: scope creep from Tier-2 features (backlinks, templates, daily notes) being added pre-emptively before v1 is dogfooded and proven.
- **Risk**: the name "Slate" overlaps with a popular JavaScript rich-text editor framework. Not a v1 blocker since the project is personal, but may cause confusion if it ever goes public.

## Open Questions

None remaining at vision stage. Technology choices (desktop framework, editor library, search index, etc.) deferred to `/project-techstack`.
