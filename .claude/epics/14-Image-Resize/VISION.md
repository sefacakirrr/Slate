# Epic 14 — Image Resize

## Problem

Embedded images in notes render at their native size (or full width). Users can't resize them inline. Notion, Bear, and other editors let you drag an image corner to resize — that's the expected UX.

## Solution

Add drag handles to the existing `imageWidget` so users can resize images visually. The chosen width persists in the markdown source (e.g. `![alt](path =300x)` or as an HTML `<img width="300">` fallback) so it survives round-trips.

## Scope

- **Drag handles**: corner/edge handles on the image widget that set width on drag.
- **Min/max constraints**: min 80px, max container width. Maintain aspect ratio.
- **Persistence format**: store as `<img src="..." width="N" />` in the markdown — widely supported by renderers and unambiguous.
- **Existing images**: render at native/container width (today's behavior) until explicitly resized.
- **Undo**: resizing is an editor transaction, so Ctrl+Z reverts it.

## Non-goals

- Cropping, rotation, or image editing.
- Resizing attachments that aren't images (PDFs, etc.).

## Success criteria

- User can drag-resize an image and the width persists after closing/reopening the note.
- Markdown source contains the explicit width so other renderers respect it.
- Ctrl+Z undoes a resize.
