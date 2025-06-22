---
id: task-100.5
title: Create task management components
status: To Do
assignee: []
created_date: '2025-06-22'
labels: []
dependencies:
  - task-100.1
  - task-100.3
parent_task_id: task-100
---

## Description

Build TaskList, TaskDetail, and TaskForm components. These components will provide alternative views and interaction methods for managing tasks beyond the Kanban board.

## Components Overview

### 1. TaskList Component

```typescript
// components/TaskList.tsx
interface TaskListProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onTaskEdit: (task: Task) => void;
  onTaskArchive: (taskId: string) => void;
}
```

**Features:**
- Table view with sortable columns
- Search bar with real-time filtering
- Filter dropdowns for status, assignee, labels
- Bulk actions (archive multiple, change status)
- Pagination for large task lists
- Export to CSV functionality

**UI Elements (shadcn/ui):**
- `Table` - Main list display
- `Input` - Search field
- `Select` - Filter dropdowns
- `Checkbox` - Bulk selection
- `Button` - Action buttons
- `DropdownMenu` - Context menus

### 2. TaskDetail Component

```typescript
// components/TaskDetail.tsx
interface TaskDetailProps {
  task: Task;
  content: string; // Full markdown content
  onEdit: () => void;
  onClose: () => void;
}
```

**Features:**
- Full-screen modal or side panel view
- Markdown preview with syntax highlighting
- Task metadata display (dates, assignee, labels)
- Dependency visualization
- Subtask hierarchy view
- Activity history (if available)
- Quick edit actions

**UI Elements (shadcn/ui):**
- `Dialog` or `Sheet` - Container
- `Tabs` - Preview/Edit/History views
- `Badge` - Labels and status
- `Separator` - Section dividers
- `ScrollArea` - Content scrolling

### 3. TaskForm Component

```typescript
// components/TaskForm.tsx
interface TaskFormProps {
  task?: Task; // Optional for edit mode
  onSubmit: (task: Partial<Task>) => void;
  onCancel: () => void;
}
```

**Features:**
- Create and edit modes
- Rich markdown editor with preview
- Acceptance criteria builder
- Dependency selector with search
- Label management (add/remove)
- Priority selector
- Parent task selector for subtasks
- Form validation with error messages

**UI Elements (shadcn/ui):**
- `Form` - Form container with validation
- `Input` - Title field
- `Textarea` - Description editor
- `Select` - Status, priority dropdowns
- `MultiSelect` - Labels, dependencies
- `Button` - Submit/Cancel actions
- `Alert` - Validation errors

## Shared Features

### Markdown Support
- Use `react-markdown` for rendering
- Code syntax highlighting with `react-syntax-highlighter`
- Support for task-specific markdown extensions (checklists, etc.)

### Data Fetching
```typescript
// hooks/useTasks.ts
export function useTasks(filters?: TaskFilters) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const fetchTasks = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (filters?.status) params.append('status', filters.status);
      if (filters?.assignee) params.append('assignee', filters.assignee);
      
      const response = await fetch(`/api/tasks?${params}`);
      const data = await response.json();
      setTasks(data.data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    fetchTasks();
  }, [filters]);
  
  return { tasks, isLoading, error, refetch: fetchTasks };
}

export function useTaskMutations() {
  const createTask = async (task: Partial<Task>) => {
    const response = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(task)
    });
    return response.json();
  };
  
  const updateTask = async (id: string, updates: Partial<Task>) => {
    const response = await fetch(`/api/tasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    return response.json();
  };
  
  const archiveTask = async (id: string) => {
    const response = await fetch(`/api/tasks/${id}`, {
      method: 'DELETE'
    });
    return response.json();
  };
  
  return { createTask, updateTask, archiveTask };
}
```

### Error Handling
- Toast notifications for success/error states using shadcn/ui Toast component
- Inline validation messages
- Network error recovery with manual retry buttons
- Optimistic updates with automatic rollback on failure

## Acceptance Criteria

- [ ] TaskList shows filterable list of tasks
- [ ] TaskDetail displays full task information with markdown
- [ ] TaskForm handles create/edit operations
- [ ] All forms validate input properly
- [ ] Components use shadcn/ui consistently
