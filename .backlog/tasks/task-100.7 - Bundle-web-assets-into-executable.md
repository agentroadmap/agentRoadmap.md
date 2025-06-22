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

### 1. Two-Stage Build Process

```bash
# Stage 1: Build React app
cd src/web && bun run build

# Stage 2: Compile CLI with embedded assets
bun build --compile --minify --sourcemap src/cli.ts --outfile=backlog
```

### 2. Asset Embedding Strategy

```typescript
// src/server/embedded-assets.ts
// Auto-generated during build
export const EMBEDDED_ASSETS = {
  "index.html": `<!DOCTYPE html>...`,
  "assets/main-[hash].js": `...minified js...`,
  "assets/main-[hash].css": `...minified css...`,
  // All other assets
} as const;

export const ASSET_MANIFEST = {
  "main.js": "assets/main-[hash].js",
  "main.css": "assets/main-[hash].css",
} as const;
```

### 3. Build Script Implementation

```typescript
// scripts/build-web.ts
import { readdir, readFile } from "fs/promises";
import { join } from "path";

async function embedWebAssets() {
  const distPath = join(process.cwd(), "src/web/dist");
  const assets: Record<string, string> = {};
  
  // Recursively read all files in dist
  async function readDir(dir: string, prefix = "") {
    const entries = await readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const assetPath = join(prefix, entry.name);
      
      if (entry.isDirectory()) {
        await readDir(fullPath, assetPath);
      } else {
        const content = await readFile(fullPath, "utf-8");
        assets[assetPath] = content;
      }
    }
  }
  
  await readDir(distPath);
  
  // Generate TypeScript file
  const output = `
    // Auto-generated file - DO NOT EDIT
    export const EMBEDDED_ASSETS = ${JSON.stringify(assets, null, 2)} as const;
  `;
  
  await Bun.write("src/server/embedded-assets.ts", output);
}
```

### 4. Vite Configuration

```typescript
// src/web/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'ui-vendor': ['class-variance-authority', 'clsx', 'tailwind-merge'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

### 5. Serving Embedded Assets

```typescript
// src/server/static-handler.ts
import { EMBEDDED_ASSETS } from "./embedded-assets.ts";

export function serveStaticAsset(path: string): Response | null {
  // Remove leading slash
  const assetPath = path.startsWith('/') ? path.slice(1) : path;
  
  // Default to index.html for root
  const finalPath = assetPath === '' ? 'index.html' : assetPath;
  
  const content = EMBEDDED_ASSETS[finalPath];
  if (!content) {
    return null;
  }
  
  // Determine content type
  const contentType = getContentType(finalPath);
  
  return new Response(content, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': finalPath.includes('assets/') 
        ? 'public, max-age=31536000' // 1 year for hashed assets
        : 'no-cache', // No cache for index.html
    },
  });
}
```

### 6. Package.json Scripts

```json
{
  "scripts": {
    "build:web": "cd src/web && bun run build",
    "embed:assets": "bun scripts/build-web.ts",
    "build": "bun build:web && bun embed:assets && bun build:cli",
    "build:cli": "bun build --compile --minify --sourcemap src/cli.ts --outfile=backlog"
  }
}
```

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
