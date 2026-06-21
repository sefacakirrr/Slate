import { api } from '@renderer/api'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { NotesList } from '@renderer/components/NotesList'
import { SettingsPanel } from '@renderer/components/SettingsPanel'
import { useSearchStore } from '@renderer/stores/searchStore'
import { useTagsStore } from '@renderer/stores/tagsStore'
import { useVaultStore } from '@renderer/stores/vaultStore'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import {
  File,
  FilePlus,
  FolderClosed,
  FolderOpen,
  FolderPlus,
  Hash,
  List,
  Pencil,
  RefreshCw,
  Settings,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

type TreeNode = {
  name: string
  /** Full vault-relative path. For folders this is the folder path. */
  path: string
  /** Present and sorted (folders first) for directory nodes. */
  children?: TreeNode[]
}

/** Builds a nested folder/file tree from a flat, sorted list of relative paths. */
function buildTree(paths: string[]): TreeNode[] {
  const roots: TreeNode[] = []

  for (const path of paths) {
    const segments = path.split('/')
    let level = roots
    let prefix = ''

    segments.forEach((name, i) => {
      prefix = prefix ? `${prefix}/${name}` : name
      const isLeaf = i === segments.length - 1
      let node = level.find((n) => n.name === name && Boolean(n.children) !== isLeaf)

      if (!node) {
        node = isLeaf ? { name, path: prefix } : { name, path: prefix, children: [] }
        level.push(node)
      }

      if (!isLeaf && node.children) level = node.children
    })
  }

  sortLevel(roots)
  return roots
}

/** Folders before files, each group alphabetical (case-insensitive). */
function sortLevel(nodes: TreeNode[]): void {
  nodes.sort((a, b) => {
    const aDir = Boolean(a.children)
    const bDir = Boolean(b.children)
    if (aDir !== bDir) return aDir ? -1 : 1
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  })
  for (const n of nodes) if (n.children) sortLevel(n.children)
}

function TreeRow({
  node,
  depth,
  onRequestDelete,
}: {
  node: TreeNode
  depth: number
  onRequestDelete: (path: string) => void
}) {
  const activeTabPath = useWorkspaceStore((s) => s.activeTabPath)
  const openTab = useWorkspaceStore((s) => s.openTab)
  const renameTab = useWorkspaceStore((s) => s.renameTab)
  const renameNote = useVaultStore((s) => s.renameNote)
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(node.name)
  const [renameError, setRenameError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const pad = { paddingLeft: `${depth * 12 + 8}px` }

  // Focus + select the filename when entering rename mode (ref instead of the
  // autoFocus attribute, which biome's a11y rules disallow).
  useEffect(() => {
    if (renaming) inputRef.current?.select()
  }, [renaming])

  const startRename = () => {
    setDraftName(node.name)
    setRenameError(null)
    setRenaming(true)
  }
  const cancelRename = () => {
    setRenaming(false)
    setRenameError(null)
  }
  const commitRename = async () => {
    const name = draftName.trim()
    if (name === '' || name === node.name) {
      cancelRename()
      return
    }
    // Keep the file in its current folder; only the leaf name changes.
    const slash = node.path.lastIndexOf('/')
    const parent = slash === -1 ? '' : node.path.slice(0, slash + 1)
    const to = parent + name
    const err = await renameNote(node.path, to)
    if (err !== null) {
      // Stay in edit mode so the user can fix it (e.g. bad extension / clash).
      setRenameError(err)
      inputRef.current?.select()
      return
    }
    // Keep any open tab pointing at the renamed note.
    renameTab(node.path, to)
    setRenaming(false)
    setRenameError(null)
  }

  if (node.children) {
    return (
      <div className="min-w-0">
        <div
          className="flex min-w-0 items-center gap-1.5 overflow-hidden py-1 text-xs font-medium text-slate-500"
          style={pad}
        >
          <FolderClosed className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{node.name}</span>
        </div>
        {node.children.map((child) => (
          <TreeRow
            key={child.path}
            node={child}
            depth={depth + 1}
            onRequestDelete={onRequestDelete}
          />
        ))}
      </div>
    )
  }

  if (renaming) {
    return (
      <div className="flex items-center py-1" style={pad}>
        <input
          ref={inputRef}
          value={draftName}
          aria-label="New note name"
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
          className={`min-w-0 flex-1 rounded bg-slate-800 px-1.5 py-0.5 text-sm text-slate-100 outline outline-1 ${
            renameError !== null ? 'outline-red-500' : 'outline-slate-600'
          }`}
        />
      </div>
    )
  }

  const selected = activeTabPath === node.path
  return (
    <div
      className={`group flex min-w-0 items-center overflow-hidden border-l-2 transition-colors ${
        selected ? 'border-accent-500 bg-accent-500/10' : 'border-transparent hover:bg-slate-800/60'
      }`}
    >
      <button
        type="button"
        onClick={() => openTab(node.path)}
        style={pad}
        className={`flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden py-1 text-left text-sm transition ${
          selected ? 'font-medium text-slate-50' : 'text-slate-300 group-hover:text-slate-100'
        }`}
      >
        <File
          className={`size-3.5 shrink-0 ${selected ? 'text-accent-400' : 'text-slate-500'}`}
          aria-hidden="true"
        />
        <span className="truncate">{node.name}</span>
      </button>
      <button
        type="button"
        onClick={startRename}
        title="Rename note"
        className="invisible rounded p-1 text-slate-500 transition hover:bg-slate-700 hover:text-slate-200 group-hover:visible"
      >
        <Pencil className="size-3.5" aria-hidden="true" />
        <span className="sr-only">Rename {node.name}</span>
      </button>
      <button
        type="button"
        onClick={() => onRequestDelete(node.path)}
        title="Delete note"
        className="invisible mr-1 rounded p-1 text-slate-500 transition hover:bg-slate-700 hover:text-red-400 group-hover:visible"
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
        <span className="sr-only">Delete {node.name}</span>
      </button>
    </div>
  )
}

const MAX_VISIBLE_TAGS = 50

function TagsSection() {
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
    <div className="shrink-0 border-t border-slate-800">
      <div className="px-3 pt-2 pb-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Tags
        </span>
      </div>
      <div className="max-h-32 overflow-y-auto overflow-x-hidden px-2 pb-2">
        <div className="flex flex-wrap gap-1">
          {visible.map((t) => (
            <button
              key={t.name}
              type="button"
              onClick={() => void handleTagClick(t.name)}
              className="inline-flex items-center gap-1 rounded-md bg-slate-800/70 px-2 py-0.5 text-xs text-slate-300 transition hover:bg-accent-600/30 hover:text-accent-200"
            >
              <Hash className="size-3 text-slate-500" aria-hidden="true" />
              <span>{t.name}</span>
              <span className="text-slate-500">{t.count}</span>
            </button>
          ))}
        </div>
        {hasMore && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mt-1.5 text-xs text-slate-500 transition hover:text-slate-300"
          >
            Show all ({tags.length - MAX_VISIBLE_TAGS} more)
          </button>
        )}
      </div>
    </div>
  )
}

