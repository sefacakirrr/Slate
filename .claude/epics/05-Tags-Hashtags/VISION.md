# Epic 05: Tags & Hashtags

> **Status**: Planning
> **Created**: 2026-06-19
> **Baseline**: uncommitted (proje henüz commit'lenmedi)

---

## 1. Summary

**Problem**: Notlarda kullanılan `#hashtag`'ler hiçbir yere kaydedilmiyor. Kullanıcı vault'unda hangi tag'lerin olduğunu göremez, tag'e göre filtreleme yapamaz. Not sayısı arttıkça organizasyon tamamen dosya/klasör hiyerarşisine bağımlı kalıyor.

**Vision**: Not kaydedildiğinde (veya index rebuild sırasında) içerikteki `#tag` pattern'leri otomatik olarak çıkarılır, SQLite'a normalize şekilde kaydedilir. Sidebar'da tüm tag'ler sayılarıyla listelenir. Bir tag'e tıklamak, o tag'i içeren notları arama sonuçları olarak gösterir.

**Key Deliverables**:
1. Tag parse logic — `#tag` pattern'lerini content'ten güvenli şekilde çıkaran modül
2. SQLite schema genişlemesi — `tags` + `note_tags` junction tabloları
3. IndexService entegrasyonu — `indexNote` sırasında tag extraction + storage
4. IPC kanalları — `tags:list`, `tags:notesForTag`
5. Sidebar "Tags" bölümü — tag ismi + count listesi, tıklanabilir
6. Search entegrasyonu — tag tıklandığında filtreli sonuçlar

---

## 2. Exploration Findings

> Codebase exploration performed 2026-06-19 via /epic-create

### Relevant Components
- **IndexService** (`src/main/services/IndexService.ts`): SQLite FTS5 index. `indexNote(path, content, mtime)` tek ingestion noktası. Schema idempotent bootstrap. WAL + NORMAL pragmas.
- **SearchService** (`src/main/services/SearchService.ts`): FTS5 MATCH + snippet + rank. Query sanitization (quotes + prefix wildcard). Limit 50.
- **Reconcile** (`src/main/services/reconcile.ts`): Startup'ta disk vs index mtime karşılaştırması. Eksik/eski → reindex, orphan → remove.
- **Handlers** (`src/main/ipc/handlers.ts`): Best-effort index update pattern. `tryIndex()` wrapper.
- **Sidebar** (`src/renderer/components/Sidebar.tsx`): Dosya ağacı. `buildTree()` flat path → nested node. Şu an sadece dosya/klasör.
- **SearchPanel** (`src/renderer/components/SearchPanel.tsx`): `Ctrl+Shift+F`, debounced query, snippet highlight, click → openTab.
- **Shared types** (`src/shared/types.ts`): `SearchResult` type. "Tag" sadece bir comment'te geçiyor.

### Current Implementation
- Tag ile ilgili sıfır kod mevcut. `types.ts`'te `Tag` sadece planlanan type olarak yorum satırında geçiyor.
- `IndexService` schema'sı: `notes` (id, path, mtime, content) + `notes_fts` (external-content FTS5).
- Tüm mutation handler'ları `tryIndex` ile best-effort indexleme yapıyor.

### Gaps Identified
- Tag extraction logic yok
- `notes` tablosunda tag bilgisi yok
- Sidebar'da dosya ağacından başka section yok
- Search, tag-aware değil

### Patterns to Follow
- Schema değişiklikleri `bootstrap()` metoduna eklenir (idempotent `CREATE IF NOT EXISTS`)
- Yeni IPC kanalı: `shared/ipc.ts` type → `handlers.ts` implementation → `preload/index.ts` expose → `renderer/api` wrapper
- Zustand store per-domain (searchStore, vaultStore, workspaceStore pattern'i)
- Unit testler Vitest + `ELECTRON_RUN_AS_NODE=1` altında çalışır
- Best-effort: index hatası kullanıcı mutation'ını bloklamaz

---

## 3. Architecture

### Current State
```
Note save → vault:writeNote handler
         → VaultService.writeNote (disk)
         → tryIndex { IndexService.indexNote(path, content, mtime) }
                      ↓
                    notes table (path, mtime, content)
                      ↓ (trigger)
                    notes_fts (FTS5)
```

### Target State
```
Note save → vault:writeNote handler
         → VaultService.writeNote (disk)
         → tryIndex {
             IndexService.indexNote(path, content, mtime)
             IndexService.syncTags(noteId, extractTags(content))
           }
                      ↓
                    notes table (path, mtime, content)
                      ↓ (trigger)          ↓ (app logic)
                    notes_fts (FTS5)      note_tags ←→ tags
                                              ↓
                                         tags:list IPC → Sidebar Tags section
                                         tag click → search:queryByTag → SearchPanel results
```

---

## 4. Success Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Bir nota `#javascript` yazıp Ctrl+S → sidebar tag listesinde "javascript" görünür | UAT manual |
| 2 | Tag'e tıklama → o tag'i içeren tüm notlar listelenir | UAT manual |
| 3 | Not silinince tag count güncellenir; son notu silinen tag listeden kaybolur | UAT manual |
| 4 | Rename sonrası tag'ler korunur (content değişmedi) | Unit test |
| 5 | Kod bloğu içindeki `#include` tag olarak parse edilmez | Unit test |
| 6 | URL fragment (`example.com#section`) tag olarak parse edilmez | Unit test |
| 7 | Reconciliation sırasında tag'ler content'ten yeniden türetilir | Unit test |
| 8 | `tags:list` IPC 500 notluk vault'ta <100ms döner | Performance test (manual) |
| 9 | `npm run check && typecheck && test && build` yeşil | Automated gate |

---

## 5. Scope

### In Scope
- Tag parse: `#word` pattern'i (letter/digit/hyphen/underscore, letter ile başlar)
- Code fence içi exclusion (``` blokları atlanır)
- `tags` tablosu (id, name UNIQUE) + `note_tags` junction (note_id, tag_id)
- `IndexService` genişlemesi: `syncTags(noteId, tags[])` metodu
- `extractTags(content): string[]` — pure function, ayrı modül, unit testable
- IPC: `tags:list` → `{name: string, count: number}[]`
- IPC: `tags:notesForTag` → `string[]` (path listesi)
- Sidebar "Tags" section: tag listesi (isim + count), alfabetik sıralı
- Tag tıklama → search sonuçları olarak o tag'in notlarını göster
- Reconciliation: `reconcileIndex` tag'leri de sync eder (mevcut reindex zaten content'i yeniden işliyor)
- Tag'ler case-insensitive normalize edilir (`#JavaScript` → `javascript`)

### Out of Scope
- Tag rename / merge (global)
- Tag renkleri / ikonları
- Editörde tag autocomplete
- Çoklu tag filtre (AND/OR logic)
- YAML frontmatter'dan tag parse
- Tag'leri not dışından ekleme (detached tags)
- Inline tag highlight/decoration in editor

---

## 6. Risks & Open Questions

| Risk | Impact | Mitigation |
|------|--------|------------|
| False positive parse (C#, #include, URL fragment) | Kirli tag listesi, kullanıcı güveni düşer | Code fence exclusion + URL detection + min 2 char + must start with letter |
| Junction table overhead on save | Her save'de DELETE+INSERT batch | Diff-based sync: mevcut tag set ile yeni set karşılaştır, sadece delta uygula |
| Sidebar clutter (çok fazla tag) | UX kötüleşir | Başlangıçta max 50 tag göster (count'a göre sıralı), "Show all" expansion |
| Performance (500 not, her biri 5 tag = 2500 junction row) | Startup/query yavaşlar | SQLite bu ölçekte sorunsuz; index on note_tags(tag_id) |

---

## 7. Tag Parse Rules (Design Decision)

Bir `#` karakteri tag olarak kabul edilir eğer:

1. Satır başında veya whitespace/punctuation sonrasında gelir (kelime sınırı)
2. `#` sonrası en az 2 karakter (tek harf tag yok)
3. İlk karakter letter olmalı (rakamla başlamaz: `#123` tag değil)
4. Devam karakterleri: letter, digit, hyphen, underscore
5. Şunların İÇİNDE değilse: fenced code block (``` ... ```), inline code (`` ` ... ` ``), URL (`http://...#fragment`)

Case-insensitive normalize: `#JavaScript` ve `#javascript` aynı tag.

Max tag length: 64 karakter (fazlası truncate veya ignore).
