# Epic 08: Settings UI & Theme

> **Status**: Implementation
> **Created**: 2026-06-19
> **Baseline**: uncommitted

---

## 1. Summary

**Problem**: Slate şu an dark-only, tema tercihi yok, ayarlar (vault path, hotkey) değiştirmek için ayrı bir UI yok. Daily driver olarak kullanmak için kullanıcı temel tercihleri ayarlayabilmeli.

**Vision**: Sidebar'da gear icon → Settings paneli açılır. Tema (dark/light/system), vault path değiştirme, quick-capture hotkey görüntüleme. Minimal, clean, işlevsel.

**Key Deliverables**:
1. Settings paneli UI (sidebar'dan erişim)
2. Dark/Light/System tema desteği (Tailwind dark: class strategy + OS prefers-color-scheme)
3. Theme persistence in SettingsService
4. Hotkey display in settings

---

## 4. Success Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Sidebar'da gear icon tıklanınca Settings paneli açılır | Visual |
| 2 | Tema dark/light/system seçilebilir, anında uygulanır | Toggle and observe |
| 3 | Tema tercihi persist, restart sonrası korunur | Kill + relaunch |
| 4 | Light mode'da tüm UI okunaklı (editor, sidebar, tabs, search) | Visual |
| 5 | Vault path gösterilir, "Change" ile değiştirilebilir | Click Change |
| 6 | `npm run check && typecheck && test && build` green | CI gate |

---

## 5. Scope

### In Scope
- Settings panel component (overlay/slide-in from sidebar)
- Theme toggle: dark / light / system
- Tailwind dark mode via class strategy (html.dark)
- CM6 editor theme switching (dark ↔ light)
- SettingsService: `theme` field persist
- Vault path display + change button
- Quick-capture hotkey display (read-only for now)

### Out of Scope
- Custom hotkey rebinding UI (M3)
- Font size / family settings (M3)
- Per-note settings
- Export/import settings
- Light mode for quick-capture popup (stays dark always)
