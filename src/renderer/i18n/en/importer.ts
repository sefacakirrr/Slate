/**
 * importer strings (English source). In `found`, `imported` and `importedInto`,
 * `{count}` only picks the plural form; `{total}`, `{source}`, `{details}`,
 * `{skipped}` and `{folder}` are rendered as styled elements by the wizard.
 */
export const importer = {
  title: 'Import notes',
  pick: {
    intro:
      'Bring existing notes into Slate. Originals are never changed — files are copied into your vault.',
    folderTitle: 'Folder of notes',
    folderDescription:
      'Any text files — Markdown, .txt, HTML, RTF, code, extension-less notes. Subfolders are kept.',
    notionTitle: 'Notion export',
    notionDescription: '.zip from Notion\'s "Export" (Markdown & CSV format)',
    appleNotes:
      'Apple Notes? It has no bulk export — use a free tool like {exporter} (Mac App Store) to export your notes as Markdown or HTML files first, then import that folder here.',
    exporterName: 'Exporter',
  },
  scanning: 'Scanning source…',
  preview: {
    found: {
      one: 'Found {total} note in {source}{details}',
      other: 'Found {total} notes in {source}{details}',
    },
    importInto: 'Import into',
    vaultRoot: 'Vault root',
    importButton: { one: 'Import {count} note', other: 'Import {count} notes' },
  },
  counts: {
    notion: ' (Notion export).',
    list: ' ({list}).',
    none: '.',
    md: '{count} markdown',
    txt: '{count} text',
    html: '{count} HTML',
    rtf: '{count} RTF',
    other: '{count} other plain-text',
  },
  importing: 'Importing…',
  done: {
    imported: {
      one: "Imported {total} note{skipped}. They're indexed and searchable now.",
      other: "Imported {total} notes{skipped}. They're indexed and searchable now.",
    },
    importedInto: {
      one: "Imported {total} note{skipped} into {folder}. They're indexed and searchable now.",
      other: "Imported {total} notes{skipped} into {folder}. They're indexed and searchable now.",
    },
    skipped: ' ({count} skipped)',
  },
  error: {
    noNotes: 'No importable notes found in that source.',
    unsupported: 'That file type is not supported — pick a .zip export.',
    noVault: 'No vault is configured yet — choose a vault folder first.',
    failed: 'Import failed: {error}',
    tryAgain: 'Try again',
  },
}
