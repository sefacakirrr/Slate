import { api } from '@renderer/api'
import { CalendarPanel } from '@renderer/components/CalendarPanel'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { NotesList } from '@renderer/components/NotesList'
import { SettingsPanel } from '@renderer/components/SettingsPanel'
import { TrashPanel } from '@renderer/components/TrashPanel'
import { useT } from '@renderer/i18n'
import { useCalendarStore } from '@renderer/stores/calendarStore'
import { isLockedPath, useEncryptionStore } from '@renderer/stores/encryptionStore'
import { useNoticeStore } from '@renderer/stores/noticeStore'
import { useSearchStore } from '@renderer/stores/searchStore'
import { useTagsStore } from '@renderer/stores/tagsStore'
import { osTrash, useTrashStore } from '@renderer/stores/trashStore'
import { describeVaultError } from '@renderer/stores/vaultErrors'
import { useVaultStore } from '@renderer/stores/vaultStore'
import { runTabMove, useWorkspaceStore } from '@renderer/stores/workspaceStore'
import {
  Calendar,
  ChevronRight,
  File,
  FilePlus,
  FolderClosed,
  FolderOpen,
  FolderPlus,
  Hash,
  List,
  Lock,
  LockOpen,
  Pencil,
  Pin,
  RefreshCw,
  Settings,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

let _dragItem: { path: string; type: 'file' | 'folder' } | null = null

/**
 * Folders the user collapsed, by path. Module-level (not row state) so the
 * collapsed state survives the row remounting under a new path after a
 * folder rename/move — see {@link moveCollapsedFolders}.
 */
const collapsedFolders = new Set<string>()

/** Re-keys collapsed-folder entries from `from` (and below) to `to`. */
function moveCollapsedFolders(from: string, to: string): void {
  for (const p of [...collapsedFolders]) {
    if (p === from || p.startsWith(`${from}/`)) {
      collapsedFolders.delete(p)
      collapsedFolders.add(to + p.slice(from.length))
    }
  }
}

const NOTE_EXTENSIONS = ['.md', '.markdown', '.txt']

/** The trailing note extension of a leaf name (e.g. '.md'), or '' if none. */
function noteExt(name: string): string {
  const lower = name.toLowerCase()
  return NOTE_EXTENSIONS.find((ext) => lower.endsWith(ext)) ?? ''
}

/** Leaf name without its trailing note extension — for display and editing. */
function stripNoteExt(name: string): string {
  const ext = noteExt(name)
  return ext ? name.slice(0, -ext.length) : name
}

/** Display name for a leaf: strips the `.enc` lock suffix (if any) and the note extension. */
function leafDisplayName(name: string): string {
  return stripNoteExt(isLockedPath(name) ? name.slice(0, -'.enc'.length) : name)
}

/**
 * The trailing suffix to re-attach after a rename so the file keeps its identity:
 * the note extension, plus `.enc` for a locked note (e.g. `foo.md.enc` -> `.md.enc`).
 */
function leafSuffix(name: string): string {
  return isLockedPath(name) ? `${noteExt(name.slice(0, -'.enc'.length))}.enc` : noteExt(name)
}

type TreeNode = {
  name: string
  /** Full vault-relative path. For folders this is the folder path. */
  path: string
  /** Present and sorted (folders first) for directory nodes. */
  children?: TreeNode[]
}

/** The parent folder of a vault path ('' for root-level entries). */
function parentOf(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash === -1 ? '' : path.slice(0, slash)
}

/** The parent folder of a vault path with a trailing slash ('' for root-level entries). */
function parentPrefix(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash === -1 ? '' : path.slice(0, slash + 1)
}

/** Finds a folder node by its full path anywhere in the tree. */
function findFolderNode(nodes: TreeNode[], path: string): TreeNode | null {
  for (const n of nodes) {
    if (!n.children) continue
    if (n.path === path) return n
    const hit = findFolderNode(n.children, path)
    if (hit) return hit
  }
  return null
}

/** Builds a nested folder/file tree from note paths + known empty folder paths. */
function buildTree(
  paths: string[],
  knownFolders: string[] = [],
  noteOrder: Record<string, string[]> = {},
): TreeNode[] {
  const roots: TreeNode[] = []

  function upsertPath(allSegments: string[], isFolder: boolean): void {
    let level = roots
    let prefix = ''
    allSegments.forEach((name, i) => {
      prefix = prefix ? `${prefix}/${name}` : name
      const isLeaf = i === allSegments.length - 1
      let node = level.find(
        (n) =>
          n.name === name &&
          (isLeaf && !isFolder ? n.children === undefined : n.children !== undefined),
      )
      if (!node) {
        node = isLeaf && !isFolder ? { name, path: prefix } : { name, path: prefix, children: [] }
        level.push(node)
      }
      if (node.children) level = node.children
    })
  }

  for (const folderPath of knownFolders) {
    upsertPath(folderPath.split('/'), true)
  }

  for (const filePath of paths) {
    upsertPath(filePath.split('/'), false)
  }

  sortLevel(roots, '', noteOrder)
  return roots
}

/**
 * Folders before files, folders alphabetical (case-insensitive). Files follow
 * the level's custom order when one exists (drag-to-reorder); names not in the
 * list — new/renamed notes — sort alphabetically after the ordered ones.
 */
function sortLevel(nodes: TreeNode[], folder: string, noteOrder: Record<string, string[]>): void {
  const custom = noteOrder[folder]
  const pos = new Map<string, number>()
  if (custom) {
    custom.forEach((name, i) => {
      pos.set(name, i)
    })
  }

  nodes.sort((a, b) => {
    const aDir = Boolean(a.children)
    const bDir = Boolean(b.children)
    if (aDir !== bDir) return aDir ? -1 : 1
    if (!aDir) {
      const ai = pos.get(a.name)
      const bi = pos.get(b.name)
      if (ai !== undefined && bi !== undefined) return ai - bi
      if (ai !== undefined) return -1
      if (bi !== undefined) return 1
    }
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  })
  for (const n of nodes) if (n.children) sortLevel(n.children, n.path, noteOrder)
}

/** Inline validation message under a sidebar name input. */
function FieldError({ code }: { code: string | null }) {
  if (code === null) return null
  return (
    <p role="alert" className="mt-0.5 px-0.5 text-[11px] leading-snug text-red-400">
      {describeVaultError(code)}
    </p>
  )
}

function TreeRow({
  node,
  depth,
  onRequestDelete,
  onRequestDeleteFolder,
  onCreateNoteIn,
  onCreateFolderIn,
  onDropOnFolder,
  onReorder,
  onRenameFolder,
}: {
  node: TreeNode
  depth: number
  onRequestDelete: (path: string) => void
  onRequestDeleteFolder: (path: string) => void
  /** Resolves an error code, or null on success. */
  onCreateNoteIn: (folderPath: string, name?: string) => Promise<string | null>
  /** Resolves an error code, or null on success. */
  onCreateFolderIn: (fullPath: string) => Promise<string | null>
  onDropOnFolder: (folderPath: string) => void
  /** Drop a same-folder file above/below this node (drag-to-reorder). */
  onReorder: (dragged: string, target: string, position: 'above' | 'below') => void
  /** Renames a folder (same parent). Resolves an error code, or null on success. */
  onRenameFolder: (from: string, to: string) => Promise<string | null>
}) {
  const t = useT()
  const activeTabPath = useWorkspaceStore((s) => s.activeTabPath)
  const openTab = useWorkspaceStore((s) => s.openTab)
  const renameTab = useWorkspaceStore((s) => s.renameTab)
  const renameNote = useVaultStore((s) => s.renameNote)
  const openLocked = useEncryptionStore((s) => s.openLocked)
  const lockNoteAction = useEncryptionStore((s) => s.lockNote)
  const unlockNoteAction = useEncryptionStore((s) => s.unlockNote)
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(leafDisplayName(node.name))
  const [renameError, setRenameError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(() => !collapsedFolders.has(node.path))
  const [creatingChild, setCreatingChild] = useState<'note' | 'folder' | null>(null)
  const [childName, setChildName] = useState('')
  const [childError, setChildError] = useState<string | null>(null)
  const [isDropTarget, setIsDropTarget] = useState(false)
  /** Reorder indicator while a same-folder file hovers this row (Epic sidebar order). */
  const [reorderHint, setReorderHint] = useState<'above' | 'below' | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const childInputRef = useRef<HTMLInputElement>(null)
  const pad = { paddingLeft: `${depth * 12 + 8}px` }
  const childPad = { paddingLeft: `${(depth + 1) * 12 + 8}px` }

  useEffect(() => {
    if (renaming) inputRef.current?.select()
  }, [renaming])

  const isFolder = node.children !== undefined
  useEffect(() => {
    if (!isFolder) return
    if (expanded) collapsedFolders.delete(node.path)
    else collapsedFolders.add(node.path)
  }, [isFolder, expanded, node.path])

  useEffect(() => {
    if (creatingChild) {
      setChildName('')
      setChildError(null)
      childInputRef.current?.focus()
    }
  }, [creatingChild])

  const startRename = () => {
    setDraftName(node.children ? node.name : leafDisplayName(node.name))
    setRenameError(null)
    setRenaming(true)
  }
  const cancelRename = () => {
    setRenaming(false)
    setRenameError(null)
  }
  const commitRename = async () => {
    const name = draftName.trim()
    if (name === '' || name === leafDisplayName(node.name)) {
      cancelRename()
      return
    }
    // Keep the file in its current folder; only the leaf name changes.
    const slash = node.path.lastIndexOf('/')
    const parent = slash === -1 ? '' : node.path.slice(0, slash + 1)
    // The user edits the bare name; re-attach the trailing suffix so the rename
    // is valid. Locked notes keep their full `.<ext>.enc` suffix; plaintext notes
    // preserve their extension (or let the user type one), defaulting to `.md`.
    const to = isLockedPath(node.path)
      ? parent + name + leafSuffix(node.name)
      : parent + name + (noteExt(name) ? '' : noteExt(node.name) || '.md')
    // Saves wait while the file moves, then follow the re-pointed tab.
    const err = await runTabMove(async () => {
      const e = await renameNote(node.path, to)
      // Keep any open tab pointing at the renamed note.
      if (e === null) renameTab(node.path, to)
      return e
    })
    if (err !== null) {
      // Stay in edit mode so the user can fix it (e.g. bad extension / clash).
      setRenameError(err)
      inputRef.current?.select()
      return
    }
    setRenaming(false)
    setRenameError(null)
  }

  const commitFolderRename = async () => {
    const name = draftName.trim()
    if (name === '' || name === node.name) {
      cancelRename()
      return
    }
    // A rename keeps the folder where it is; a slash would move it instead.
    const err = /[/\\]/.test(name)
      ? 'invalid-name'
      : await onRenameFolder(node.path, parentPrefix(node.path) + name)
    if (err !== null) {
      setRenameError(err)
      inputRef.current?.select()
      return
    }
    setRenaming(false)
    setRenameError(null)
  }

  if (node.children) {
    const commitChild = async () => {
      const name = childName.trim()
      if (!name) {
        setCreatingChild(null)
        return
      }
      const err =
        creatingChild === 'folder'
          ? await onCreateFolderIn(`${node.path}/${name}`)
          : await onCreateNoteIn(node.path, name)
      if (err !== null) {
        // Keep editing so the user can fix the name.
        setChildError(err)
        childInputRef.current?.select()
        return
      }
      setCreatingChild(null)
    }

    const handleFolderDragOver = (e: React.DragEvent) => {
      e.stopPropagation()
      if (!_dragItem || _dragItem.path === node.path) return
      if (_dragItem.type === 'folder' && node.path.startsWith(`${_dragItem.path}/`)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setIsDropTarget(true)
    }

    return (
      <div
        className="min-w-0"
        draggable={!renaming}
        onDragStart={(e) => {
          _dragItem = { path: node.path, type: 'folder' }
          e.dataTransfer.effectAllowed = 'move'
          e.stopPropagation()
        }}
        onDragEnd={() => {
          _dragItem = null
          setIsDropTarget(false)
        }}
      >
        <div
          className={`group flex min-w-0 items-center overflow-hidden py-0.5 rounded transition-colors ${isDropTarget ? 'bg-accent-500/10 ring-1 ring-accent-400' : ''}`}
          style={pad}
          onDragOver={handleFolderDragOver}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDropTarget(false)
          }}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setIsDropTarget(false)
            onDropOnFolder(node.path)
          }}
        >
          {renaming ? (
            <input
              ref={inputRef}
              value={draftName}
              aria-label={t('sidebar.tree.newFolderName')}
              title={renameError ?? undefined}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void commitFolderRename()
                } else if (e.key === 'Escape') {
                  cancelRename()
                }
              }}
              onBlur={cancelRename}
              className={`my-px mr-1 min-w-0 flex-1 rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-100 outline outline-1 light:bg-slate-100 light:text-slate-900 ${
                renameError !== null
                  ? 'outline-red-500'
                  : 'outline-slate-600 light:outline-slate-300'
              }`}
            />
          ) : (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex min-w-0 flex-1 items-center gap-1 py-0.5 text-left text-xs font-medium text-slate-500 transition hover:text-slate-300 light:text-slate-400 light:hover:text-slate-700"
            >
              <ChevronRight
                className={`size-3 shrink-0 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
                aria-hidden="true"
              />
              {expanded ? (
                <FolderOpen
                  className="size-3.5 shrink-0 text-slate-400 light:text-slate-500"
                  aria-hidden="true"
                />
              ) : (
                <FolderClosed
                  className="size-3.5 shrink-0 text-slate-400 light:text-slate-500"
                  aria-hidden="true"
                />
              )}
              <span className="truncate">{node.name}</span>
            </button>
          )}
          <div
            className={`invisible flex shrink-0 items-center gap-0.5 pr-1 ${renaming ? '' : 'group-hover:visible'}`}
          >
            <button
              type="button"
              onClick={startRename}
              title={t('sidebar.tree.renameFolder')}
              className="rounded p-0.5 text-slate-500 transition hover:bg-slate-700 hover:text-slate-200 light:hover:bg-slate-200 light:hover:text-slate-700"
            >
              <Pencil className="size-3" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => {
                setExpanded(true)
                setCreatingChild('note')
              }}
              title={t('sidebar.tree.newNoteHere')}
              className="rounded p-0.5 text-slate-500 transition hover:bg-slate-700 hover:text-slate-200 light:hover:bg-slate-200 light:hover:text-slate-700"
            >
              <FilePlus className="size-3" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => {
                setExpanded(true)
                setCreatingChild('folder')
              }}
              title={t('sidebar.tree.newSubfolder')}
              className="rounded p-0.5 text-slate-500 transition hover:bg-slate-700 hover:text-slate-200 light:hover:bg-slate-200 light:hover:text-slate-700"
            >
              <FolderPlus className="size-3" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onRequestDeleteFolder(node.path)}
              title={t('sidebar.tree.deleteFolder')}
              className="rounded p-0.5 text-slate-500 transition hover:bg-slate-700 hover:text-red-400 light:hover:bg-slate-200"
            >
              <Trash2 className="size-3" aria-hidden="true" />
            </button>
          </div>
        </div>

        {renaming && (
          <div style={pad}>
            <FieldError code={renameError} />
          </div>
        )}

        {expanded && (
          <>
            {creatingChild !== null && (
              <div className="flex items-center gap-1.5 py-1" style={childPad}>
                {creatingChild === 'folder' ? (
                  <FolderClosed className="size-3.5 shrink-0 text-slate-500" aria-hidden="true" />
                ) : (
                  <File className="size-3.5 shrink-0 text-slate-500" aria-hidden="true" />
                )}
                <input
                  ref={childInputRef}
                  value={childName}
                  placeholder={
                    creatingChild === 'folder'
                      ? t('sidebar.tree.folderNamePlaceholder')
                      : t('sidebar.tree.noteNamePlaceholder')
                  }
                  onChange={(e) => setChildName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void commitChild()
                    } else if (e.key === 'Escape') setCreatingChild(null)
                  }}
                  onBlur={() => setCreatingChild(null)}
                  className={`min-w-0 flex-1 rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-100 outline outline-1 light:bg-slate-100 light:text-slate-900 ${
                    childError !== null
                      ? 'outline-red-500'
                      : 'outline-slate-600 light:outline-slate-300'
                  }`}
                />
              </div>
            )}
            {creatingChild !== null && (
              <div style={childPad}>
                <FieldError code={childError} />
              </div>
            )}
            {node.children.map((child) => (
              <TreeRow
                key={child.path}
                node={child}
                depth={depth + 1}
                onRequestDelete={onRequestDelete}
                onRequestDeleteFolder={onRequestDeleteFolder}
                onCreateNoteIn={onCreateNoteIn}
                onCreateFolderIn={onCreateFolderIn}
                onDropOnFolder={onDropOnFolder}
                onReorder={onReorder}
                onRenameFolder={onRenameFolder}
              />
            ))}
          </>
        )}
      </div>
    )
  }

  if (renaming) {
    return (
      <div className="flex flex-col py-1" style={pad}>
        <input
          ref={inputRef}
          value={draftName}
          aria-label={t('sidebar.tree.newNoteName')}
          title={renameError ?? undefined}
          onChange={(e) => setDraftName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void commitRename()
            } else if (e.key === 'Escape') {
              cancelRename()
            }
          }}
          onBlur={cancelRename}
          className={`min-w-0 flex-1 rounded bg-slate-800 px-1.5 py-0.5 text-sm text-slate-100 outline outline-1 light:bg-slate-100 light:text-slate-900 ${
            renameError !== null ? 'outline-red-500' : 'outline-slate-600 light:outline-slate-300'
          }`}
        />
        <FieldError code={renameError} />
      </div>
    )
  }

  const selected = activeTabPath === node.path
  const locked = isLockedPath(node.path)
  const label = leafDisplayName(node.name)
  // A same-folder file dragged over this row reorders (above/below by pointer
  // half); anything else falls through to the folder-move handlers upstream.
  const isReorderDrag = () =>
    _dragItem !== null &&
    _dragItem.type === 'file' &&
    _dragItem.path !== node.path &&
    parentOf(_dragItem.path) === parentOf(node.path)
  return (
    <div
      draggable
      onDragStart={(e) => {
        _dragItem = { path: node.path, type: 'file' }
        e.dataTransfer.effectAllowed = 'move'
        e.stopPropagation()
      }}
      onDragEnd={() => {
        _dragItem = null
        setReorderHint(null)
      }}
      onDragOver={(e) => {
        if (!isReorderDrag()) return
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
        const rect = e.currentTarget.getBoundingClientRect()
        setReorderHint(e.clientY < rect.top + rect.height / 2 ? 'above' : 'below')
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setReorderHint(null)
      }}
      onDrop={(e) => {
        const dragged = _dragItem?.path
        if (dragged === undefined || !isReorderDrag() || reorderHint === null) return
        e.preventDefault()
        e.stopPropagation()
        _dragItem = null
        onReorder(dragged, node.path, reorderHint)
        setReorderHint(null)
      }}
      className={`group relative flex min-w-0 items-center overflow-hidden border-l-2 transition-colors ${
        selected
          ? 'border-accent-500 bg-accent-500/10'
          : 'border-transparent hover:bg-slate-800/60 light:hover:bg-slate-100'
      }`}
    >
      {reorderHint !== null && (
        <div
          className={`pointer-events-none absolute inset-x-1 h-0.5 rounded bg-accent-400 ${
            reorderHint === 'above' ? 'top-0' : 'bottom-0'
          }`}
        />
      )}
      <button
        type="button"
        onClick={() => (locked ? openLocked(node.path) : openTab(node.path))}
        style={pad}
        className={`flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden py-1 text-left text-sm transition ${
          selected
            ? 'font-medium text-slate-50 light:text-slate-900'
            : 'text-slate-300 group-hover:text-slate-100 light:text-slate-600 light:group-hover:text-slate-900'
        }`}
      >
        {locked ? (
          <Lock
            className={`size-3.5 shrink-0 ${selected ? 'text-accent-400' : 'text-amber-500/80 light:text-amber-600'}`}
            aria-label={t('sidebar.tree.locked')}
          />
        ) : (
          <File
            className={`size-3.5 shrink-0 ${selected ? 'text-accent-400' : 'text-slate-500 light:text-slate-400'}`}
            aria-hidden="true"
          />
        )}
        <span className="truncate">{label}</span>
      </button>
      {/* Pin as a desktop sticky (Epic 11). Locked notes can't be stickies in v1. */}
      {!locked && (
        <button
          type="button"
          onClick={() => window.api.window.sticky.open(node.path)}
          title={t('sidebar.tree.pinAsSticky')}
          className="invisible rounded p-1 text-slate-500 transition hover:bg-slate-700 hover:text-accent-300 group-hover:visible light:hover:bg-slate-200 light:hover:text-slate-700"
        >
          <Pin className="size-3.5" aria-hidden="true" />
          <span className="sr-only">{t('sidebar.tree.pinLabel', { label })}</span>
        </button>
      )}
      {/* Rename works for locked notes too: it's a filesystem rename that keeps the
          `.<ext>.enc` suffix and needs no decryption (works even while locked). */}
      <button
        type="button"
        onClick={startRename}
        title={t('sidebar.tree.renameNote')}
        className="invisible rounded p-1 text-slate-500 transition hover:bg-slate-700 hover:text-slate-200 group-hover:visible light:hover:bg-slate-200 light:hover:text-slate-700"
      >
        <Pencil className="size-3.5" aria-hidden="true" />
        <span className="sr-only">{t('sidebar.tree.renameLabel', { label })}</span>
      </button>
      {locked ? (
        <button
          type="button"
          onClick={() => unlockNoteAction(node.path)}
          title={t('sidebar.tree.unlockNote')}
          className="invisible rounded p-1 text-slate-500 transition hover:bg-slate-700 hover:text-amber-400 group-hover:visible light:hover:bg-slate-200"
        >
          <LockOpen className="size-3.5" aria-hidden="true" />
          <span className="sr-only">{t('sidebar.tree.unlockLabel', { label })}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => lockNoteAction(node.path)}
          title={t('sidebar.tree.lockNote')}
          className="invisible rounded p-1 text-slate-500 transition hover:bg-slate-700 hover:text-amber-400 group-hover:visible light:hover:bg-slate-200"
        >
          <Lock className="size-3.5" aria-hidden="true" />
          <span className="sr-only">{t('sidebar.tree.lockLabel', { label })}</span>
        </button>
      )}
      <button
        type="button"
        onClick={() => onRequestDelete(node.path)}
        title={t('sidebar.tree.deleteNote')}
        className="invisible mr-1 rounded p-1 text-slate-500 transition hover:bg-slate-700 hover:text-red-400 group-hover:visible light:hover:bg-slate-200"
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
        <span className="sr-only">{t('sidebar.tree.deleteLabel', { label })}</span>
      </button>
    </div>
  )
}

const MAX_VISIBLE_TAGS = 50

function TagsSection() {
  const t = useT()
  const tags = useTagsStore((s) => s.tags)
  const expanded = useTagsStore((s) => s.expanded)
  const setExpanded = useTagsStore((s) => s.setExpanded)
  const showTagResults = useSearchStore((s) => s.showTagResults)

  const visible = expanded ? tags : tags.slice(0, MAX_VISIBLE_TAGS)
  const hasMore = tags.length > MAX_VISIBLE_TAGS && !expanded

  const handleTagClick = async (tagName: string) => {
    const result = await api.tags.notesForTag(tagName)
    if (result.ok) {
      showTagResults(tagName, result.data)
    }
  }

  if (tags.length === 0) return null

  return (
    <div className="shrink-0 border-t border-slate-800 light:border-slate-200">
      <div className="px-3 pt-2 pb-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 light:text-slate-400">
          {t('sidebar.tags.title')}
        </span>
      </div>
      <div className="max-h-32 overflow-y-auto overflow-x-hidden px-2 pb-2">
        <div className="flex flex-wrap gap-1">
          {visible.map((tag) => (
            <button
              key={tag.name}
              type="button"
              onClick={() => void handleTagClick(tag.name)}
              className="inline-flex items-center gap-1 rounded-md bg-slate-800/70 px-2 py-0.5 text-xs text-slate-300 transition hover:bg-accent-600/30 hover:text-accent-200 light:bg-slate-100 light:text-slate-600 light:hover:bg-accent-100/50 light:hover:text-accent-700"
            >
              <Hash className="size-3 text-slate-500 light:text-slate-400" aria-hidden="true" />
              <span>{tag.name}</span>
              <span className="text-slate-500 light:text-slate-400">{tag.count}</span>
            </button>
          ))}
        </div>
        {hasMore && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mt-1.5 text-xs text-slate-500 transition hover:text-slate-300 light:text-slate-400 light:hover:text-slate-600"
          >
            {t('sidebar.tags.showAll', { count: tags.length - MAX_VISIBLE_TAGS })}
          </button>
        )}
      </div>
    </div>
  )
}

export function Sidebar() {
  const t = useT()
  const fileList = useVaultStore((s) => s.fileList)
  const folderList = useVaultStore((s) => s.folderList)
  const treeLoading = useVaultStore((s) => s.treeLoading)
  const loadFiles = useVaultStore((s) => s.loadFiles)
  const createNote = useVaultStore((s) => s.createNote)
  const createFolder = useVaultStore((s) => s.createFolder)
  const moveFolder = useVaultStore((s) => s.moveFolder)
  const deleteNote = useVaultStore((s) => s.deleteNote)
  const deleteFolder = useVaultStore((s) => s.deleteFolder)
  const renameNote = useVaultStore((s) => s.renameNote)
  const pickAndSetVault = useVaultStore((s) => s.pickAndSetVault)
  const openTab = useWorkspaceStore((s) => s.openTab)
  const removeTab = useWorkspaceStore((s) => s.removeTab)
  const renameTab = useWorkspaceStore((s) => s.renameTab)
  const closeFolderTabs = useWorkspaceStore((s) => s.closeFolderTabs)
  const renameFolderTabs = useWorkspaceStore((s) => s.renameFolderTabs)
  const saveTabsUnder = useWorkspaceStore((s) => s.saveTabsUnder)
  const notify = useNoticeStore((s) => s.notify)
  const loadTags = useTagsStore((s) => s.loadTags)
  const noteOrder = useVaultStore((s) => s.noteOrder)
  const loadNoteOrder = useVaultStore((s) => s.loadNoteOrder)
  const setLevelOrder = useVaultStore((s) => s.setLevelOrder)
  const calendarOpen = useCalendarStore((s) => s.calendarOpen)
  const toggleCalendar = useCalendarStore((s) => s.toggleCalendar)
  const trashOpen = useTrashStore((s) => s.trashOpen)
  const toggleTrash = useTrashStore((s) => s.toggleTrash)
  const tree = useMemo(
    () => buildTree(fileList, folderList, noteOrder),
    [fileList, folderList, noteOrder],
  )

  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [pendingDeleteFolder, setPendingDeleteFolder] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [viewMode, setViewMode] = useState<'tree' | 'list'>('tree')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [folderError, setFolderError] = useState<string | null>(null)
  const [creatingNote, setCreatingNote] = useState(false)
  const [newNoteName, setNewNoteName] = useState('')
  const [newNoteError, setNewNoteError] = useState<string | null>(null)
  const [rootDropTarget, setRootDropTarget] = useState(false)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const newNoteInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadTags()
    void loadNoteOrder()
  }, [loadTags, loadNoteOrder])

  useEffect(() => {
    if (creatingFolder) folderInputRef.current?.focus()
  }, [creatingFolder])

  useEffect(() => {
    if (creatingNote) newNoteInputRef.current?.focus()
  }, [creatingNote])

  const startCreateNote = () => {
    setCreatingFolder(false)
    setNewNoteName('')
    setNewNoteError(null)
    setCreatingNote(true)
  }

  const cancelCreateNote = () => {
    setCreatingNote(false)
    setNewNoteError(null)
  }

  const commitCreateNote = async () => {
    const name = newNoteName.trim()
    if (!name) {
      cancelCreateNote()
      return
    }
    const filename = noteExt(name) ? name : `${name}.md`
    let error = 'unknown'
    const path = await createNote(filename, (code) => {
      error = code
    })
    if (path === null) {
      // Name clash or invalid name — keep editing so the user can pick another.
      setNewNoteError(error)
      newNoteInputRef.current?.select()
      return
    }
    setCreatingNote(false)
    setNewNoteError(null)
    await openTab(path)
  }

  const startCreateFolder = () => {
    setCreatingNote(false)
    setFolderName('')
    setFolderError(null)
    setCreatingFolder(true)
  }

  const cancelCreateFolder = () => {
    setCreatingFolder(false)
    setFolderError(null)
  }

  const commitCreateFolder = async () => {
    const name = folderName.trim()
    if (!name) {
      cancelCreateFolder()
      return
    }
    const err = await createFolder(name)
    if (err !== null) {
      setFolderError(err)
      folderInputRef.current?.select()
      return
    }
    setCreatingFolder(false)
    setFolderError(null)
  }

  const confirmDelete = async () => {
    if (pendingDelete === null) return
    const path = pendingDelete
    setPendingDelete(null)
    // Save unsaved edits first: the trashed copy (Undo / Trash view) then holds them.
    if (!(await saveTabsUnder(path))) {
      notify(t('sidebar.notices.saveBeforeDeleteNote', { path }))
      return
    }
    if (!(await deleteNote(path))) return
    removeTab(path)
    void loadTags()
  }

  const confirmDeleteFolder = async () => {
    if (pendingDeleteFolder === null) return
    const path = pendingDeleteFolder
    setPendingDeleteFolder(null)
    if (!(await saveTabsUnder(path))) {
      notify(t('sidebar.notices.saveBeforeDeleteFolder', { path }))
      return
    }
    if (!(await deleteFolder(path))) return
    closeFolderTabs(path)
    void loadTags()
  }

  const handleCreateNoteIn = async (folderPath: string, name?: string) => {
    const filename = name ?? `untitled-${Date.now()}.md`
    const noteName = noteExt(filename) ? filename : `${filename}.md`
    let error: string | null = null
    const path = await createNote(`${folderPath}/${noteName}`, (code) => {
      error = code
    })
    if (path === null) return error ?? 'unknown'
    await openTab(path)
    return null
  }

  const handleCreateFolderIn = (fullPath: string) => createFolder(fullPath)

  /**
   * Reorders a file within its folder (drag onto a sibling's top/bottom half).
   * The full display order of that level's files — as currently rendered — is
   * captured with the dragged name spliced in, then persisted, so the first
   * ever reorder freezes the alphabetical order into an explicit one.
   */
  const handleReorder = (dragged: string, target: string, position: 'above' | 'below') => {
    const folder = parentOf(target)
    // Current visual order of files at this level (folders sort separately).
    const level = folder === '' ? tree : findFolderNode(tree, folder)?.children
    if (!level) return
    const files = level.filter((n) => !n.children).map((n) => n.name)
    const draggedName = dragged.slice(dragged.lastIndexOf('/') + 1)
    const targetName = target.slice(target.lastIndexOf('/') + 1)

    const without = files.filter((n) => n !== draggedName)
    const at = without.indexOf(targetName)
    if (at === -1) return
    without.splice(position === 'above' ? at : at + 1, 0, draggedName)
    void setLevelOrder(folder, without)
  }

  const handleDrop = async (toFolder: string) => {
    const item = _dragItem
    _dragItem = null
    if (!item) return
    const name = item.path.split('/').pop()!
    const to = toFolder ? `${toFolder}/${name}` : name
    if (item.path === to) return
    if (item.type === 'file') {
      const err = await runTabMove(async () => {
        const e = await renameNote(item.path, to)
        if (e === null) renameTab(item.path, to)
        return e
      })
      if (err !== null)
        notify(t('sidebar.notices.moveFailed', { name, error: describeVaultError(err) }))
    } else {
      const err = await relocateFolder(item.path, to, true)
      if (err !== null)
        notify(t('sidebar.notices.moveFailed', { name, error: describeVaultError(err) }))
    }
  }

  /**
   * Moves/renames a folder. Open tabs under it (with their unsaved edits),
   * its collapsed state and its custom note order (main) follow the new path.
   * A drag-move updates the tree optimistically; an inline rename does not, so
   * its input (and inline error) survive a failed attempt.
   */
  const relocateFolder = (from: string, to: string, optimistic: boolean): Promise<string | null> =>
    runTabMove(async () => {
      // Before the tree update remounts the row under `to`.
      moveCollapsedFolders(from, to)
      const err = await moveFolder(from, to, { optimistic })
      if (err !== null) {
        moveCollapsedFolders(to, from)
        return err
      }
      renameFolderTabs(from, to)
      void loadNoteOrder()
      return null
    })

  const handleRenameFolder = (from: string, to: string) => relocateFolder(from, to, false)

  if (showSettings) {
    return (
      <aside
        aria-label={t('sidebar.header.label')}
        className="flex h-full min-w-0 flex-col overflow-hidden bg-slate-900 text-slate-300 light:bg-white light:text-slate-700"
      >
        <SettingsPanel onClose={() => setShowSettings(false)} />
      </aside>
    )
  }

  return (
    <aside
      aria-label={t('sidebar.header.label')}
      className="flex h-full min-w-0 flex-col overflow-hidden bg-slate-900 text-slate-300 light:bg-white light:text-slate-700"
    >
      <div className="flex items-center justify-between border-b border-slate-800 px-3 pt-3 pb-2 light:border-slate-200">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 light:text-slate-400">
          {trashOpen ? t('sidebar.header.trash') : t('sidebar.header.notes')}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={pickAndSetVault}
            title={t('sidebar.header.changeVault')}
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-800 hover:text-accent-300 light:text-slate-500 light:hover:bg-slate-100"
          >
            <FolderOpen className="size-3.5" aria-hidden="true" />
            <span className="sr-only">{t('sidebar.header.changeVault')}</span>
          </button>
          <button
            type="button"
            onClick={startCreateNote}
            title={t('sidebar.header.newNote')}
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-800 hover:text-accent-300 light:text-slate-500 light:hover:bg-slate-100"
          >
            <FilePlus className="size-3.5" aria-hidden="true" />
            <span className="sr-only">{t('sidebar.header.newNote')}</span>
          </button>
          <button
            type="button"
            onClick={startCreateFolder}
            title={t('sidebar.header.newFolder')}
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-800 hover:text-accent-300 light:text-slate-500 light:hover:bg-slate-100"
          >
            <FolderPlus className="size-3.5" aria-hidden="true" />
            <span className="sr-only">{t('sidebar.header.newFolder')}</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode(viewMode === 'tree' ? 'list' : 'tree')}
            title={
              viewMode === 'tree' ? t('sidebar.header.listView') : t('sidebar.header.treeView')
            }
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-800 hover:text-accent-300 light:text-slate-500 light:hover:bg-slate-100"
          >
            <List className="size-3.5" aria-hidden="true" />
            <span className="sr-only">
              {viewMode === 'tree' ? t('sidebar.header.listView') : t('sidebar.header.treeView')}
            </span>
          </button>
          <button
            type="button"
            onClick={toggleCalendar}
            title={t('sidebar.header.calendar')}
            className={`rounded-md p-1 transition ${calendarOpen ? 'bg-accent-600/20 text-accent-400' : 'text-slate-400 hover:bg-slate-800 hover:text-accent-300 light:text-slate-500 light:hover:bg-slate-100'}`}
          >
            <Calendar className="size-3.5" aria-hidden="true" />
            <span className="sr-only">{t('sidebar.header.calendar')}</span>
          </button>
          <button
            type="button"
            onClick={toggleTrash}
            title={t('sidebar.header.trash')}
            className={`rounded-md p-1 transition ${trashOpen ? 'bg-accent-600/20 text-accent-400' : 'text-slate-400 hover:bg-slate-800 hover:text-accent-300 light:text-slate-500 light:hover:bg-slate-100'}`}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            <span className="sr-only">{t('sidebar.header.trash')}</span>
          </button>
          <button
            type="button"
            onClick={loadFiles}
            disabled={treeLoading}
            title={t('sidebar.header.refresh')}
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-800 hover:text-accent-300 disabled:opacity-50 light:text-slate-500 light:hover:bg-slate-100"
          >
            <RefreshCw
              className={`size-3.5 ${treeLoading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span className="sr-only">{t('sidebar.header.refresh')}</span>
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-1">
        {trashOpen ? (
          <TrashPanel />
        ) : (
          <>
            {creatingNote && (
              <div className="flex items-center gap-1.5 px-2 py-1">
                <File className="size-3.5 shrink-0 text-slate-500" aria-hidden="true" />
                <input
                  ref={newNoteInputRef}
                  value={newNoteName}
                  aria-label={t('sidebar.tree.newNoteName')}
                  title={newNoteError ?? undefined}
                  onChange={(e) => setNewNoteName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void commitCreateNote()
                    } else if (e.key === 'Escape') {
                      cancelCreateNote()
                    }
                  }}
                  onBlur={cancelCreateNote}
                  placeholder={t('sidebar.tree.noteNamePlaceholder')}
                  className={`min-w-0 flex-1 rounded bg-slate-800 px-1.5 py-0.5 text-sm text-slate-100 placeholder-slate-500 outline outline-1 light:bg-slate-100 light:text-slate-900 light:placeholder-slate-400 ${
                    newNoteError !== null
                      ? 'outline-red-500'
                      : 'outline-slate-600 light:outline-slate-300'
                  }`}
                />
              </div>
            )}
            {creatingNote && (
              <div className="px-2">
                <FieldError code={newNoteError} />
              </div>
            )}
            {creatingFolder && (
              <div className="flex items-center gap-1.5 px-2 py-1">
                <FolderClosed className="size-3.5 shrink-0 text-slate-500" aria-hidden="true" />
                <input
                  ref={folderInputRef}
                  value={folderName}
                  aria-label={t('sidebar.tree.newFolderName')}
                  title={folderError ?? undefined}
                  onChange={(e) => setFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void commitCreateFolder()
                    } else if (e.key === 'Escape') {
                      cancelCreateFolder()
                    }
                  }}
                  onBlur={cancelCreateFolder}
                  placeholder={t('sidebar.tree.folderNamePlaceholder')}
                  className={`min-w-0 flex-1 rounded bg-slate-800 px-1.5 py-0.5 text-sm text-slate-100 placeholder-slate-500 outline outline-1 light:bg-slate-100 light:text-slate-900 light:placeholder-slate-400 ${
                    folderError !== null
                      ? 'outline-red-500'
                      : 'outline-slate-600 light:outline-slate-300'
                  }`}
                />
              </div>
            )}
            {creatingFolder && (
              <div className="px-2">
                <FieldError code={folderError} />
              </div>
            )}
            {viewMode === 'list' ? (
              <NotesList />
            ) : tree.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
                <p className="text-xs text-slate-500">
                  {treeLoading ? t('common.loading') : t('sidebar.tree.emptyVault')}
                </p>
                {!treeLoading && (
                  <button
                    type="button"
                    onClick={startCreateNote}
                    className="rounded-md bg-accent-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm shadow-accent-500/30 transition hover:bg-accent-500"
                  >
                    {t('sidebar.tree.createFirstNote')}
                  </button>
                )}
              </div>
            ) : (
              <>
                {tree.map((node) => (
                  <TreeRow
                    key={node.path}
                    node={node}
                    depth={0}
                    onRequestDelete={setPendingDelete}
                    onRequestDeleteFolder={setPendingDeleteFolder}
                    onCreateNoteIn={handleCreateNoteIn}
                    onCreateFolderIn={handleCreateFolderIn}
                    onDropOnFolder={handleDrop}
                    onReorder={handleReorder}
                    onRenameFolder={handleRenameFolder}
                  />
                ))}
                <div
                  className={`mx-1.5 mb-1 mt-0.5 rounded border border-dashed py-1 text-center text-[10px] transition-colors ${rootDropTarget ? 'border-accent-400 bg-accent-500/10 text-accent-400' : 'border-slate-800 text-slate-700 light:border-slate-300 light:text-slate-400'}`}
                  onDragOver={(e) => {
                    if (!_dragItem) return
                    e.preventDefault()
                    e.stopPropagation()
                    e.dataTransfer.dropEffect = 'move'
                    setRootDropTarget(true)
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setRootDropTarget(false)
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    setRootDropTarget(false)
                    void handleDrop('')
                  }}
                >
                  {t('sidebar.tree.dropToRoot')}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {calendarOpen && (
        <div className="shrink-0 border-t border-slate-800 light:border-slate-200">
          <div className="px-1 pt-2 pb-1">
            <CalendarPanel />
          </div>
        </div>
      )}

      <TagsSection />

      <div className="shrink-0 border-t border-slate-800 px-3 py-2 light:border-slate-200">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            title={t('sidebar.header.settings')}
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-accent-300 light:text-slate-500 light:hover:bg-slate-100"
          >
            <Settings className="size-4" aria-hidden="true" />
            <span className="sr-only">{t('sidebar.header.settings')}</span>
          </button>
          <div className="text-right">
            <p className="text-[11px] font-semibold text-slate-300 light:text-slate-600">
              {t('common.appName')}{' '}
              <span className="font-normal text-slate-400 light:text-slate-500">
                v{__APP_VERSION__}
              </span>
            </p>
            <p className="text-[10px] text-slate-400 light:text-slate-500">
              {t('sidebar.footer.createdBy')}
            </p>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t('sidebar.confirm.deleteNoteTitle')}
        message={t('sidebar.confirm.deleteNoteMessage', {
          name: pendingDelete ?? '',
          osTrashTo: osTrash('to'),
        })}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmDialog
        open={pendingDeleteFolder !== null}
        title={t('sidebar.confirm.deleteFolderTitle')}
        message={t('sidebar.confirm.deleteFolderMessage', {
          name: pendingDeleteFolder ?? '',
          osTrashTo: osTrash('to'),
        })}
        confirmLabel={t('common.delete')}
        confirmTone="danger"
        onConfirm={confirmDeleteFolder}
        onCancel={() => setPendingDeleteFolder(null)}
      />
    </aside>
  )
}
