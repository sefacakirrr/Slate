/** app shell strings (English source): title bar, dialogs, toasts, empty states. */
export const app = {
  logoAlt: 'Slate logo',
  titleBar: {
    minimize: 'Minimize',
    maximize: 'Maximize',
    restore: 'Restore',
    close: 'Close',
  },
  emptyState: {
    heading: 'No vault selected',
    body: 'Choose a folder to use as your vault. Slate reads and writes Markdown files there.',
    chooseFolder: 'Choose Folder',
  },
  contentPane: {
    selectNote: 'Select a note to view it.',
    external: 'External',
    lockedHeading: 'This note is locked',
    lockedBody: 'Enter the vault password to view and edit it.',
    unlock: 'Unlock',
  },
  confirmDialog: {
    cancel: 'Cancel',
    confirm: 'Delete',
    discard: 'Discard',
  },
  unsavedClose: {
    title: 'Unsaved changes',
    message: '"{name}" has unsaved changes. Save before closing?',
    save: 'Save',
    discard: 'Discard',
  },
  quit: {
    title: 'Quit with unsaved changes?',
    message: {
      one: 'You have {count} unsaved note(s). Quit anyway?',
      other: 'You have {count} unsaved note(s). Quit anyway?',
    },
    confirm: 'Quit',
  },
  saveConflict: {
    title: 'File changed on disk',
    message:
      '"{name}" was changed by another program since Slate last loaded it. Overwrite it with your version, or reload the version on disk and discard your edits?',
    overwrite: 'Overwrite',
    reload: 'Reload',
  },
  unlock: {
    cancel: 'Cancel',
    ariaSet: 'Set vault password',
    ariaUnlock: 'Unlock vault',
    headingSet: 'Set a vault password',
    headingUnlock: 'Unlock vault',
    introSet: 'This password encrypts the notes you lock. It is never stored.',
    introUnlock: 'Enter your vault password to open locked notes this session.',
    noRecoveryStrong: 'There is no recovery.',
    noRecoveryBody:
      'If you forget this password, the notes you lock with it are gone for good — no reset, no backdoor.',
    passwordPlaceholder: 'Vault password',
    confirmPlaceholder: 'Confirm password',
    hintPlaceholder: 'Password hint (optional)',
    mismatch: "Passwords don't match.",
    hintLabel: 'Hint:',
    acknowledge: 'I understand a forgotten password means my locked notes are unrecoverable.',
    working: 'Working…',
    setPassword: 'Set password',
    unlock: 'Unlock',
  },
  toast: {
    dismiss: 'Dismiss',
  },
}
