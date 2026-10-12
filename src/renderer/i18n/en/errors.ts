/** errors strings (English source). */
export const errors = {
  /** Vault IPC error codes (see `stores/vaultErrors.ts`). */
  vault: {
    fileExists: 'A note with that name already exists here.',
    folderExists: 'A folder with that name already exists here.',
    invalidName: 'Names can\'t contain < > : " / \\ | ? * or end with a dot or space.',
    invalidExtension: 'Notes must end in .md, .markdown or .txt.',
    cannotMoveIntoSelf: "A folder can't be moved into itself.",
    pathOutsideVault: 'That location is outside the vault.',
    noteLocked: 'This note is locked. Unlock the vault to open it.',
    vaultLocked: 'Unlock the vault first.',
    lockVerifyFailed: "Couldn't verify the encrypted copy. The note was left unlocked.",
    notFound: 'That item no longer exists.',
    unknown: 'Something went wrong ({code}).',
  },
  save: {
    failed: 'Couldn\'t save "{path}": {reason}',
  },
  lock: {
    lockUnsaved: 'Couldn\'t save the unsaved changes to "{path}", so it was not locked.',
    lockFailed: 'Couldn\'t lock "{path}": {reason}',
    unlockUnsaved: 'Couldn\'t save the unsaved changes to "{path}", so it was not unlocked.',
    unlockFailed: 'Couldn\'t unlock "{path}": {reason}',
    vaultLockUnsaved: 'Couldn\'t save the unsaved changes to "{path}"; the vault was not locked.',
    wrongPassword: 'Wrong password. Try again.',
  },
  /** Opening files from outside the vault (file manager, drag-and-drop). */
  openFiles: {
    notFound: 'file not found',
    notAFile: 'not a file',
    tooLarge: 'file is larger than 10 MB',
    binaryFile: 'looks like a binary file',
    unsupportedEncoding: 'not a UTF-8 text file',
    unsupportedType: 'only .md, .markdown and .txt files can be opened',
    notAllowed: 'access denied',
    unreadable: "couldn't be read",
    item: '"{name}": {reason}',
    failed: "Couldn't open {list}",
    droppedFailed: "Couldn't open the dropped files ({error})",
  },
}
