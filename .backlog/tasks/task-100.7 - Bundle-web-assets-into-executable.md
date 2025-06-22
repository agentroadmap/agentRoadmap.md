---
id: task-100.7
title: Bundle web assets into executable
status: To Do
assignee: []
created_date: '2025-06-22'
labels: []
dependencies:
  - task-100.1
  - task-100.2
  - task-100.6
parent_task_id: task-100
---

## Description

Configure build process to embed React app in CLI executable. This is crucial for distributing Backlog as a single binary that contains both the CLI and web UI.

## Build Process Overview

### Build Process Requirements

**Two-Stage Build:**
1. Build React app to optimized static files
2. Embed static files into CLI executable

**Asset Embedding Strategy:**
- Generate TypeScript file with embedded assets as string constants
- Support automatic asset discovery from build output
- Handle asset manifest for proper file referencing

**Build Script Requirements:**
- Recursively read all files from React build output
- Generate TypeScript module with embedded assets
- Integrate with existing CLI build process

**Vite Configuration Requirements:**
- Configure production build optimization
- Set up code splitting for vendor libraries
- Enable proper asset hashing for cache busting
- Optimize bundle size with tree shaking and minification

**Static Asset Serving:**
- Serve embedded assets from memory at runtime
- Handle proper MIME types for different file extensions
- Implement appropriate caching headers
- Support SPA routing (fallback to index.html)

**Package Scripts Integration:**
- Create coordinated build process
- Ensure proper build order (web → embed → CLI)
- Support both development and production builds

### 7. Optimization Techniques

- **Code Splitting**: Separate vendor chunks for better caching
- **Tree Shaking**: Remove unused code
- **Minification**: Terser for JS, cssnano for CSS
- **Compression**: Brotli compression for text assets
- **Asset Hashing**: For cache busting
- **Lazy Loading**: Dynamic imports for route-based splitting

## Acceptance Criteria

- [ ] Vite builds React app to dist/
- [ ] Build script embeds assets in executable
- [ ] Embedded assets served correctly at runtime
- [ ] Production build is optimized
- [ ] Works with bun build --compile
