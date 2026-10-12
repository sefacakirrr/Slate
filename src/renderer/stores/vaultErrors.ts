import { type TKey, t } from '@renderer/i18n'

/**
 * User-facing text for the error codes the vault IPC layer throws (e.g.
 * `file-exists`). Unknown codes fall back to a generic sentence that still
 * carries the raw code, so nothing is ever swallowed. Translated at call time.
 */
const MESSAGE_KEYS: Record<string, TKey> = {
  'file-exists': 'errors.vault.fileExists',
  'folder-exists': 'errors.vault.folderExists',
  'invalid-name': 'errors.vault.invalidName',
  'invalid-extension': 'errors.vault.invalidExtension',
  'cannot-move-into-self': 'errors.vault.cannotMoveIntoSelf',
  'path-outside-vault': 'errors.vault.pathOutsideVault',
  'note-locked': 'errors.vault.noteLocked',
  'vault-locked': 'errors.vault.vaultLocked',
  'lock-verify-failed': 'errors.vault.lockVerifyFailed',
  'not-found': 'errors.vault.notFound',
}

export function describeVaultError(code: string): string {
  const key = Object.hasOwn(MESSAGE_KEYS, code) ? MESSAGE_KEYS[code] : undefined
  return key ? t(key) : t('errors.vault.unknown', { code })
}