export function Sidebar() {
  const fileList = useVaultStore((s) => s.fileList)
  const treeLoading = useVaultStore((s) => s.treeLoading)
  const loadFiles = useVaultStore((s) => s.loadFiles)
  const createNote = useVaultStore((s) => s.createNote)
  const createFolder = useVaultStore((s) => s.createFolder)
  const deleteNote = useVaultStore((s) => s.deleteNote)
  const pickAndSetVault = useVaultStore((s) => s.pickAndSetVault)
  const openTab = useWorkspaceStore((s) => s.openTab)
  const removeTab = useWorkspaceStore((s) => s.removeTab)
  const loadTags = useTagsStore((s) => s.loadTags)
  const tree = useMemo(() => buildTree(fileList), [fileList])

  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [viewMode, setViewMode] = useState<'tree' | 'list'>('tree')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [folderError, setFolderError] = useState<string | null>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadTags()
  }, [loadTags])

  useEffect(() => {
    if (creatingFolder) folderInputRef.current?.focus()
  }, [creatingFolder])

  const handleNewNote = async () => {
    const path = await createNote()
    if (path !== null) await openTab(path)
  }

  const startCreateFolder = () => {
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
    await deleteNote(path)
    removeTab(path)
    void loadTags()
  }

  if (showSettings) {
    return (
      <div className="flex h-full min-w-0 flex-col overflow-hidden bg-slate-900 text-slate-300">
        <SettingsPanel onClose={() => setShowSettings(false)} />
      </div>
    )
  }

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-slate-900 text-slate-300">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 pt-3 pb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Notes
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={pickAndSetVault}
            title="Change vault folder"
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-800 hover:text-accent-300"
          >
            <FolderOpen className="size-3.5" aria-hidden="true" />
            <span className="sr-only">Change vault folder</span>
          </button>
          <button
            type="button"
            onClick={handleNewNote}
            title="New note"
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-800 hover:text-accent-300"
          >
            <FilePlus className="size-3.5" aria-hidden="true" />
            <span className="sr-only">New note</span>
          </button>
          <button
            type="button"
            onClick={startCreateFolder}
            title="New folder"
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-800 hover:text-accent-300"
          >
            <FolderPlus className="size-3.5" aria-hidden="true" />
            <span className="sr-only">New folder</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode(viewMode === 'tree' ? 'list' : 'tree')}
            title={viewMode === 'tree' ? 'List view' : 'Tree view'}
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-800 hover:text-accent-300"
          >
            <List className="size-3.5" aria-hidden="true" />
            <span className="sr-only">{viewMode === 'tree' ? 'List view' : 'Tree view'}</span>
          </button>
          <button
            type="button"
            onClick={loadFiles}
            disabled={treeLoading}
            title="Refresh"
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-800 hover:text-accent-300 disabled:opacity-50"
          >
            <RefreshCw
              className={`size-3.5 ${treeLoading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span className="sr-only">Refresh</span>
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-1">
        {viewMode === 'list' ? (
          <NotesList />
        ) : (
          <>
            {creatingFolder && (
              <div className="flex items-center gap-1.5 px-2 py-1">
                <FolderClosed className="size-3.5 shrink-0 text-slate-500" aria-hidden="true" />
                <input
                  ref={folderInputRef}
                  value={folderName}
                  aria-label="New folder name"
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
                  placeholder="Folder name"
                  className={`min-w-0 flex-1 rounded bg-slate-800 px-1.5 py-0.5 text-sm text-slate-100 placeholder-slate-500 outline outline-1 ${
                    folderError !== null ? 'outline-red-500' : 'outline-slate-600'
                  }`}
                />
              </div>
            )}
            {tree.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
                <p className="text-xs text-slate-500">
                  {treeLoading ? 'Loading…' : 'This vault has no notes yet.'}
                </p>
                {!treeLoading && (
                  <button
                    type="button"
                    onClick={handleNewNote}
                    className="rounded-md bg-accent-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm shadow-accent-500/30 transition hover:bg-accent-500"
                  >
                    Create your first note
                  </button>
                )}
              </div>
            ) : (
              tree.map((node) => (
                <TreeRow key={node.path} node={node} depth={0} onRequestDelete={setPendingDelete} />
              ))
            )}
          </>
        )}
      </div>

      <TagsSection />

      <div className="shrink-0 border-t border-slate-800 px-3 py-2">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            title="Settings"
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-accent-300"
          >
            <Settings className="size-4" aria-hidden="true" />
            <span className="sr-only">Settings</span>
          </button>
          <div className="text-right">
            <p className="text-[10px] text-slate-500 light:text-slate-400">
              Slate <span className="text-slate-400 light:text-slate-500">v0.1.0</span>
            </p>
            <p className="text-[9px] text-slate-600 light:text-slate-400">Created by Sefa Çakır</p>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete note"
        message={`Delete "${pendingDelete ?? ''}"? This removes the file from disk and cannot be undone.`}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
