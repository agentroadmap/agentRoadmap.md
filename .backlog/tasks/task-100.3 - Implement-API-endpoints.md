---
id: task-100.3
title: Implement API endpoints
status: To Do
assignee: []
created_date: '2025-06-22'
labels: []
dependencies:
  - task-100.2
parent_task_id: task-100
---

## Description

Create REST API endpoints for tasks, drafts, and board operations. These endpoints will provide a clean interface between the React frontend and the existing Backlog.md Core functionality.

## API Design

### RESTful Endpoints

#### Tasks
- `GET /api/tasks` - List all tasks with optional filtering
  - Query params: `?status=todo&assignee=@user&labels=bug,feature`
  - Returns: Array of Task objects with metadata
  
- `GET /api/tasks/:id` - Get specific task details
  - Returns: Task object with full markdown content
  
- `POST /api/tasks` - Create new task
  - Body: `{ title, description, assignee, status, labels, parentId?, dependencies? }`
  - Returns: Created task with generated ID
  
- `PUT /api/tasks/:id` - Update existing task
  - Body: Partial task object with fields to update
  - Returns: Updated task object
  
- `DELETE /api/tasks/:id` - Archive a task
  - Returns: Success message

#### Board
- `GET /api/board` - Get board data with all tasks grouped by status
  - Returns: `{ statuses: string[], tasks: TaskWithMetadata[], config: BoardConfig }`

#### Drafts
- `GET /api/drafts` - List all drafts
  - Returns: Array of Draft objects
  
- `POST /api/drafts/:id/promote` - Promote draft to task
  - Returns: New task object

#### Configuration
- `GET /api/config` - Get project configuration
  - Returns: Config object with statuses, resolution strategy, etc.

### Response Format

All API responses will follow a consistent format:

```typescript
// Success response
{
  "success": true,
  "data": { ... }
}

// Error response
{
  "success": false,
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "Task with ID task-123 not found"
  }
}
```

### Implementation Strategy

Each endpoint will:
1. Parse and validate request parameters
2. Call the appropriate Core method
3. Handle any errors gracefully
4. Return properly formatted JSON response

### Error Handling

- `400 Bad Request` - Invalid input parameters
- `404 Not Found` - Resource doesn't exist
- `409 Conflict` - Operation would create conflict
- `500 Internal Server Error` - Unexpected server error

### Integration with Core

All endpoints will use the existing Core class methods:
- `core.filesystem.listTasks()`
- `core.filesystem.loadTask()`
- `core.createTask()`
- `core.updateTask()`
- `core.archiveTask()`
- `core.filesystem.loadConfig()`
- etc.

This ensures consistency between CLI and web operations.

## Acceptance Criteria

- [ ] GET /api/tasks returns all tasks
- [ ] GET /api/tasks/:id returns specific task
- [ ] POST /api/tasks creates new task
- [ ] PUT /api/tasks/:id updates task
- [ ] DELETE /api/tasks/:id archives task
- [ ] GET /api/board returns board data
- [ ] All endpoints use existing Core functions
