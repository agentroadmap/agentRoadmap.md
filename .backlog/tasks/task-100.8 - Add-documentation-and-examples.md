---
id: task-100.8
title: Add documentation and examples
status: To Do
assignee: []
created_date: '2025-06-22'
labels: []
dependencies:
  - task-100.1
  - task-100.2
  - task-100.3
  - task-100.4
  - task-100.5
  - task-100.6
  - task-100.7
parent_task_id: task-100
---

## Description

Document web UI usage and development setup. Comprehensive documentation is essential for users to understand and effectively use the new web interface.

## Documentation Structure

### 1. README.md Updates

Add new section after CLI commands:

```markdown
## Web Interface

Backlog.md includes a built-in web server that provides a modern UI for managing tasks.

### Starting the Web Server

```bash
# Start server on default port (3000)
backlog serve

# Start on custom port
backlog serve --port 8080

# Start without opening browser
backlog serve --no-open

# Bind to all interfaces (for remote access)
backlog serve --host 0.0.0.0
```

### Features

- **Interactive Kanban Board**: Drag and drop tasks between statuses
- **Task Management**: Create, edit, and archive tasks with a rich form interface
- **Search & Filter**: Quickly find tasks by title, status, assignee, or labels
- **Markdown Support**: Full markdown rendering with syntax highlighting
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile
- **Dark Mode**: Automatic theme detection with manual toggle

### Screenshots

![Kanban Board View](docs/images/web-board.png)
![Task Detail Modal](docs/images/web-task-detail.png)
![Task List View](docs/images/web-task-list.png)
```

### 2. Development Guide (docs/web-development.md)

```markdown
# Web UI Development Guide

## Prerequisites

- Bun 1.0+ installed
- Node.js 18+ (for some tooling compatibility)

## Setup

1. Clone the repository
2. Install dependencies: `bun install`
3. Start development server: `bun run dev:web`

## Architecture

### Frontend Stack
- React 18 with TypeScript
- shadcn/ui components with Tailwind CSS
- Vite for development and building
- Native fetch API for server communication

### Project Structure
```
src/web/
├── components/     # React components
├── hooks/          # Custom React hooks
├── lib/            # Utilities and API client
└── styles/         # Global CSS
```

### Adding New Components

1. Install shadcn/ui component:
   ```bash
   bunx shadcn@latest add button
   ```

2. Use in your component:
   ```tsx
   import { Button } from "@/components/ui/button"
   ```

### API Integration

All API calls go through `lib/api.ts`:

```typescript
import { api } from '@/lib/api';

// In your component
const { tasks, error, isLoading, refetch } = useTasks();

// Or make direct API calls
const createNewTask = async (taskData) => {
  const result = await api.createTask(taskData);
  refetch(); // Refresh the list
};
```

## Building for Production

```bash
# Build everything
bun run build

# Test production build
bun run preview
```
```

### 3. API Documentation (docs/api.md)

```markdown
# Backlog.md API Reference

The web server exposes a RESTful API for task management.

## Base URL

`http://localhost:3000/api`

## Authentication

Currently, the API does not require authentication as it's designed for local use.

## Endpoints

### Tasks

#### List Tasks
```
GET /api/tasks?status=<status>&assignee=<assignee>
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "task-1",
      "title": "Example task",
      "status": "To Do",
      "assignee": ["@alice"],
      "labels": ["feature", "high-priority"]
    }
  ]
}
```

#### Get Task
```
GET /api/tasks/:id
```

#### Create Task
```
POST /api/tasks
Content-Type: application/json

{
  "title": "New task",
  "description": "Task description",
  "status": "To Do",
  "assignee": ["@alice"],
  "labels": ["bug"]
}
```

#### Update Task
```
PUT /api/tasks/:id
Content-Type: application/json

{
  "status": "In Progress"
}
```

#### Archive Task
```
DELETE /api/tasks/:id
```

### Board

#### Get Board Data
```
GET /api/board
```

Returns tasks grouped by status with configuration.

## Error Responses

```json
{
  "success": false,
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "Task with ID task-123 not found"
  }
}
```

## Status Codes

- 200: Success
- 400: Bad Request
- 404: Not Found
- 500: Internal Server Error
```

### 4. Troubleshooting Guide

Include common issues and solutions:

- Port already in use
- Browser doesn't open automatically
- Assets not loading in production
- CORS errors during development
- Performance optimization tips

### 5. Example Workflows

Document common use cases:
- Setting up a new project with web UI
- Customizing the board layout
- Integrating with CI/CD
- Running on a remote server

## Acceptance Criteria

- [ ] README updated with serve command docs
- [ ] Development setup guide created
- [ ] Screenshots of web UI included
- [ ] API documentation complete
- [ ] Troubleshooting section added
