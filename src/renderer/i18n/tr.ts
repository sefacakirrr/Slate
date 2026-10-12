import type { Dict } from './en'
import { app } from './tr/app'
import { calendar } from './tr/calendar'
import { capture } from './tr/capture'
import { common } from './tr/common'
import { editor } from './tr/editor'
import { errors } from './tr/errors'
import { importer } from './tr/importer'
import { patchNotes } from './tr/patchNotes'
import { settings } from './tr/settings'
import { sidebar } from './tr/sidebar'
import type { Shape } from './translate'

/** Turkish. Typed against the English source, so every key must be present. */
export const tr: Shape<Dict> = {
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
