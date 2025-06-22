---
id: task-100.1
title: Setup React project structure with shadcn/ui
status: To Do
assignee: []
created_date: '2025-06-22'
labels: []
dependencies: []
parent_task_id: task-100
---

## Description

Initialize React project with TypeScript, Tailwind CSS, and shadcn/ui. This will be the foundation for the web UI that users will interact with when running `backlog serve`.

## Project Structure

``` markdown
src/web/
├── index.html           - Main HTML entry point
├── main.tsx            - React entry point with app initialization
├── App.tsx             - Root application component
├── components/
│   ├── ui/             - shadcn/ui components (auto-generated)
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── input.tsx
│   │   ├── label.tsx
│   │   ├── select.tsx
│   │   ├── tabs.tsx
│   │   └── ...
│   ├── Board.tsx       - Kanban board component
│   ├── TaskList.tsx    - Task list view component
│   ├── TaskDetail.tsx  - Task detail modal component
│   ├── TaskForm.tsx    - Create/edit task form component
│   └── Navigation.tsx  - Application navigation
├── hooks/              - Custom React hooks
│   ├── useTasks.ts     - Task data fetching and mutations
│   └── useBoard.ts     - Board state management
├── lib/
│   ├── api.ts          - API client functions
│   ├── utils.ts        - Utility functions
│   └── cn.ts           - shadcn/ui class name utility
└── styles/
    └── globals.css     - Global styles + Tailwind imports
```

## Technical Details

### Dependencies

- **react**: ^18.3.0
- **react-dom**: ^18.3.0
- **@types/react**: ^18.3.0
- **@types/react-dom**: ^18.3.0
- **typescript**: ^5.0.0
- **tailwindcss**: ^4.0.0 (IMPORTANT: Use v4, NOT v3)
- **class-variance-authority**: For component variants
- **clsx**: For conditional classes
- **tailwind-merge**: For merging Tailwind classes
- **lucide-react**: For icons used in shadcn/ui components

### Development Dependencies

- **vite**: ^5.0.0
- **@vitejs/plugin-react**: ^4.2.0
- **@tailwindcss/vite**: ^4.0.0 (v4's first-party Vite plugin - replaces PostCSS)

### Configuration Files
- `vite.config.ts` - Vite configuration for dev server and builds
- `tsconfig.json` - TypeScript configuration
- `src/index.css` - Tailwind v4 CSS-first configuration (NO tailwind.config.js needed!)
- `components.json` - shadcn/ui configuration

## ⚠️ CRITICAL: Tailwind CSS v4 Instructions

**DO NOT use Tailwind v3 setup instructions!** This project uses Tailwind CSS v4 which has breaking changes from v3.

### Key Tailwind v4 Changes:
- **CSS-first configuration**: Use `@theme` in CSS instead of `tailwind.config.js`
- **New import syntax**: `@import "tailwindcss"` instead of `@tailwind base;`
- **No PostCSS config needed**: Uses `@tailwindcss/vite` plugin instead
- **Automatic content detection**: No need to configure content paths
- **CSS variables**: Theme uses `--color-*`, `--font-*` namespaces

## Setup Process

### 1. Create Vite Project
```bash
# Create new React + TypeScript project
bun create vite src/web --template react-ts
```

### 2. Configure TypeScript Paths
Update `tsconfig.json`:
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### 3. Install Tailwind CSS v4
```bash
# Install Tailwind v4 and Vite plugin
bun add -D tailwindcss@next @tailwindcss/vite@next
```

### 4. Setup Vite with Tailwind v4 Plugin
Update `vite.config.ts`:
```typescript
import path from "path"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // Add Tailwind v4 Vite plugin
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
```

### 5. Configure Tailwind v4 in CSS
Update `src/index.css`:
```css
@import "tailwindcss";

@theme {
  /* Custom theme configuration can go here */
  /* Example: --color-primary: #3b82f6; */
}
```

### 6. Initialize shadcn/ui
```bash
bunx shadcn@latest init
```

Choose these options:
- Style: New York
- Base color: Neutral
- CSS variables: Yes

**Note**: shadcn/ui will automatically configure itself to work with Tailwind v4.

### 7. Add Components as Needed
```bash
# Example: Add button component
bunx shadcn@latest add button
```

## Tailwind v4 Migration Notes

If you encounter any Tailwind v3 documentation or examples online:

### ❌ DON'T DO (Tailwind v3):
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

```javascript
// tailwind.config.js
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {}
  }
}
```

### ✅ DO THIS (Tailwind v4):
```css
@import "tailwindcss";

@theme {
  --color-primary: #3b82f6;
}
```

```typescript
// vite.config.ts
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [react(), tailwindcss()]
})
```

## Acceptance Criteria

- [ ] React project structure created in src/web/
- [ ] Tailwind CSS configured
- [ ] shadcn/ui installed and configured
- [ ] Basic App.tsx component renders
- [ ] Vite configured for development and production builds
