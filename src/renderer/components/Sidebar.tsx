import { api } from '@renderer/api'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { NotesList } from '@renderer/components/NotesList'
import { SettingsPanel } from '@renderer/components/SettingsPanel'
import { useSearchStore } from '@renderer/stores/searchStore'
import { useTagsStore } from '@renderer/stores/tagsStore'
import { useVaultStore } from '@renderer/stores/vaultStore'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import {
  ChevronDown,
  ChevronRight,
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

let _dragItem: { path: string; type: 'file' | 'folder' } | null = null

type TreeNode = {
  name: string
  /** Full vault-relative path. For folders this is the folder path. */
  path: string
  /** Present and sorted (folders first) for directory nodes. */
  children?: TreeNode[]
}

/** Builds a nested folder/file tree from note paths + known empty folder paths. */
function buildTree(paths: string[], knownFolders: string[] = []): TreeNode[] {
  const roots: TreeNode[] = []

  function upsertPath(allSegments: string[], isFolder: boolean): void {
    let level = roots
    let prefix = ''
    allSegments.forEach((name, i) => {
      prefix = prefix ? `${prefix}/${name}` : name
      const isLeaf = i === allSegments.length - 1
      let node = level.find((n) => n.name === name && (isLeaf && !isFolder ? n.children === undefined : n.children !== undefined))
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
  onRequestDeleteFolder,
  onCreateNoteIn,
  onCreateFolderIn,
  onDropOnFolder,
}: {
  node: TreeNode
  depth: number
  onRequestDelete: (path: string) => void
  onRequestDeleteFolder: (path: string) => void
  onCreateNoteIn: (folderPath: string, name?: string) => void
  onCreateFolderIn: (fullPath: string) => void
  onDropOnFolder: (folderPath: string) => void
}) {
  const activeTabPath = useWorkspaceStore((s) => s.activeTabPath)
  const openTab = useWorkspaceStore((s) => s.openTab)
  const renameTab = useWorkspaceStore((s) => s.renameTab)
  const renameNote = useVaultStore((s) => s.renameNote)
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(node.name)
  const [renameError, setRenameError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)
  const [creatingChild, setCreatingChild] = useState<'note' | 'folder' | null>(null)
  const [childName, setChildName] = useState('')
  const [isDropTarget, setIsDropTarget] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const childInputRef = useRef<HTMLInputElement>(null)
  const pad = { paddingLeft: `${depth * 12 + 8}px` }
  const childPad = { paddingLeft: `${(depth + 1) * 12 + 8}px` }

  useEffect(() => {
    if (renaming) inputRef.current?.select()
  }, [renaming])

  useEffect(() => {
    if (creatingChild) {
      setChildName('')
      childInputRef.current?.focus()
    }
  }, [creatingChild])

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
    const commitChild = async () => {
      const name = childName.trim()
      if (!name) { setCreatingChild(null); return }
      if (creatingChild === 'folder') {
        await onCreateFolderIn(`${node.path}/${name}`)
      } else {
        await onCreateNoteIn(node.path, name)
      }
      setCreatingChild(null)
    }

    const handleFolderDragOver = (e: React.DragEvent) => {
      e.stopPropagation()
      if (!_dragItem || _dragItem.path === node.path) return
      if (_dragItem.type === 'folder' && node.path.startsWith(_dragItem.path + '/')) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setIsDropTarget(true)
    }

    return (
      <div
        className="min-w-0"
        draggable
        onDragStart={(e) => {
          _dragItem = { path: node.path, type: 'folder' }
          e.dataTransfer.effectAllowed = 'move'
          e.stopPropagation()
        }}
        onDragEnd={() => { _dragItem = null; setIsDropTarget(false) }}
      >
        <div
          className={`group flex min-w-0 items-center overflow-hidden py-0.5 rounded transition-colors ${isDropTarget ? 'bg-accent-500/10 ring-1 ring-accent-400' : ''}`}
          style={pad}
          onDragOver={handleFolderDragOver}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDropTarget(false) }}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setIsDropTarget(false); onDropOnFolder(node.path) }}
        >
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex min-w-0 flex-1 items-center gap-1 py-0.5 text-left text-xs font-medium text-slate-500 transition hover:text-slate-300 light:text-slate-400 light:hover:text-slate-700"
          >
            {expanded
              ? <ChevronDown className="size-3 shrink-0" aria-hidden="true" />
              : <ChevronRight className="size-3 shrink-0" aria-hidden="true" />}
            {expanded
              ? <FolderOpen className="size-3.5 shrink-0 text-slate-400 light:text-slate-500" aria-hidden="true" />
              : <FolderClosed className="size-3.5 shrink-0 text-slate-400 light:text-slate-500" aria-hidden="true" />}
            <span className="truncate">{node.name}</span>
          </button>
          <div className="invisible flex shrink-0 items-center gap-0.5 pr-1 group-hover:visible">
            <button type="button" onClick={() => { setExpanded(true); setCreatingChild('note') }} title="New note here"
              className="rounded p-0.5 text-slate-500 transition hover:bg-slate-700 hover:text-slate-200 light:hover:bg-slate-200 light:hover:text-slate-700">
              <FilePlus className="size-3" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => { setExpanded(true); setCreatingChild('folder') }} title="New subfolder"
              className="rounded p-0.5 text-slate-500 transition hover:bg-slate-700 hover:text-slate-200 light:hover:bg-slate-200 light:hover:text-slate-700">
              <FolderPlus className="size-3" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => onRequestDeleteFolder(node.path)} title="Delete folder"
              className="rounded p-0.5 text-slate-500 transition hover:bg-slate-700 hover:text-red-400 light:hover:bg-slate-200">
              <Trash2 className="size-3" aria-hidden="true" />
            </button>
          </div>
        </div>

        {expanded && (
          <>
            {creatingChild !== null && (
              <div className="flex items-center gap-1.5 py-1" style={childPad}>
                {creatingChild === 'folder'
                  ? <FolderClosed className="size-3.5 shrink-0 text-slate-500" aria-hidden="true" />
                  : <File className="size-3.5 shrink-0 text-slate-500" aria-hidden="true" />}
                <input
                  ref={childInputRef}
                  value={childName}
                  placeholder={creatingChild === 'folder' ? 'Folder name' : 'Note name'}
                  onChange={(e) => setChildName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); void commitChild() }
                    else if (e.key === 'Escape') setCreatingChild(null)
                  }}
                  onBlur={() => setCreatingChild(null)}
                  className="min-w-0 flex-1 rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-100 outline outline-1 outline-slate-600 light:bg-slate-100 light:text-slate-900 light:outline-slate-300"
                />
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
              />
            ))}
          </>
        )}
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
          className={`min-w-0 flex-1 rounded bg-slate-800 px-1.5 py-0.5 text-sm text-slate-100 outline outline-1 light:bg-slate-100 light:text-slate-900 ${
            renameError !== null ? 'outline-red-500' : 'outline-slate-600 light:outline-slate-300'
          }`}
        />
      </div>
    )
  }

  const selected = activeTabPath === node.path
  return (
    <div
      draggable
      onDragStart={(e) => {
        _dragItem = { path: node.path, type: 'file' }
        e.dataTransfer.effectAllowed = 'move'
        e.stopPropagation()
      }}
      onDragEnd={() => { _dragItem = null }}
      className={`group flex min-w-0 items-center overflow-hidden border-l-2 transition-colors ${
        selected
          ? 'border-accent-500 bg-accent-500/10'
          : 'border-transparent hover:bg-slate-800/60 light:hover:bg-slate-100'
      }`}
    >
      <button
        type="button"
        onClick={() => openTab(node.path)}
        style={pad}
        className={`flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden py-1 text-left text-sm transition ${
          selected
            ? 'font-medium text-slate-50 light:text-slate-900'
            : 'text-slate-300 group-hover:text-slate-100 light:text-slate-600 light:group-hover:text-slate-900'
        }`}
      >
        <File
          className={`size-3.5 shrink-0 ${selected ? 'text-accent-400' : 'text-slate-500 light:text-slate-400'}`}
          aria-hidden="true"
        />
        <span className="truncate">{node.name}</span>
      </button>
      <button
        type="button"
        onClick={startRename}
        title="Rename note"
        className="invisible rounded p-1 text-slate-500 transition hover:bg-slate-700 hover:text-slate-200 group-hover:visible light:hover:bg-slate-200 light:hover:text-slate-700"
      >
        <Pencil className="size-3.5" aria-hidden="true" />
        <span className="sr-only">Rename {node.name}</span>
      </button>
      <button
        type="button"
        onClick={() => onRequestDelete(node.path)}
        title="Delete note"
        className="invisible mr-1 rounded p-1 text-slate-500 transition hover:bg-slate-700 hover:text-red-400 group-hover:visible light:hover:bg-slate-200"
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
    <div className="shrink-0 border-t border-slate-800 light:border-slate-200">
      <div className="px-3 pt-2 pb-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 light:text-slate-400">
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
              className="inline-flex items-center gap-1 rounded-md bg-slate-800/70 px-2 py-0.5 text-xs text-slate-300 transition hover:bg-accent-600/30 hover:text-accent-200 light:bg-slate-100 light:text-slate-600 light:hover:bg-accent-100/50 light:hover:text-accent-700"
            >
              <Hash className="size-3 text-slate-500 light:text-slate-400" aria-hidden="true" />
              <span>{t.name}</span>
              <span className="text-slate-500 light:text-slate-400">{t.count}</span>
            </button>
          ))}
        </div>
        {hasMore && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mt-1.5 text-xs text-slate-500 transition hover:text-slate-300 light:text-slate-400 light:hover:text-slate-600"
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
  const loadTags = useTagsStore((s) => s.loadTags)
  const tree = useMemo(() => buildTree(fileList, folderList), [fileList, folderList])

  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [pendingDeleteFolder, setPendingDeleteFolder] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [viewMode, setViewMode] = useState<'tree' | 'list'>('tree')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [folderError, setFolderError] = useState<string | null>(null)
  const [rootDropTarget, setRootDropTarget] = useState(false)
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

  const confirmDeleteFolder = async () => {
    if (pendingDeleteFolder === null) return
    const path = pendingDeleteFolder
    setPendingDeleteFolder(null)
    await deleteFolder(path)
    closeFolderTabs(path)
    void loadTags()
  }

  const handleCreateNoteIn = async (folderPath: string, name?: string) => {
    const filename = name ?? `untitled-${Date.now()}.md`
    const noteName = filename.includes('.') ? filename : `${filename}.md`
    const path = await createNote(`${folderPath}/${noteName}`)
    if (path !== null) await openTab(path)
  }

  const handleCreateFolderIn = async (fullPath: string) => {
    await createFolder(fullPath)
  }

  const handleDrop = async (toFolder: string) => {
    const item = _dragItem
    _dragItem = null
    if (!item) return
    const name = item.path.split('/').pop()!
    const to = toFolder ? `${toFolder}/${name}` : name
    if (item.path === to) return
    if (item.type === 'file') {
      const err = await renameNote(item.path, to)
      if (err === null) renameTab(item.path, to)
    } else {
      await moveFolder(item.path, to)
      closeFolderTabs(item.path)
    }
  }

  if (showSettings) {
    return (
      <div className="flex h-full min-w-0 flex-col overflow-hidden bg-slate-900 text-slate-300 light:bg-white light:text-slate-700">
        <SettingsPanel onClose={() => setShowSettings(false)} />
      </div>
    )
  }

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-slate-900 text-slate-300 light:bg-white light:text-slate-700">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 pt-3 pb-2 light:border-slate-200">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 light:text-slate-400">
          Notes
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={pickAndSetVault}
            title="Change vault folder"
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-800 hover:text-accent-300 light:text-slate-500 light:hover:bg-slate-100"
          >
            <FolderOpen className="size-3.5" aria-hidden="true" />
            <span className="sr-only">Change vault folder</span>
          </button>
          <button
            type="button"
            onClick={handleNewNote}
            title="New note"
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-800 hover:text-accent-300 light:text-slate-500 light:hover:bg-slate-100"
          >
            <FilePlus className="size-3.5" aria-hidden="true" />
            <span className="sr-only">New note</span>
          </button>
          <button
            type="button"
            onClick={startCreateFolder}
            title="New folder"
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-800 hover:text-accent-300 light:text-slate-500 light:hover:bg-slate-100"
          >
            <FolderPlus className="size-3.5" aria-hidden="true" />
            <span className="sr-only">New folder</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode(viewMode === 'tree' ? 'list' : 'tree')}
            title={viewMode === 'tree' ? 'List view' : 'Tree view'}
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-800 hover:text-accent-300 light:text-slate-500 light:hover:bg-slate-100"
          >
            <List className="size-3.5" aria-hidden="true" />
            <span className="sr-only">{viewMode === 'tree' ? 'List view' : 'Tree view'}</span>
          </button>
          <button
            type="button"
            onClick={loadFiles}
            disabled={treeLoading}
            title="Refresh"
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-800 hover:text-accent-300 disabled:opacity-50 light:text-slate-500 light:hover:bg-slate-100"
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
                  className={`min-w-0 flex-1 rounded bg-slate-800 px-1.5 py-0.5 text-sm text-slate-100 placeholder-slate-500 outline outline-1 light:bg-slate-100 light:text-slate-900 light:placeholder-slate-400 ${
                    folderError !== null ? 'outline-red-500' : 'outline-slate-600 light:outline-slate-300'
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
                  drop to root
                </div>
              </>
            )}
          </>
        )}
      </div>

      <TagsSection />

      <div className="shrink-0 border-t border-slate-800 px-3 py-2 light:border-slate-200">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            title="Settings"
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-accent-300 light:text-slate-500 light:hover:bg-slate-100"
          >
            <Settings className="size-4" aria-hidden="true" />
            <span className="sr-only">Settings</span>
          </button>
          <div className="text-right">
            <p className="text-[11px] font-semibold text-slate-300 light:text-slate-600">
              Slate <span className="font-normal text-slate-400 light:text-slate-500">v0.1.0</span>
            </p>
            <p className="text-[10px] text-slate-400 light:text-slate-500">Created by Sefa Çakır</p>
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

      <ConfirmDialog
        open={pendingDeleteFolder !== null}
        title="Delete folder"
        message={`Delete "${pendingDeleteFolder ?? ''}" and all its contents? This cannot be undone.`}
        confirmLabel="Delete"
        confirmTone="danger"
        onConfirm={confirmDeleteFolder}
        onCancel={() => setPendingDeleteFolder(null)}
      />
    </div>
  )
}
