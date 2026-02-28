# SwarmUI Master Implementation Plan - Part 3
## Phases 3-7 Detailed Implementation

---

# Phase 3: IDE and Workspace Enhancements

**Duration:** 10 Rounds  
**Gaps Addressed:** IDE-01, IDE-02, IDE-03, IDE-04, IDE-05, IDE-06, IDE-07, IDE-08, IDE-09

## Sub-Phase 3A: File Explorer Enhancements (Rounds 1-3)

### Round 1: Multi-Select Implementation

#### Task 3.1.1: Add Selection State to File Tree

**Agent:** Agent A (Core Implementation)  
**Files to Modify:**
- `components/file-tree.tsx`
- `lib/store.ts`

**Implementation:**

```typescript
// lib/store.ts - ADD to SwarmStore interface and implementation
interface SwarmStore {
  // ... existing fields ...
  
  // File selection
  selectedFiles: Set<string>;
  selectFile: (path: string, additive?: boolean) => void;
  selectRange: (startPath: string, endPath: string) => void;
  clearSelection: () => void;
  toggleFileSelection: (path: string) => void;
}

// Implementation
selectedFiles: new Set(),

selectFile: (path, additive = false) => {
  set((state) => {
    const newSelection = additive 
      ? new Set([...state.selectedFiles, path])
      : new Set([path]);
    return { selectedFiles: newSelection };
  });
},

selectRange: (startPath, endPath) => {
  set((state) => {
    // Get all visible files between start and end
    const allFiles = state.fileTree?.flattenedPaths || [];
    const startIndex = allFiles.indexOf(startPath);
    const endIndex = allFiles.indexOf(endPath);
    
    if (startIndex === -1 || endIndex === -1) return state;
    
    const [from, to] = startIndex < endIndex 
      ? [startIndex, endIndex] 
      : [endIndex, startIndex];
    
    const rangeFiles = allFiles.slice(from, to + 1);
    return { selectedFiles: new Set(rangeFiles) };
  });
},

clearSelection: () => {
  set({ selectedFiles: new Set() });
},

toggleFileSelection: (path) => {
  set((state) => {
    const newSelection = new Set(state.selectedFiles);
    if (newSelection.has(path)) {
      newSelection.delete(path);
    } else {
      newSelection.add(path);
    }
    return { selectedFiles: newSelection };
  });
},
```

```typescript
// components/file-tree.tsx - ADD multi-select handling
import { useStore } from '@/lib/store';

interface FileTreeItemProps {
  path: string;
  name: string;
  isDirectory: boolean;
  depth: number;
  isSelected: boolean;
  onSelect: (path: string, event: React.MouseEvent) => void;
}

function FileTreeItem({ 
  path, 
  name, 
  isDirectory, 
  depth, 
  isSelected,
  onSelect 
}: FileTreeItemProps) {
  const handleClick = (e: React.MouseEvent) => {
    onSelect(path, e);
  };

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-2 py-1 cursor-pointer rounded',
        'hover:bg-accent',
        isSelected && 'bg-primary/20 ring-1 ring-primary'
      )}
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
      onClick={handleClick}
      data-path={path}
      data-selected={isSelected}
    >
      {isDirectory ? <FolderIcon className="h-4 w-4" /> : <FileIcon className="h-4 w-4" />}
      <span className="truncate">{name}</span>
    </div>
  );
}

export function FileTree() {
  const { 
    selectedFiles, 
    selectFile, 
    selectRange, 
    toggleFileSelection,
    clearSelection 
  } = useStore();
  
  const [lastSelectedPath, setLastSelectedPath] = useState<string | null>(null);

  const handleSelect = (path: string, event: React.MouseEvent) => {
    if (event.ctrlKey || event.metaKey) {
      // Ctrl/Cmd+Click: Toggle selection
      toggleFileSelection(path);
    } else if (event.shiftKey && lastSelectedPath) {
      // Shift+Click: Range selection
      selectRange(lastSelectedPath, path);
    } else {
      // Normal click: Single selection
      selectFile(path);
    }
    setLastSelectedPath(path);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearSelection();
      }
      if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        // Select all visible files
        // Implementation depends on file tree structure
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearSelection]);

  return (
    <div className="file-tree" role="tree" aria-label="File explorer">
      {/* Render file tree items with isSelected prop */}
    </div>
  );
}
```

**Acceptance Criteria:**
- [ ] Ctrl/Cmd+Click toggles selection
- [ ] Shift+Click selects range
- [ ] Normal click single-selects
- [ ] Escape clears selection
- [ ] Selected files visually highlighted

---

#### Task 3.1.2: Implement Bulk Operations UI

**Agent:** Agent B (Supporting Implementation)  
**Files to Create:**
- `components/file-bulk-actions.tsx`

**Implementation:**

