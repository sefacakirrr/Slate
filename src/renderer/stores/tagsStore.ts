import { api } from '@renderer/api'
import type { TagInfo } from '@shared/types'
import { create } from 'zustand'

type TagsState = {
  tags: TagInfo[]
  loading: boolean
  expanded: boolean

  loadTags: () => Promise<void>
  setExpanded: (expanded: boolean) => void
}

export const useTagsStore = create<TagsState>((set) => ({
  tags: [],
  loading: false,
  expanded: false,

  loadTags: async () => {
    set({ loading: true })
    const result = await api.tags.list()
    if (result.ok) {
      set({ tags: result.data, loading: false })
    } else {
      console.error(`tags:list failed: ${result.error}`)
      set({ loading: false })
    }
  },

  setExpanded: (expanded) => set({ expanded }),
}))
