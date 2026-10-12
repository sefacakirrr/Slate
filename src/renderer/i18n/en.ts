import { app } from './en/app'
import { calendar } from './en/calendar'
import { capture } from './en/capture'
import { common } from './en/common'
import { editor } from './en/editor'
import { errors } from './en/errors'
import { importer } from './en/importer'
import { patchNotes } from './en/patchNotes'
import { settings } from './en/settings'
import { sidebar } from './en/sidebar'

/**
 * English — the source dictionary. Keys are grouped by UI area (one file per
 * area under `./en`); `tr` must mirror this shape exactly (a missing or extra
 * key is a compile error).
 */
export const en = {
  common,
  app,
  sidebar,
  settings,
  calendar,
  capture,
  importer,
  patchNotes,
  editor,
  errors,
}

export type Dict = typeof en