```typescript
// components/file-bulk-actions.tsx
'use client';

import { useStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Trash2, Move, Copy, Download, FolderOpen } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export function FileBulkActions() {
  const { selectedFiles, clearSelection } = useStore();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [destinationPath, setDestinationPath] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const selectedCount = selectedFiles.size;

  if (selectedCount === 0) return null;

  const handleBulkDelete = async () => {
    setIsProcessing(true);
    try {
      const paths = Array.from(selectedFiles);
      
      const response = await fetch('/api/files/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths }),
      });

      if (!response.ok) {
        throw new Error('Failed to delete files');
      }

      const result = await response.json();
      toast.success(`Deleted ${result.deleted} files`);
      clearSelection();
    } catch (error) {
      toast.error('Failed to delete files');
    } finally {
      setIsProcessing(false);
      setShowDeleteDialog(false);
    }
  };

  const handleBulkMove = async () => {
    if (!destinationPath.trim()) {
      toast.error('Please enter a destination path');
      return;
    }

    setIsProcessing(true);
    try {
      const paths = Array.from(selectedFiles);
      
      const response = await fetch('/api/files/bulk-move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths, destination: destinationPath }),
      });

      if (!response.ok) {
        throw new Error('Failed to move files');
      }

      const result = await response.json();
      toast.success(`Moved ${result.moved} files to ${destinationPath}`);
      clearSelection();
    } catch (error) {
      toast.error('Failed to move files');
    } finally {
      setIsProcessing(false);
      setShowMoveDialog(false);
      setDestinationPath('');
    }
  };

  const handleBulkCopy = async () => {
    // Similar to move but with copy endpoint
  };

  const handleBulkDownload = async () => {
    try {
      const paths = Array.from(selectedFiles);
      
      const response = await fetch('/api/files/bulk-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths }),
      });

      if (!response.ok) {
        throw new Error('Failed to create download');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'files.zip';
      a.click();
      URL.revokeObjectURL(url);
      
      toast.success('Download started');
    } catch (error) {
      toast.error('Failed to download files');
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
        <span className="text-sm text-muted-foreground">
          {selectedCount} file{selectedCount !== 1 ? 's' : ''} selected
        </span>
        
        <div className="flex-1" />
        
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowMoveDialog(true)}
          disabled={isProcessing}
        >
          <Move className="h-4 w-4 mr-1" />
          Move
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBulkCopy}
          disabled={isProcessing}
        >
          <Copy className="h-4 w-4 mr-1" />
          Copy
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBulkDownload}
          disabled={isProcessing}
        >
          <Download className="h-4 w-4 mr-1" />
          Download
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowDeleteDialog(true)}
          disabled={isProcessing}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4 mr-1" />
          Delete
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={clearSelection}
        >
          Clear
        </Button>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedCount} files?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The following files will be permanently deleted:
              <ul className="mt-2 max-h-40 overflow-auto text-sm">
                {Array.from(selectedFiles).slice(0, 10).map(path => (
                  <li key={path} className="truncate">{path}</li>
                ))}
                {selectedCount > 10 && (
                  <li className="text-muted-foreground">
                    ...and {selectedCount - 10} more
                  </li>
                )}
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isProcessing}
              className="bg-destructive text-destructive-foreground"
            >
              {isProcessing ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Move Dialog */}
      <Dialog open={showMoveDialog} onOpenChange={setShowMoveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move {selectedCount} files</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium">Destination folder</label>
            <div className="flex gap-2 mt-2">
              <Input
                value={destinationPath}
                onChange={(e) => setDestinationPath(e.target.value)}
                placeholder="/path/to/destination"
              />
              <Button variant="outline" size="icon">
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMoveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleBulkMove} disabled={isProcessing}>
              {isProcessing ? 'Moving...' : 'Move'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

**Acceptance Criteria:**
- [ ] Bulk actions bar appears when files selected
- [ ] Delete with confirmation works
- [ ] Move with destination picker works
- [ ] Copy and download work
- [ ] Clear selection works

---

#### Task 3.1.3: Create Bulk Operations API

**Agent:** Testing Agent  
**Files to Create:**
- `app/api/files/bulk-delete/route.ts`
- `app/api/files/bulk-move/route.ts`
- `tests/api/files/bulk.test.ts`

**Implementation:**

```typescript
// app/api/files/bulk-delete/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { unlink, rm } from 'fs/promises';
import { existsSync, statSync } from 'fs';
import { join } from 'path';

export async function POST(request: NextRequest) {
  try {
    const { paths } = await request.json();
    
    if (!Array.isArray(paths) || paths.length === 0) {
      return NextResponse.json(
        { error: 'paths must be a non-empty array' },
        { status: 400 }
      );
    }

    const basePath = process.env.WORKSPACE_PATH || process.cwd();
    let deleted = 0;
    const errors: string[] = [];

    for (const relativePath of paths) {
      const fullPath = join(basePath, relativePath);
      
      // Security: Ensure path is within workspace
      if (!fullPath.startsWith(basePath)) {
        errors.push(`${relativePath}: Access denied`);
        continue;
      }

      try {
        if (!existsSync(fullPath)) {
          errors.push(`${relativePath}: Not found`);
          continue;
        }

        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          await rm(fullPath, { recursive: true });
        } else {
          await unlink(fullPath);
        }
        deleted++;
      } catch (error) {
        errors.push(`${relativePath}: ${(error as Error).message}`);
      }
    }

    return NextResponse.json({
      deleted,
      total: paths.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete files' },
      { status: 500 }
    );
  }
}
```

```typescript
// app/api/files/bulk-move/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { rename, mkdir } from 'fs/promises';
import { existsSync, statSync } from 'fs';
import { join, dirname, basename } from 'path';

