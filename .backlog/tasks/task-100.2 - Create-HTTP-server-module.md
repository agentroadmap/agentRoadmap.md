---
id: task-100.2
title: Create HTTP server module
status: To Do
assignee: []
created_date: '2025-06-22'
labels: []
dependencies:
  - task-100.1
parent_task_id: task-100
---

## Description

Implement Bun HTTP server that serves API and static files. This server will be embedded in the CLI executable and serve both the React frontend and API endpoints.

## Implementation Details

### Server Architecture

The server module will use Bun's native `Bun.serve()` API to create a high-performance HTTP server. It will handle:

1. **Static File Serving**: Serve the bundled React app from memory
2. **API Routes**: RESTful endpoints for task operations
3. **Single Origin**: Serve both frontend and API from the same localhost origin

### Key Components

```typescript
// src/server/index.ts
interface ServerOptions {
  port: number;
  host: string;
  isDevelopment: boolean;
  onStart?: () => void;
}

export class BacklogServer {
  private server: Server | null = null;
  private core: Core;
  
  constructor(projectPath: string) {
    this.core = new Core(projectPath);
  }
  
  async start(options: ServerOptions): Promise<void> {
    // Implementation details
  }
  
  async stop(): Promise<void> {
    // Graceful shutdown
  }
}
```

### Route Handler Structure

```typescript
const routes = {
  '/api/health': handleHealthCheck,
  '/api/tasks': handleTasks,
  '/api/tasks/:id': handleTaskById,
  '/api/board': handleBoard,
  '/api/config': handleConfig,
  // Static file serving for everything else
};
```

### Request Handling

The server will handle both API routes and static file serving from a single origin:

```typescript
const handleRequest = (req: Request): Response => {
  const url = new URL(req.url);
  
  // API routes
  if (url.pathname.startsWith('/api/')) {
    return handleApiRequest(req);
  }
  
  // Static files (React app)
  return serveStaticAsset(url.pathname);
};
```

### Static Asset Handling

In production, the server will serve embedded assets:
- HTML, CSS, and JS files bundled during build
- Assets stored as string constants in the executable
- Proper MIME type handling for different file types
- Efficient caching headers for static assets

### Error Handling

- Proper HTTP status codes for different scenarios
- JSON error responses with clear messages
- Graceful handling of file system errors
- Request validation and sanitization

## Acceptance Criteria

- [ ] Server module created at src/server/index.ts
- [ ] Server can be started on configurable port
- [ ] Serves static files from memory
- [ ] Handles both API routes and static files from single origin
- [ ] Basic health check endpoint works
