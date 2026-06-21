# Epic 06: Attachments

> **Status**: Planning
> **Created**: 2026-06-19
> **Baseline**: uncommitted (no commits yet in project)

---

## 1. Summary

**Problem**: Nota resim veya dosya eklemek için kullanıcı dosyayı elle kopyalayıp, yeniden adlandırıp, markdown link'ini elle yazmalı. Editörde resimler görünmüyor — saf markdown source mode deneyimi, copy-paste workflow'u kırık.

**Vision**: Clipboard'dan paste veya drag-and-drop ile herhangi bir dosya nota eklenebilir. Dosya `_attachments/<sha256>.<ext>` olarak vault'a yazılır, editöre uygun markdown link'i otomatik eklenir. Resimler editörde inline olarak render edilir (CM6 widget decoration). Non-image dosyalar clickable link olarak görünür.

**Key Deliverables**:
1. `AttachmentService` — hash-based file storage in `_attachments/`
2. IPC channel for binary data transfer (base64)
3. CM6 paste/drop extension — intercept clipboard and drag events
4. CM6 image widget decoration — inline image rendering in editor
5. File type detection and size validation

---

## 2. Exploration Findings

> Codebase exploration performed 2026-06-19 via /epic-create

### Relevant Components

- **VaultService** (`src/main/services/VaultService.ts`): Atomic write (temp→rename), `resolveSafe()` path traversal protection. `_attachments/` already excluded from `listNotes()` via `_` prefix rule. Only UTF-8 writes exist — no binary write method yet.
- **EditorHost** (`src/renderer/editor/EditorHost.tsx`): Single shared CM6 EditorView, reused across tabs by swapping EditorState. No DOM event handlers registered.
- **setup.ts** (`src/renderer/editor/setup.ts`): Extension configuration — `basicSetup`, custom theme, language, update listener, Mod-s keymap. No `domEventHandlers` extension.
- **IPC contract** (`src/shared/ipc.ts`): Typed invoke pattern. All data is JSON-serializable. Binary must go as base64 string.
- **Preload** (`src/preload/index.ts`): `contextBridge.exposeInMainWorld('api', api)` — typed wrapper over `ipcRenderer.invoke`.
- **crypto** (`node:crypto`): Already imported in VaultService (`randomBytes`). `createHash` available in same module.

### Current Implementation

- No attachment, paste, drop, or image handling code exists anywhere.
- `_attachments/` exclusion from file tree is tested and working.
- VaultService has no `writeBinary()` method — only `writeNote(relPath, content: string)`.
- EditorView ref is stored in `viewRef.current` (EditorHost.tsx:18) — accessible for dispatch.

### Gaps Identified

- No binary write capability in VaultService
- No DOM event interception in CM6 setup
- No programmatic text insertion pattern (no `view.dispatch()` usage beyond built-in)
- No widget decoration infrastructure for inline rendering
- No file-to-base64 conversion in renderer

### Patterns to Follow

- **Service pattern**: Class in `src/main/services/`, owns stateful resources, instantiated once in `main/index.ts`
- **Atomic writes**: Write to temp file → rename (VaultService pattern)
- **IPC registration**: Add to `shared/ipc.ts` types → `handlers.ts` → `preload/index.ts` → `renderer/api`
- **CM6 extensions**: Return `Extension` from factory function, add to `createTabState()` array

---

## 3. Architecture

### Current State

```
Renderer (paste/drop)     →  nothing happens
Editor (CM6)              →  text only, no widgets
VaultService              →  UTF-8 writes only
_attachments/             →  excluded from tree but no write path
```

### Target State

```
Renderer (paste/drop)
  → CM6 domEventHandlers extension intercepts event
  → Read File as ArrayBuffer → base64 encode
  → IPC invoke 'attachment:store' { data: base64, filename, ext }
  → Main: AttachmentService
      → decode base64 → Buffer
      → SHA-256 hash → filename
      → atomic write to _attachments/<hash>.<ext>
      → return { relativePath }
  → CM6 dispatch: insert ![alt](relativePath) or [name](relativePath)
  → CM6 image widget decoration detects ![...](...)
  → Renders <img> inline via Decoration.widget()
```

