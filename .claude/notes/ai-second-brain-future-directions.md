# AI-Assisted Second Brain — Future Product Directions

Captured: 2026-06-13
Context: User brainstormed gaps in modern note apps + greenfield opportunities. **Parked** — to revisit only AFTER Slate's foundation is done. These are mostly AI-centric and **conflict with the locked PROJECT-VISION** (no AI, no cloud, local-first, markdown files on disk). Not added to the backlog (would pollute actionable, in-vision work). Pursue any of these only via `/project-revise`.

---

## Vision conflict (read first)

Slate today is deliberately: **local-first, no cloud, no AI, markdown files on disk.** Almost every idea below needs an LLM, embeddings/semantic search, or cloud — i.e. a different product tier ("AI second brain"), not an extension of the current one. The user explicitly deferred these; do NOT start any without a `/project-revise` that reopens the AI/cloud/storage decisions.

---

## The 9 gaps in current note apps

1. **Automatic organization.** User writes raw notes (Honda service campaign, Warzone DPI setting, English vocab, investment funds); system should auto-bucket into Software / Finance / Gaming / Language. People don't want to manually folder/tag/link/categorize. Unsolved today.
2. **Hidden relationships between notes.** 6 months of Kotlin/Android/Compose/API notes — system can't say *"you took 124 Android notes in 6 months; 40% are about Compose."* Stores but doesn't analyze.
3. **Personal second brain.** Apps don't know you, your goals, or your history. e.g. "I'll study English" → 3 weeks later "I'll study German" → system never flags *"you left the English goal half-done."*
4. **Voice notes unusable downstream.** Capture + transcribe exists, but no summary, no task creation, no project linking afterward.
5. **Knowledge evolution over time.** Investing views: 2024 "I don't know funds" → 2026 "I use money-market funds." No insight like *"your finance knowledge grew significantly over 2 years."*
6. **Natural-language querying.** "What notes did I take about Honda in the last 3 months?" / "Which Compose bugs did I solve?" — weak in most apps.
7. **Persistent AI memory.** ChatGPT-likes and note apps are separate worlds. Ideal: a system that knows your notes/projects/code/goals and that you can chat with.
8. **Developer knowledge memory (the big gap).** Code snippets, bug fixes, API examples, architecture decisions get stored, but nothing says *"you solved this bug 8 months ago in another project."* This space is largely empty.
9. **Passive vs active notes.** Today's apps are passive — you write and forget. Need a system that reminds, points out gaps, makes you repeat/learn: *"you haven't added Compose notes in 2 months."*

---

## The 7 greenfield opportunities (user's ranking)

1. AI-assisted second brain
2. Voice note → automatic project management
3. Knowledge memory for developers
4. Goal-tracking note system
5. AI that auto-links notes
6. Natural-language note querying
7. Personal growth & learning analytics

**User's strongest bet:** *AI-assisted developer second brain* — learns your past bug fixes, code snippets, project notes, and technical decisions, and surfaces them on demand. Potentially far more valuable than Notion / Apple Notes. (My read: this is the most defensible because it's a narrow, high-value niche where generic AI note apps are weak — but it still requires embeddings/LLM + a persistent index, i.e. an architecture change.)

---

## Non-AI footholds already on the Slate roadmap

These are *primitive, in-vision* versions of some gaps — already planned, no vision change needed:

| Gap | In-vision foothold | The "intelligent" version (needs AI — out of scope) |
|-----|--------------------|------------------------------------------------------|
| #1 organize | Tags/hashtags (E5), folders | Auto-categorization (ML) |
| #2 relationships | — | Topic clustering / analytics (embeddings) |
| #6 NL query | Full-text search (E4) | Semantic / natural-language query (LLM) |
| #8 dev memory | Search (E4) over code-block notes | "you solved this 8 months ago" (semantic recall) |
| #9 active | Quick-capture + reminders (E7, heuristic) | Adaptive spaced-repetition / gap detection (AI) |

So E4 (search), E5 (tags), E7 (capture/reminders) deliver the *manual/heuristic* slice. The leap to "intelligent" is where the vision changes.

---

## If/when revisited

- Decide the AI substrate first: **local model** (preserves local-first/no-cloud, heavier, weaker) vs **cloud LLM** (stronger, breaks no-cloud). This single choice reshapes the whole product and TECHSTACK.
- Embeddings + a vector index over the markdown corpus is the common substrate for #1, #2, #6, #8.
- Goal/evolution tracking (#3, #5, #9) needs structured metadata + time series over notes, not just text.
- Entry path: `/project-revise` on PROJECT-VISION (AI/cloud non-goals) → likely a new milestone, not an epic inside M1–M3.
