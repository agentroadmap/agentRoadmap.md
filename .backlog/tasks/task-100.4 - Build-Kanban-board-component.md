---
id: task-100.4
title: Build Kanban board component
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

Create interactive Kanban board using React and shadcn/ui. This will be the main view for users to visualize and manage their tasks in a familiar Kanban-style interface.

## Component Design

### Board Structure

```typescript
// components/Board.tsx
interface BoardProps {
  tasks: TaskWithMetadata[];
  statuses: string[];
  onTaskMove: (taskId: string, newStatus: string) => void;
  onTaskClick: (task: Task) => void;
}
```

### Features

#### 1. Drag and Drop
- Use `@dnd-kit/sortable` for smooth drag-and-drop
- Visual feedback during drag operations
- Snap-to-column behavior
- Touch support for mobile devices

#### 2. Task Cards
Each task card will display:
- Task ID (e.g., task-42)
- Task title
- Assignee avatar/initials
- Priority indicator (color-coded)
- Label badges
- Subtask count (if applicable)

#### 3. Column Layout
- Dynamic columns based on configured statuses
- Column headers with task counts
- Horizontal scrolling for many columns
- Column width constraints for readability

#### 4. Responsive Design
- **Desktop**: Multi-column horizontal layout
- **Tablet**: Scrollable columns with touch support
- **Mobile**: Stacked vertical layout with collapsible columns

### UI Components (shadcn/ui)

- `Card` - For task cards and column containers
- `Badge` - For labels and status indicators
- `Avatar` - For assignee display
- `ScrollArea` - For column content scrolling
- `Skeleton` - For loading states

### State Management

```typescript
// hooks/useBoard.ts
export function useBoard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const fetchTasks = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/tasks');
      const data = await response.json();
      setTasks(data.data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };
  
  const moveTask = async (taskId: string, newStatus: string) => {
    try {
      // Optimistic update
      setTasks(prev => prev.map(task => 
        task.id === taskId ? { ...task, status: newStatus } : task
      ));
      
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
    } catch (err) {
      // Rollback on error
      fetchTasks();
      setError(err.message);
    }
  };
  
  useEffect(() => {
    fetchTasks();
  }, []);
  
  return {
    tasks,
    isLoading,
    error,
    moveTask,
    refetch: fetchTasks
  };
}
```

### Performance Optimizations

- Virtual scrolling for large task lists
- Memoized task cards to prevent unnecessary re-renders
- Optimistic updates for drag operations
- Debounced API calls for moves

### Accessibility

- Keyboard navigation support
- ARIA labels for screen readers
- Focus management during interactions
- High contrast mode support

## Acceptance Criteria

- [ ] Board displays tasks grouped by status
- [ ] Drag and drop functionality works
- [ ] Tasks show title ID and assignee
- [ ] Board is responsive on mobile
- [ ] Loading and error states handled
