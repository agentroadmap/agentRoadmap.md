# NPM Publishing Setup

This guide explains how to set up npm publishing for the Backlog.md project.

## Prerequisites

1. An npm account with publish permissions for the `@backlog.md` package
2. Repository admin access to configure GitHub secrets

## Setting up the NPM Token

### 1. Generate an npm Access Token

1. Log in to [npmjs.com](https://www.npmjs.com)
2. Click on your profile picture → Access Tokens
3. Click "Generate New Token"
4. Choose "Automation" token type (recommended for CI/CD)
5. Name it something like "backlog-md-github-actions"
6. Copy the generated token (it starts with `npm_`)

### 2. Add the Token to GitHub Secrets

1. Go to the GitHub repository settings
2. Navigate to Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Name: `NPM_TOKEN`
5. Value: Paste your npm token
6. Click "Add secret"

## How Publishing Works

The GitHub Actions workflow (`/.github/workflows/ci.yml`) automatically publishes to npm when:

1. A new git tag is pushed that matches the pattern `v*.*.*` (e.g., `v1.0.0`)
2. The build and tests pass successfully

The workflow:
- Uses `actions/setup-node@v4` to configure npm authentication
- Sets the registry URL to `https://registry.npmjs.org`
- Uses the `NPM_TOKEN` secret for authentication
- Runs `npm publish --access public` to publish the package

## Troubleshooting

### Error: ENEEDAUTH

If you see this error, it means the `NPM_TOKEN` secret is either:
- Not configured in GitHub
- Invalid or expired
- Missing the required publish permissions

### Error: 403 Forbidden

This usually means:
- The token doesn't have permission to publish to the package
- The package name is already taken by another user
- You're not listed as a maintainer of the package

## Manual Publishing (Not Recommended)

If you need to publish manually:

```bash
npm login
bun run build
npm publish --access public
```

Always prefer using the automated workflow to ensure consistency.