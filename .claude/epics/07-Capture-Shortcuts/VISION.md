# Epic 07: Capture & Shortcuts

> **Status**: Implementation
> **Created**: 2026-06-19
> **Baseline**: uncommitted

---

## 1. Summary

**Problem**: Hızlı not almak için Slate'i öne getirip yeni dosya oluşturup yazmak çok adım. Kullanıcı herhangi bir uygulamadayken anında not alabilmeli.

**Vision**: OS-level global hotkey (Ctrl+Shift+N) ile küçük popup pencere açılır, kullanıcı yazar, Ctrl+S/Enter ile kaydeder, pencere kapanır. Not vault'a düşer, main window sidebar'da otomatik görünür.

**Key Deliverables**:
1. WindowManager — main + quick-capture window lifecycle
2. ShortcutManager — globalShortcut register/unregister
3. Quick-capture popup UI — minimal editor + save
4. SettingsService hotkey field

---

## 4. Success Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Ctrl+Shift+N global hotkey opens popup when Slate is in background | Manual test — switch to another app, press hotkey |
| 2 | Popup has a minimal text area, save button, Escape to close | Visual verification |
| 3 | Type text + Ctrl+S → note saved as quick-YYYY-MM-DD-HHmmss.md | File appears in vault |
| 4 | After save, popup closes and main window sidebar shows new note | Sidebar updates |
| 5 | Escape closes popup without saving | No file created |
| 6 | `npm run check && typecheck && test && build` green | CI gate |

---

## 5. Scope

### In Scope
- WindowManager class managing main + capture window
- ShortcutManager with register/unregister/rebind
- Quick-capture popup window (small, frameless, always-on-top)
- Auto-close after save
- Escape to dismiss
- Default hotkey: Ctrl+Shift+N
- SettingsService stores hotkey preference

### Out of Scope
- Custom hotkey UI (E8 Settings)
- Rich editor in popup (just plain textarea)
- Templates for quick notes
- Quick-capture to specific folder