export async function POST(request: NextRequest) {
  try {
    const { paths, destination } = await request.json();
    
    if (!Array.isArray(paths) || paths.length === 0) {
      return NextResponse.json(
        { error: 'paths must be a non-empty array' },
        { status: 400 }
      );
    }

    if (!destination || typeof destination !== 'string') {
      return NextResponse.json(
        { error: 'destination is required' },
        { status: 400 }
      );
    }

    const basePath = process.env.WORKSPACE_PATH || process.cwd();
    const destPath = join(basePath, destination);

    // Security: Ensure destination is within workspace
    if (!destPath.startsWith(basePath)) {
      return NextResponse.json(
        { error: 'Destination must be within workspace' },
        { status: 400 }
      );
    }

    // Create destination if it doesn't exist
    if (!existsSync(destPath)) {
      await mkdir(destPath, { recursive: true });
    }

    let moved = 0;
    const errors: string[] = [];

    for (const relativePath of paths) {
      const sourcePath = join(basePath, relativePath);
      
      // Security: Ensure source is within workspace
      if (!sourcePath.startsWith(basePath)) {
        errors.push(`${relativePath}: Access denied`);
        continue;
      }

      try {
        if (!existsSync(sourcePath)) {
          errors.push(`${relativePath}: Not found`);
          continue;
        }

        const fileName = basename(relativePath);
        const targetPath = join(destPath, fileName);

        await rename(sourcePath, targetPath);
        moved++;
      } catch (error) {
        errors.push(`${relativePath}: ${(error as Error).message}`);
      }
    }

    return NextResponse.json({
      moved,
      total: paths.length,
      destination,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to move files' },
      { status: 500 }
    );
  }
}
```

**Acceptance Criteria:**
- [ ] Bulk delete API works
- [ ] Bulk move API works
- [ ] Security checks in place
- [ ] Error handling works

---

#### Task 3.1.4: Validation

**Agent:** Validation Agent  

```bash
npm run typecheck
npm run lint
npm run test tests/api/files/
```

---

### Round 2: File Previews

#### Task 3.2.1: Create File Preview Component

**Agent:** Agent A (Core Implementation)  
**Files to Create:**
- `components/file-preview.tsx`

**Implementation:**

```typescript
// components/file-preview.tsx
'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { FileIcon, ImageIcon, FileTextIcon, FileCode, Loader2 } from 'lucide-react';

interface FilePreviewProps {
  path: string;
  mimeType?: string;
}

type PreviewType = 'image' | 'pdf' | 'text' | 'code' | 'unsupported';

function getPreviewType(path: string, mimeType?: string): PreviewType {
  const ext = path.split('.').pop()?.toLowerCase();
  
  // Images
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico'].includes(ext || '')) {
    return 'image';
  }
  
  // PDF
  if (ext === 'pdf' || mimeType === 'application/pdf') {
    return 'pdf';
  }
  
  // Code files
  if (['ts', 'tsx', 'js', 'jsx', 'json', 'html', 'css', 'scss', 'md', 'yaml', 'yml', 'xml', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h'].includes(ext || '')) {
    return 'code';
  }
  
  // Plain text
  if (['txt', 'log', 'env', 'gitignore', 'dockerignore'].includes(ext || '')) {
    return 'text';
  }
  
  return 'unsupported';
}

export function FilePreview({ path, mimeType }: FilePreviewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  
  const previewType = getPreviewType(path, mimeType);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setContent(null);

    if (previewType === 'text' || previewType === 'code') {
      // Fetch text content
      fetch(`/api/files/${encodeURIComponent(path)}`)
        .then(res => {
          if (!res.ok) throw new Error('Failed to load file');
          return res.text();
        })
        .then(text => {
          setContent(text);
          setLoading(false);
        })
        .catch(err => {
          setError(err.message);
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [path, previewType]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <FileIcon className="h-12 w-12 mb-2" />
        <p>Failed to load preview</p>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  switch (previewType) {
    case 'image':
      return (
        <div className="flex items-center justify-center h-full p-4 bg-checkered">
          <Image
            src={`/api/files/${encodeURIComponent(path)}`}
            alt={path}
            width={800}
            height={600}
            className="max-w-full max-h-full object-contain"
            onError={() => setError('Failed to load image')}
          />
        </div>
      );

    case 'pdf':
      return (
        <iframe
          src={`/api/files/${encodeURIComponent(path)}#view=FitH`}
          className="w-full h-full border-0"
          title={`PDF preview: ${path}`}
        />
      );

    case 'code':
    case 'text':
      return (
        <div className="h-full overflow-auto">
          <pre className="p-4 text-sm font-mono whitespace-pre-wrap break-words">
            {content}
          </pre>
        </div>
      );

    case 'unsupported':
    default:
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
          <FileIcon className="h-12 w-12 mb-2" />
          <p>Preview not available</p>
          <p className="text-sm">This file type cannot be previewed</p>
        </div>
      );
  }
}
```

**Acceptance Criteria:**
- [ ] Image preview works
- [ ] PDF preview works
- [ ] Text/code preview works
- [ ] Unsupported files show message

---

### Round 3: Drag-and-Drop File Moving

#### Task 3.3.1: Implement DnD with @dnd-kit

**Agent:** Agent A (Core Implementation)  
**Files to Modify:**
- `components/file-tree.tsx`

**Implementation:**

```typescript
// components/file-tree.tsx - ADD DnD support
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
} from '@dnd-kit/core';
import {
  useSortable,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface DraggableFileItemProps {
  id: string;
  path: string;
  name: string;
  isDirectory: boolean;
  depth: number;
  isSelected: boolean;
  onSelect: (path: string, event: React.MouseEvent) => void;
}

function DraggableFileItem({
  id,
  path,
  name,
  isDirectory,
  depth,
  isSelected,
  onSelect,
}: DraggableFileItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'flex items-center gap-2 px-2 py-1 cursor-pointer rounded',
        'hover:bg-accent',
        isSelected && 'bg-primary/20 ring-1 ring-primary',
        isDragging && 'ring-2 ring-primary'
      )}
      onClick={(e) => onSelect(path, e)}
    >
      {isDirectory ? (
        <FolderIcon className="h-4 w-4 text-yellow-500" />
      ) : (
        <FileIcon className="h-4 w-4" />
      )}
      <span className="truncate">{name}</span>
    </div>
  );
}

