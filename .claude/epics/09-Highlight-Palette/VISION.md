# Epic 09: Highlight Color Palette

> **Status**: Implementation
> **Created**: 2026-06-19
> **Baseline**: uncommitted

---

## 1. Summary

**Problem**: Kullanıcı önemli kısımları renklendirmek istiyor. Markdown'da standart bir highlight syntax yok ama `==text==` (mark) yaygın. Sabit 5 renk paleti yeterli — font/size değişikliği yok (vision non-goal).

**Vision**: Text seç → toolbar/shortcut ile 5 renkten birini seç → `==text=={.color}` syntax'ı ile highlight. CM6 inline decoration ile renk görünür. Renk kaldırma da mümkün.

**Key Deliverables**:
1. Highlight syntax: `==text=={.yellow}` (mark + attribute)
2. CM6 inline decoration — highlight renkleri görsel olarak render
3. Toolbar popup — text seçili iken renk seçimi
4. Keyboard shortcut — Ctrl+H → son kullanılan renk / toggle
5. Remove highlight — seçili highlight'ı kaldır

---

## 4. Success Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Text seçip renk seçince `==text=={.color}` eklenir | Editor'da yaz + seç + renk uygula |
| 2 | Highlight'lar editör'de renkli background ile görünür | Visual |
| 3 | 5 renk mevcut: yellow, green, blue, pink, orange | Palette popup'ta kontrol |
| 4 | Highlight kaldırılabilir (strip markers) | Seçili highlight'ta remove tıkla |
| 5 | Light ve dark mode'da renkler okunaklı | Her iki temada kontrol |
| 6 | `npm run check && typecheck && test && build` green | CI gate |

---

## 5. Scope

### In Scope
- `==text=={.color}` syntax (compatible with extended markdown mark)
- CM6 `MatchDecorator` or ViewPlugin for inline highlights
- Floating toolbar on text selection (only when text selected)
- 5 color options: yellow, green, blue, pink, orange
- Remove highlight action
- Dark + light mode contrast

### Out of Scope
- Custom colors beyond the 5-palette
- Highlight in quick-capture popup
- Export to HTML with highlight colors
- Highlight search/filter
