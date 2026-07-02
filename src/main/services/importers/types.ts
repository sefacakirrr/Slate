/**
 * Importer contract (Epic 15). Importers are pure conversion functions:
 * bytes/strings in, vault-ready notes and attachments out. All filesystem
 * work (reading sources, writing into the vault) lives in ImportService so
 * every importer is unit-testable without touching disk.
 */

/** A converted note, ready to be written into the vault. */
export type ImportedNote = {
  /** Target filename (no directories), always ending in a note extension. */
  name: string
  /** UTF-8 markdown content. */
  content: string
}

/** A binary attachment extracted from a source (e.g. images in a Notion zip). */
export type ImportedAttachment = {
  /** Vault-relative target path, always under `_attachments/`. */
  path: string
  data: Buffer
}

/** The output of a multi-file conversion (Notion zip). */
export type ConversionResult = {
  notes: ImportedNote[]
  attachments: ImportedAttachment[]
}
