---
id: task-100.6
title: Add CLI serve command
status: To Do
assignee: []
created_date: '2025-06-22'
labels: []
dependencies:
  - task-100.2
parent_task_id: task-100
---

## Description

Integrate web server into CLI with new serve command. This will provide users with a simple way to start the web interface from the command line.

## Implementation Details

### CLI Command Structure

```typescript
// Add to src/cli.ts
const serveCmd = program.command("serve");

serveCmd
  .description("start web server for Backlog UI")
  .option("-p, --port <number>", "port to run server on", "3000")
  .option("-h, --host <string>", "host to bind server to", "localhost")
  .option("-o, --open", "open browser automatically")
  .option("--no-open", "don't open browser (useful for remote servers)")
  .action(async (options) => {
    // Implementation
  });
```

### Command Implementation

```typescript
import { BacklogServer } from "./server/index.ts";
import { spawn } from "node:child_process";

async function handleServeCommand(options: ServeOptions) {
  const cwd = process.cwd();
  const port = parseInt(options.port) || 3000;
  const host = options.host || "localhost";
  
  // Check if project is initialized
  try {
    const core = new Core(cwd);
    await core.filesystem.loadConfig();
  } catch (error) {
    console.error("No Backlog project found. Run 'backlog init' first.");
    process.exit(1);
  }
  
  // Create and start server
  const server = new BacklogServer(cwd);
  
  console.log(`Starting Backlog server...`);
  
  await server.start({
    port,
    host,
    isDevelopment: process.env.NODE_ENV === "development",
    onStart: () => {
      const url = `http://${host}:${port}`;
      console.log(`\n✨ Backlog server running at ${url}\n`);
      
      // Open browser if requested
      if (options.open !== false) {
        openBrowser(url);
      }
      
      console.log("Press Ctrl+C to stop the server\n");
    }
  });
  
  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\nStopping server...");
    await server.stop();
    process.exit(0);
  });
  
  process.on("SIGTERM", async () => {
    await server.stop();
    process.exit(0);
  });
}
```

### Browser Opening Logic

```typescript
function openBrowser(url: string) {
  const platform = process.platform;
  let command: string;
  
  switch (platform) {
    case "darwin":
      command = "open";
      break;
    case "win32":
      command = "start";
      break;
    default:
      command = "xdg-open";
  }
  
  try {
    spawn(command, [url], { 
      detached: true, 
      stdio: "ignore" 
    }).unref();
  } catch (error) {
    // Silently fail if browser can't be opened
    console.log(`Visit ${url} in your browser`);
  }
}
```

### Error Handling

- **Port already in use**: Suggest alternative port or kill process
- **Permission denied**: Suggest using higher port number (>1024)
- **Network issues**: Clear error messages with troubleshooting tips
- **Missing dependencies**: Check for required build artifacts

### Development Mode

When `NODE_ENV=development`, the server will:
- Provide detailed error messages
- Enable source maps
- Show helpful debugging information

### Production Mode

In production, the server will:
- Serve optimized, minified assets
- Enable caching headers
- Compress responses
- Hide detailed error messages

## Acceptance Criteria

- [ ] `backlog serve` starts the web server
- [ ] --port option configures port
- [ ] --open option opens browser automatically
- [ ] --host option configures binding address
- [ ] Server stops gracefully on Ctrl+C