---

## 4. Success Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Paste screenshot from clipboard → image stored in `_attachments/` | File exists with correct hash name |
| 2 | Markdown image link auto-inserted at cursor position | Editor shows `![](relative/path)` |
| 3 | Image renders inline in editor (widget decoration) | Visual: image visible without switching to preview |
| 4 | Drop any file onto editor → stored and linked | Non-image: `[filename](path)` inserted |
| 5 | Duplicate paste → same hash, no duplicate file | Second paste reuses existing file |
| 6 | File size limit enforced (10MB) | Oversized file rejected with user feedback |
| 7 | Relative paths work across vault subdirectories | Link from `notes/deep/note.md` resolves to `../../_attachments/hash.ext` |
| 8 | `npm run check && typecheck && test && build` all green | CI gate |
| 9 | Image widget handles missing file gracefully | Broken image placeholder, no crash |

---

## 5. Scope

### In Scope

- AttachmentService in main process (hash, store, dedup)
- Binary write capability (Buffer → atomic file write)
- IPC channel: `attachment:store` (base64 in, relative path out)
- CM6 paste extension (clipboard images)
- CM6 drop extension (any file type)
- CM6 image widget decoration (inline `<img>` rendering)
- Relative path calculation (note location → attachment location)
- File size validation (10MB limit)
- Supported image types for inline render: png, jpg, jpeg, gif, webp, svg, bmp
- Non-image files: any extension accepted, stored and linked as `[filename](path)`
- Broken image placeholder when file is missing
- Deduplication via content hash (same content = same file, no duplicate storage)

### Out of Scope

- Orphan cleanup (unreferenced attachments) — future epic
- Attachment rename/move — unnecessary with hash-based naming
- Gallery view / attachment browser — future epic
- Image resize handles in editor — future epic
- Drag-to-reorder images — future epic
- Cloud sync — against project philosophy (local-first)
- Thumbnail generation — unnecessary complexity
- Video/audio inline playback — scope creep
- Attachment deletion UI — future (orphan cleanup prerequisite)

---

## 6. Risks & Open Questions

| Risk | Impact | Mitigation |
|------|--------|------------|
| CM6 widget performance with many images | Scroll jank, memory bloat | Lazy loading via IntersectionObserver, max render dimensions (cap at viewport width), virtualize off-screen widgets |
| Large base64 payloads over IPC | Memory spike during transfer | 10MB file limit. Consider streaming for future but base64 is fine for v1 at this scale |
| Relative path complexity | Links break when note is moved | Use vault-root-relative paths (`_attachments/hash.ext`) — consistent regardless of note depth |
| Hash collision (SHA-256) | Overwrites different file | Astronomically unlikely (2^128 birthday bound). Skip handling — not worth the code |
| Dynamic vault path | AttachmentService targets wrong dir | AttachmentService receives vault path from VaultService on each call (no cached path) |
| Widget decoration + undo/redo | Widget state out of sync after undo | Decorations are derived from doc content (stateless) — rebuilt on every doc change via ViewPlugin |

---

## 7. Design Decisions

1. **Hash-based naming over original filename**: Dedup is free, no filename collisions, no sanitization needed. Trade-off: human-unreadable filenames — acceptable since users interact via markdown links, not the filesystem.

2. **Vault-root-relative paths over note-relative**: `_attachments/hash.ext` instead of `../../_attachments/hash.ext`. Simpler, doesn't break on note move. The editor widget resolves the full path for rendering.

3. **Base64 over IPC instead of temp file**: Simpler implementation. 10MB limit means max ~13MB base64 string — well within Electron IPC capacity. No temp file cleanup needed.

4. **ViewPlugin over StateField for decorations**: Decorations are view-level (DOM rendering), not state-level. ViewPlugin rebuilds decorations on doc change — correct lifecycle, better performance.

5. **All file types accepted for storage**: No whitelist on what can be dropped. Only the inline rendering is image-specific. Everything else gets a file link.