export function FileTreeWithDnD() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Prevent accidental drags
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const over = event.over;
    if (over) {
      setOverId(over.id as string);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    
    setActiveId(null);
    setOverId(null);

    if (!over || active.id === over.id) return;

    const sourcePath = active.id as string;
    const targetPath = over.id as string;

    // Check if target is a directory
    const targetIsDirectory = files.find(f => f.path === targetPath)?.isDirectory;
    
    if (!targetIsDirectory) {
      // Can't drop on a file, use parent directory
      return;
    }

    try {
      const response = await fetch('/api/files/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: sourcePath,
          destination: targetPath,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to move file');
      }

      toast.success('File moved successfully');
      // Refresh file tree
    } catch (error) {
      toast.error('Failed to move file');
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={files.map(f => f.path)}
        strategy={verticalListSortingStrategy}
      >
        <div className="file-tree">
          {files.map(file => (
            <DraggableFileItem
              key={file.path}
              id={file.path}
              {...file}
            />
          ))}
        </div>
      </SortableContext>

      <DragOverlay>
        {activeId ? (
          <div className="bg-card border rounded px-2 py-1 shadow-lg">
            {files.find(f => f.path === activeId)?.name}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
```

**Acceptance Criteria:**
- [ ] Files can be dragged
- [ ] Drop on folders moves file
- [ ] Visual feedback during drag
- [ ] Keyboard navigation works

---

## Sub-Phase 3B: Dev Container Support (Rounds 4-7)

[Detailed implementation for devcontainer detection, CLI integration, templates...]

---

## Sub-Phase 3C: Workspace Quotas and Isolation (Rounds 8-10)

[Detailed implementation for resource tracking, per-user isolation, quota UI...]

---

# Phase 4: Ticketing and Agent System

**Duration:** 10 Rounds  
**Gaps Addressed:** TKT-01 through TKT-05, AGT-01 through AGT-06

## Sub-Phase 4A: Ticketing Enhancements (Rounds 1-4)

### Round 1: Schema Updates

#### Task 4.1.1: Update Ticket Schema

**Agent:** Agent A (Core Implementation)  
**Files to Modify:**
- `lib/types.ts`

**Implementation:**

```typescript
// lib/types.ts - UPDATE TicketSchema
export const TicketSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  
  // Hierarchy
  level: z.enum(['feature', 'epic', 'story', 'task', 'subtask', 'subatomic']).default('task'),
  parentId: z.string().optional(),
  
  // Status and workflow
  status: z.enum(['backlog', 'in_progress', 'review', 'approved', 'rejected', 'done']).default('backlog'),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  complexity: z.enum(['S', 'M', 'L', 'XL']).default('M'),
  
  // Assignment - UPDATED
  assignedRole: z.enum(['researcher', 'planner', 'coder', 'reviewer', 'tester', 'documenter']).optional(),
  assigneeId: z.string().optional(), // NEW: Human assignee
  
  // Collaboration - NEW
  watchers: z.array(z.string()).optional().default([]),
  
  // Dependencies
  dependencies: z.array(z.string()).optional().default([]),
  
  // External links
  externalId: z.string().optional(),
  externalUrl: z.string().url().optional(),
  
  // Code links - NEW
  codeLinks: z.array(z.object({
    type: z.enum(['commit', 'pr', 'branch', 'file']),
    url: z.string(),
    title: z.string(),
    sha: z.string().optional(),
  })).optional().default([]),
  
  // Labels
  labels: z.array(z.string()).optional().default([]),
  
  // Timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  dueDate: z.string().datetime().optional(),
});

// NEW: Ticket Comment Schema
export const TicketCommentSchema = z.object({
  id: z.string(),
  ticketId: z.string(),
  userId: z.string(),
  content: z.string().min(1),
  parentCommentId: z.string().optional(), // For threading
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  reactions: z.record(z.string(), z.array(z.string())).optional(), // emoji -> userIds
});

// NEW: Ticket Activity Schema
export const TicketActivitySchema = z.object({
  id: z.string(),
  ticketId: z.string(),
  userId: z.string().optional(),
  action: z.enum([
    'created',
    'updated',
    'status_changed',
    'assigned',
    'unassigned',
    'comment_added',
    'watcher_added',
    'watcher_removed',
    'dependency_added',
    'dependency_removed',
    'code_linked',
  ]),
  field: z.string().optional(),
  oldValue: z.string().optional(),
  newValue: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string().datetime(),
});

export type Ticket = z.infer<typeof TicketSchema>;
export type TicketComment = z.infer<typeof TicketCommentSchema>;
export type TicketActivity = z.infer<typeof TicketActivitySchema>;
```

**Acceptance Criteria:**
- [ ] Schema includes assigneeId
- [ ] Schema includes watchers array
- [ ] Comment schema created
- [ ] Activity schema created
- [ ] TypeScript compiles

---

### Round 2: Activity Feed Implementation

#### Task 4.2.1: Create Activity Logging

**Agent:** Agent A (Core Implementation)  
**Files to Create:**
- `server/ticket-activity.ts`

**Implementation:**

```typescript
// server/ticket-activity.ts
import { nanoid } from 'nanoid';
import { getStorage } from './storage';
import type { Ticket, TicketActivity } from '@/lib/types';

export async function logTicketActivity(
  ticketId: string,
  action: TicketActivity['action'],
  options: {
    userId?: string;
    field?: string;
    oldValue?: string;
    newValue?: string;
    metadata?: Record<string, unknown>;
  } = {}
): Promise<TicketActivity> {
  const storage = await getStorage();
  
  const activity: TicketActivity = {
    id: nanoid(),
    ticketId,
    userId: options.userId,
    action,
    field: options.field,
    oldValue: options.oldValue,
    newValue: options.newValue,
    metadata: options.metadata,
    createdAt: new Date().toISOString(),
  };

  await storage.createTicketActivity(activity);
  
  // Notify watchers
  await notifyWatchers(ticketId, activity);
  
  return activity;
}

export async function trackTicketChanges(
  ticketId: string,
  oldTicket: Ticket,
  newTicket: Partial<Ticket>,
  userId?: string
): Promise<void> {
  const changedFields = Object.keys(newTicket).filter(
    key => JSON.stringify(oldTicket[key as keyof Ticket]) !== 
           JSON.stringify(newTicket[key as keyof Ticket])
  );

  for (const field of changedFields) {
    const oldValue = oldTicket[field as keyof Ticket];
    const newValue = newTicket[field as keyof Ticket];

    // Special handling for status changes
    if (field === 'status') {
      await logTicketActivity(ticketId, 'status_changed', {
        userId,
        field,
        oldValue: String(oldValue),
        newValue: String(newValue),
      });
    }
    // Special handling for assignment changes
    else if (field === 'assigneeId') {
      if (newValue && !oldValue) {
        await logTicketActivity(ticketId, 'assigned', {
          userId,
          newValue: String(newValue),
        });
      } else if (!newValue && oldValue) {
        await logTicketActivity(ticketId, 'unassigned', {
          userId,
          oldValue: String(oldValue),
        });
      } else {
        await logTicketActivity(ticketId, 'assigned', {
          userId,
          oldValue: String(oldValue),
          newValue: String(newValue),
        });
      }
    }
    // Generic field update
    else {
      await logTicketActivity(ticketId, 'updated', {
        userId,
        field,
        oldValue: JSON.stringify(oldValue),
        newValue: JSON.stringify(newValue),
      });
    }
  }
}

async function notifyWatchers(
  ticketId: string,
  activity: TicketActivity
): Promise<void> {
  const storage = await getStorage();
  const ticket = await storage.getTicket(ticketId);
  
  if (!ticket?.watchers?.length) return;

  // Get user details for watchers
  const watchers = await Promise.all(
    ticket.watchers.map(id => storage.getUser(id))
  );

  // Send notifications (implementation depends on notification system)
  for (const watcher of watchers) {
    if (watcher && watcher.id !== activity.userId) {
      // Queue notification
      console.log(`[Notify] ${watcher.email} about ${activity.action} on ticket ${ticketId}`);
    }
  }
}

export async function getTicketActivity(
  ticketId: string,
  options?: { limit?: number; offset?: number }
): Promise<{ activities: TicketActivity[]; total: number }> {
  const storage = await getStorage();
  return storage.getTicketActivities(ticketId, options);
}
```

**Acceptance Criteria:**
- [ ] Activity logged on ticket changes
- [ ] Status changes tracked
- [ ] Assignment changes tracked
- [ ] Watchers notified

---

### Round 3: UI Components

#### Task 4.3.1: Add Assignee Selector

**Agent:** Agent A (Core Implementation)  
**Files to Modify:**
- `components/ticket-detail.tsx`

**Implementation:**

```typescript
// components/ticket-detail.tsx - ADD assignee selector
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

function AssigneeSelector({
  value,
  onChange,
  users,
}: {
  value?: string;
  onChange: (userId: string | undefined) => void;
  users: User[];
}) {
  const [open, setOpen] = useState(false);
  const selectedUser = users.find(u => u.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-start"
        >
          {selectedUser ? (
            <div className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                <AvatarImage src={selectedUser.avatar} />
                <AvatarFallback>
                  {selectedUser.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span>{selectedUser.name}</span>
            </div>
          ) : (
            <span className="text-muted-foreground">Unassigned</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0">
        <Command>
          <CommandInput placeholder="Search users..." />
          <CommandEmpty>No users found.</CommandEmpty>
          <CommandGroup>
            <CommandItem
              onSelect={() => {
                onChange(undefined);
                setOpen(false);
              }}
            >
              <span className="text-muted-foreground">Unassigned</span>
            </CommandItem>
            {users.map(user => (
              <CommandItem
                key={user.id}
                onSelect={() => {
                  onChange(user.id);
                  setOpen(false);
                }}
              >
                <div className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={user.avatar} />
                    <AvatarFallback>
                      {user.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{user.name}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

#### Task 4.3.2: Add Watchers Management

**Agent:** Agent B (Supporting Implementation)  
**Files to Create:**
- `components/ticket-watchers.tsx`

**Implementation:**

```typescript
// components/ticket-watchers.tsx
'use client';

import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Eye, EyeOff, Plus, X } from 'lucide-react';
import { toast } from 'sonner';

interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

interface TicketWatchersProps {
  ticketId: string;
  watchers: string[];
  users: User[];
  currentUserId: string;
  onUpdate: (watchers: string[]) => void;
}

export function TicketWatchers({
  ticketId,
  watchers,
  users,
  currentUserId,
  onUpdate,
}: TicketWatchersProps) {
  const [open, setOpen] = useState(false);
  
  const isWatching = watchers.includes(currentUserId);
  const watcherUsers = users.filter(u => watchers.includes(u.id));
  const availableUsers = users.filter(u => !watchers.includes(u.id));

  const toggleWatch = async () => {
    const newWatchers = isWatching
      ? watchers.filter(id => id !== currentUserId)
      : [...watchers, currentUserId];
    
    try {
      await fetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watchers: newWatchers }),
      });
      
      onUpdate(newWatchers);
      toast.success(isWatching ? 'Stopped watching' : 'Now watching');
    } catch {
      toast.error('Failed to update watchers');
    }
  };

  const addWatcher = async (userId: string) => {
    const newWatchers = [...watchers, userId];
    
    try {
      await fetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watchers: newWatchers }),
      });
      
      onUpdate(newWatchers);
      toast.success('Watcher added');
    } catch {
      toast.error('Failed to add watcher');
    }
  };

  const removeWatcher = async (userId: string) => {
    const newWatchers = watchers.filter(id => id !== userId);
    
    try {
      await fetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watchers: newWatchers }),
      });
      
      onUpdate(newWatchers);
      toast.success('Watcher removed');
    } catch {
      toast.error('Failed to remove watcher');
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Watchers</label>
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleWatch}
          className="h-8"
        >
          {isWatching ? (
            <>
              <EyeOff className="h-4 w-4 mr-1" />
              Stop watching
            </>
          ) : (
            <>
              <Eye className="h-4 w-4 mr-1" />
              Watch
            </>
          )}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {watcherUsers.map(user => (
          <div
            key={user.id}
            className="flex items-center gap-1 bg-muted rounded-full pl-1 pr-2 py-1"
          >
            <Avatar className="h-5 w-5">
              <AvatarImage src={user.avatar} />
              <AvatarFallback className="text-xs">
                {user.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs">{user.name}</span>
            <button
              onClick={() => removeWatcher(user.id)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 rounded-full">
              <Plus className="h-3 w-3 mr-1" />
              Add
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2">
            <div className="space-y-1">
              {availableUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">
                  No more users to add
                </p>
              ) : (
                availableUsers.map(user => (
                  <button
                    key={user.id}
                    onClick={() => {
                      addWatcher(user.id);
                      setOpen(false);
                    }}
                    className="w-full flex items-center gap-2 p-2 rounded hover:bg-accent"
                  >
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={user.avatar} />
                      <AvatarFallback className="text-xs">
                        {user.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{user.name}</span>
                  </button>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
```

**Acceptance Criteria:**
- [ ] Assignee selector works
- [ ] Watchers can be added/removed
- [ ] Current user can toggle watch
- [ ] UI updates optimistically

---

### Round 4: Comments and Activity Feed UI

[Detailed implementation for threaded comments and activity feed components...]

---

## Sub-Phase 4B: Agent System with CrewAI Patterns (Rounds 5-7)

### Round 5: Skills Tags

#### Task 4.5.1: Add Skills to Agent Schema

**Agent:** Agent A (Core Implementation)  
**Files to Modify:**
- `lib/types.ts`
- `server/orchestrator.ts`

**Implementation:**

```typescript
// lib/types.ts - ADD AgentSkill and update AgentRole
export const AgentSkillSchema = z.enum([
  // Technical skills
  'frontend',
  'backend',
  'database',
  'devops',
  'testing',
  'security',
  'performance',
  'accessibility',
  
  // Language skills
  'typescript',
  'python',
  'go',
  'rust',
  'java',
  
  // Framework skills
  'react',
  'nextjs',
  'nodejs',
  'django',
  'fastapi',
  
  // Domain skills
  'api-design',
  'ui-ux',
  'documentation',
  'code-review',
  'architecture',
]);

export type AgentSkill = z.infer<typeof AgentSkillSchema>;

// Update AgentConfig to include skills
export const AgentConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(['researcher', 'planner', 'coder', 'reviewer', 'tester', 'documenter']),
  skills: z.array(AgentSkillSchema).optional().default([]),
  provider: z.string(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().optional(),
});

// Skill-based task routing
export const SKILL_REQUIREMENTS: Record<string, AgentSkill[]> = {
  'create-api': ['backend', 'api-design', 'typescript'],
  'create-ui': ['frontend', 'react', 'ui-ux'],
  'write-tests': ['testing', 'typescript'],
  'review-code': ['code-review'],
  'setup-ci': ['devops'],
  'optimize-performance': ['performance', 'backend'],
  'fix-accessibility': ['accessibility', 'frontend'],
  'write-docs': ['documentation'],
};
```

```typescript
// server/orchestrator.ts - ADD skill-based routing
import { AgentSkill, SKILL_REQUIREMENTS } from '@/lib/types';

function matchAgentToTask(
  agents: AgentConfig[],
  taskType: string
): AgentConfig | null {
  const requiredSkills = SKILL_REQUIREMENTS[taskType] || [];
  
  if (requiredSkills.length === 0) {
    // No specific skills required, use any available agent
    return agents[0] || null;
  }

  // Score agents by skill match
  const scoredAgents = agents.map(agent => {
    const agentSkills = new Set(agent.skills || []);
    const matchedSkills = requiredSkills.filter(skill => agentSkills.has(skill));
    const score = matchedSkills.length / requiredSkills.length;
    return { agent, score, matchedSkills };
  });

  // Sort by score descending
  scoredAgents.sort((a, b) => b.score - a.score);

  // Return best match if score > 0
  if (scoredAgents[0]?.score > 0) {
    return scoredAgents[0].agent;
  }

  // Fall back to role-based matching
  const roleForTask = getDefaultRoleForTask(taskType);
  return agents.find(a => a.role === roleForTask) || agents[0] || null;
}

function getDefaultRoleForTask(taskType: string): string {
  const roleMap: Record<string, string> = {
    'create-api': 'coder',
    'create-ui': 'coder',
    'write-tests': 'tester',
    'review-code': 'reviewer',
    'setup-ci': 'coder',
    'write-docs': 'documenter',
    'research': 'researcher',
    'plan': 'planner',
  };
  return roleMap[taskType] || 'coder';
}
```

**Acceptance Criteria:**
- [ ] Skills schema defined
- [ ] Skill requirements mapped to tasks
- [ ] Skill-based routing works
- [ ] Falls back to role-based routing

---

### Round 6: Handover Notes

#### Task 4.6.1: Define Handover Format

**Agent:** Agent A (Core Implementation)  
**Files to Create:**
- `lib/handover-schema.ts`
- `server/handover-generator.ts`

**Implementation:**

```typescript
// lib/handover-schema.ts
import { z } from 'zod';

export const HandoverNoteSchema = z.object({
  id: z.string(),
  fromAgentId: z.string(),
  toAgentId: z.string().optional(),
  ticketId: z.string(),
  stage: z.string(),
  
  // Summary of work done
  summary: z.string(),
  
  // Key decisions made
  decisions: z.array(z.object({
    description: z.string(),
    rationale: z.string(),
    alternatives: z.array(z.string()).optional(),
  })),
  
  // Files created/modified
  fileChanges: z.array(z.object({
    path: z.string(),
    action: z.enum(['created', 'modified', 'deleted']),
    description: z.string(),
  })),
  
  // Open questions/blockers
  openItems: z.array(z.object({
    type: z.enum(['question', 'blocker', 'todo', 'risk']),
    description: z.string(),
    priority: z.enum(['low', 'medium', 'high']),
  })),
  
  // Recommendations for next agent
  recommendations: z.array(z.string()),
  
  // Context for continuation
  context: z.object({
    currentState: z.string(),
    nextSteps: z.array(z.string()),
    dependencies: z.array(z.string()),
  }),
  
  createdAt: z.string().datetime(),
});

export type HandoverNote = z.infer<typeof HandoverNoteSchema>;
```

```typescript
// server/handover-generator.ts
import { nanoid } from 'nanoid';
import type { HandoverNote } from '@/lib/handover-schema';

interface AgentOutput {
  agentId: string;
  ticketId: string;
  stage: string;
  output: string;
  filesChanged: string[];
}

export async function generateHandoverNote(
  agentOutput: AgentOutput
): Promise<HandoverNote> {
  // Parse agent output to extract structured information
  const parsed = parseAgentOutput(agentOutput.output);
  
  return {
    id: nanoid(),
    fromAgentId: agentOutput.agentId,
    ticketId: agentOutput.ticketId,
    stage: agentOutput.stage,
    
    summary: parsed.summary || 'Work completed for this stage.',
    
    decisions: parsed.decisions || [],
    
    fileChanges: agentOutput.filesChanged.map(path => ({
      path,
      action: 'modified' as const,
      description: `Updated ${path}`,
    })),
    
    openItems: parsed.openItems || [],
    
    recommendations: parsed.recommendations || [],
    
    context: {
      currentState: parsed.currentState || 'Stage completed',
      nextSteps: parsed.nextSteps || [],
      dependencies: parsed.dependencies || [],
    },
    
    createdAt: new Date().toISOString(),
  };
}

function parseAgentOutput(output: string): Partial<{
  summary: string;
  decisions: HandoverNote['decisions'];
  openItems: HandoverNote['openItems'];
  recommendations: string[];
  currentState: string;
  nextSteps: string[];
  dependencies: string[];
}> {
  // Extract structured sections from agent output
  // This is a simplified implementation - real version would use LLM parsing
  
  const sections: Record<string, string> = {};
  const sectionRegex = /## ([\w\s]+)\n([\s\S]*?)(?=\n## |$)/g;
  
  let match;
  while ((match = sectionRegex.exec(output)) !== null) {
    sections[match[1].toLowerCase().trim()] = match[2].trim();
  }

  return {
    summary: sections['summary'] || extractFirstParagraph(output),
    decisions: parseDecisions(sections['decisions'] || ''),
    openItems: parseOpenItems(sections['open items'] || sections['blockers'] || ''),
    recommendations: parseList(sections['recommendations'] || ''),
    currentState: sections['current state'] || '',
    nextSteps: parseList(sections['next steps'] || ''),
    dependencies: parseList(sections['dependencies'] || ''),
  };
}

function extractFirstParagraph(text: string): string {
  const paragraphs = text.split('\n\n');
  return paragraphs[0]?.slice(0, 500) || '';
}

function parseList(text: string): string[] {
  return text
    .split('\n')
    .map(line => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
}

function parseDecisions(text: string): HandoverNote['decisions'] {
  // Parse decision format: "- Decision: rationale"
  return parseList(text).map(line => {
    const [description, rationale] = line.split(':').map(s => s.trim());
    return {
      description: description || line,
      rationale: rationale || '',
    };
  });
}

function parseOpenItems(text: string): HandoverNote['openItems'] {
  return parseList(text).map(line => ({
    type: 'todo' as const,
    description: line,
    priority: 'medium' as const,
  }));
}
```

**Acceptance Criteria:**
- [ ] Handover schema defined
- [ ] Generator extracts structured info
- [ ] Handover notes stored
- [ ] Next agent receives context

---

### Round 7: Mid-Pipeline Approval Gates

[Detailed implementation for approval checkpoints using LangGraph patterns...]

---

## Sub-Phase 4C: Project Pipeline Enhancements (Rounds 8-10)

[Detailed implementation for project wizard, architecture diagrams, templates...]

---

# Phase 5: Testing and Quality

**Duration:** 10 Rounds  
**Gaps Addressed:** TST-01, TST-02, TST-03

[Detailed implementation for Cloudprober, Pact contracts, quality gates...]

---

# Phase 6: Admin and DevEx

**Duration:** 10 Rounds  
**Gaps Addressed:** DEV-01, DEV-02, DEV-03, DEV-04

[Detailed implementation for Refine admin, OpenFeature, Drizzle migrations...]

---

# Phase 7: Final Polish

**Duration:** 10 Rounds  
**Gaps Addressed:** OBS-01, OBS-02, AH-01, AH-02, AH-03, INT-03, IDE-05, IDE-08, IDE-09

[Detailed implementation for MCP registry, anti-hallucination, workspace snapshots...]

---

# Final Validation Checklist

## All 47 Gaps Addressed

| Gap ID | Status | Validation |
|--------|--------|------------|
| CP-01 | DONE | Multi-env config files exist |
| CP-02 | DONE | Config separation works |
| CP-03 | DONE | Teams UI functional |
| SEC-01 | DONE | Tenant isolation verified |
| ORC-01 | DONE | DAG-aware execution works |
| IDE-01 | DONE | Bulk operations work |
| IDE-02 | DONE | File previews work |
| IDE-03 | DONE | DnD file moving works |
| IDE-04 | DONE | Devcontainers work |
| IDE-05 | DONE | Workspace state restores |
| IDE-06 | DONE | Per-user isolation works |
| IDE-07 | DONE | Quotas enforced |
| IDE-08 | DONE | Cron expressions work |
| IDE-09 | DONE | Snapshots work |
| TKT-01 | DONE | Human assignees work |
| TKT-02 | DONE | Watchers work |
| TKT-03 | DONE | Threaded comments work |
| TKT-04 | DONE | Activity feed works |
| TKT-05 | DONE | Code links UI works |
| AGT-01 | DONE | Skills tags work |
| AGT-02 | DONE | Sub-agent spawning works |
| AGT-03 | DONE | Thread isolation works |
| AGT-04 | DONE | Distributed locks work |
| AGT-05 | DONE | Handover notes work |
| AGT-06 | DONE | Approval gates work |
| CLI-01 | DONE | CLI binary works |
| CLI-02 | DONE | Interactive mode works |
| CLI-03 | DONE | Routing rules work |
| CLI-04 | DONE | Ollama works |
| INT-01 | DONE | GitHub webhooks work |
| INT-02 | DONE | Figma webhooks work |
| INT-03 | DONE | MCP registry works |
| INT-04 | DONE | Extension marketplace works |
| INT-05 | DONE | CI runners work |
| AH-01 | DONE | Configurable threshold |
| AH-02 | DONE | Policy versioning works |
| AH-03 | DONE | Red team tests pass |
| TST-01 | DONE | Quality gates block UI |
| TST-02 | DONE | Synthetic monitoring works |
| TST-03 | DONE | Contract tests pass |
| OBS-01 | DONE | Tool call tracing works |
| OBS-02 | DONE | Runbooks complete |
| PP-01 | DONE | Project wizard works |
| PP-02 | DONE | Randomization works |
| PP-03 | DONE | Architecture diagrams work |
| PP-04 | DONE | Phase workflow works |
| DEV-01 | DONE | Admin dashboard works |
| DEV-02 | DONE | Maintenance mode works |
| DEV-03 | DONE | Feature flags work |
| DEV-04 | DONE | Migrations work |

## Final Commands

```bash
# Full validation suite
npm run typecheck
npm run lint
npm run test
npm run e2e
npm run e2e:visual
npm run lighthouse
npm audit

# All should pass with:
# - 0 TypeScript errors
# - 0 lint errors
# - 100% test pass rate
# - 100% E2E pass rate
# - <100 pixel diff in visual regression
# - Lighthouse Performance >70
# - Lighthouse Accessibility >90
# - 0 critical vulnerabilities
```

---

**END OF MASTER IMPLEMENTATION PLAN**
