/** settings strings (English source). */
export const settings = {
  title: 'Settings',
  theme: {
    heading: 'Theme',
    dark: 'Dark',
    light: 'Light',
    system: 'System',
  },
  colorTheme: {
    heading: 'Editor Color Theme',
    removeAria: 'Remove theme {name}',
    removeTitle: 'Remove imported theme',
    import: 'Import Theme (.json)',
    invalidFile: 'Invalid theme file. Check the JSON format.',
    parseError: 'Could not parse the file as JSON.',
    removeDialogTitle: 'Remove theme',
    removeDialogMessage: 'Remove the imported theme "{name}"? You can import it again later.',
    removeDialogConfirm: 'Remove',
  },
  backgroundImage: {
    heading: 'Background Image',
    change: 'Change Image',
    select: 'Select Image',
    remove: 'Remove',
    tooLarge:
      "This image is too large to be remembered — it's shown for now but will be gone after a restart. Pick a smaller image to keep it.",
    opacity: 'Opacity: {percent}%',
    reposition: 'Reposition',
  },
  vault: {
    heading: 'Vault',
    none: 'No vault selected',
    change: 'Change',
  },
  import: {
    heading: 'Import',
    description:
      'Bring notes from other apps: folders of .md/.txt/.html files or a Notion export zip. Originals are never modified.',
    button: 'Import notes',
  },
  editing: {
    heading: 'Editing',
    autoSave: 'Auto-save',
    autoSaveDescription:
      'Save the active note automatically after you stop typing. {mod}+S still saves immediately.',
    toggleAutoSave: 'Toggle auto-save',
    fontSize: 'Font size',
    fontSizeDescription: 'The editor and the whole interface scale to this size. {mod}+= / {mod}+-',
  },
  background: {
    heading: 'Background',
    launchAtLogin: 'Launch Slate at startup',
    launchAtLoginDescription:
      'Start in the tray when you sign in, so reminders fire without opening Slate.',
    closeToTray: 'Keep running in the tray when closed — reminders keep working',
    closeToTrayDescription:
      'Closing the window hides Slate to the tray. Use Quit Slate in the tray menu to exit.',
  },
  password: {
    heading: 'Vault Password',
    description:
      'Set a password to lock individual notes. It encrypts locked notes and is never stored — there is no recovery if you forget it.',
    set: 'Set vault password',
    unlocked: 'Vault unlocked this session',
    locked: 'Vault locked',
    lockNow: 'Lock vault now',
    unlock: 'Unlock vault',
  },
  shortcuts: {
    heading: 'Shortcuts',
    quickCapture: 'Quick Capture',
    search: 'Search',
  },
  maintenance: {
    heading: 'Maintenance',
    rebuilding: 'Rebuilding…',
    rebuild: 'Rebuild search index',
    done: 'Done',
    failed: 'Failed',
  },
  updates: {
    heading: 'Updates',
    currentVersion: 'Current version: v{version}',
    checking: 'Checking…',
    check: 'Check for updates',
    restartToUpdate: 'Restart to update',
    openReleases: 'Open Releases',
    upToDate: "You're up to date.",
    available: 'Version {version} is available.',
    availableDownloading: 'Version {version} is available — downloading…',
    downloading: 'Downloading… {percent}%',
    downloaded: 'Version {version} downloaded — restart to install.',
    whatsNew: "What's new",
    devDisabled: 'Updates are only available in the installed app.',
    error: 'Update check failed: {error}',
    silentNote: 'Updates are installed silently — no setup wizards. App restarts automatically.',
  },
  updateBar: {
    ready: 'Update ready — restart to apply',
    restartNow: 'Restart Now',
  },
  backgroundModal: {
    title: 'Adjust Background',
    apply: 'Apply',
    dragHint: 'Drag to reposition',
    scrollHint: 'Scroll to zoom',
    zoomOut: 'Zoom out',
    zoomIn: 'Zoom in',
    position: 'Position: {percent}%',
    reset: 'Reset',
  },
}
