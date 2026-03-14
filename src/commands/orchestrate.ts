import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { $ } from "bun";
import * as clack from "@clack/prompts";
import type { Core } from "../core/roadmap.ts";

export async function runOrchestrateCommand(core: Core, numAgentsStr: string | undefined): Promise<void> {
	clack.intro("🤖 Multi-Agent Orchestration Setup");

	const rootDir = core.filesystem.rootDir;
	const worktreesDir = join(rootDir, "worktrees");

	let numAgents = 3;
	if (numAgentsStr) {
		const parsed = parseInt(numAgentsStr, 10);
		if (!isNaN(parsed) && parsed > 0) {
			numAgents = parsed;
		}
	} else {
		const result = await clack.text({
			message: "How many executor agents would you like to initialize?",
			defaultValue: "3",
			placeholder: "3",
		});
		if (clack.isCancel(result)) {
			clack.cancel("Operation cancelled.");
			return;
		}
		const parsed = parseInt(result, 10);
		if (!isNaN(parsed) && parsed > 0) {
			numAgents = parsed;
		}
	}

	const spin = clack.spinner();
	spin.start("Setting up Coordinator/Tester environment...");

	// Add worktrees to gitignore
	try {
		const gitignorePath = join(rootDir, ".gitignore");
		const ignoreContent = await Bun.file(gitignorePath).text().catch(() => "");
		if (!ignoreContent.includes("worktrees/")) {
			await Bun.write(gitignorePath, ignoreContent + "\n# Agent worktrees\nworktrees/\n");
		}
	} catch (e) {
		// Ignore if gitignore manipulation fails
	}

	await mkdir(worktreesDir, { recursive: true });

	// Ensure coordinator/tester identity is set on main if not already configured
	try {
		const currentName = await $`git config user.name`.quiet().text();
		if (!currentName.trim()) {
			await $`git config user.name "Coordinator (Human/Agent)"`.quiet();
		}
	} catch {
		await $`git config user.name "Coordinator (Human/Agent)"`.quiet();
	}

	spin.stop("Coordinator environment ready.");

	for (let i = 1; i <= numAgents; i++) {
		const agentName = `agent-${i}`;
		const role = `Feature-Executor-${i}`;
		await setupAgentWorktree(rootDir, worktreesDir, agentName, role);
	}

	clack.outro(`✅ Successfully initialized ${numAgents} agent workspaces in ./worktrees/
  
To interact as an agent, cd into the worktree:
  cd worktrees/agent-1
  
Each workspace has its own git identity pre-configured for auditability.`);
}

export async function runAgentJoinCommand(core: Core, agentName: string, role?: string): Promise<void> {
	clack.intro(`🤖 Adding Agent: ${agentName}`);
	const rootDir = core.filesystem.rootDir;
	const worktreesDir = join(rootDir, "worktrees");
	
	const finalRole = role || "Specialist";

	await mkdir(worktreesDir, { recursive: true });
	await setupAgentWorktree(rootDir, worktreesDir, agentName, finalRole);

	clack.outro(`✅ Agent ${agentName} joined successfully.
Workspace: ./worktrees/${agentName}`);
}

async function setupAgentWorktree(rootDir: string, worktreesDir: string, agentName: string, role: string) {
	const spin = clack.spinner();
	spin.start(`Provisioning workspace for ${agentName}...`);

	const branchName = `feature-${agentName}`;
	const agentDir = join(worktreesDir, agentName);

	try {
		// Check if worktree already exists
		const worktreeList = await $`git worktree list`.cwd(rootDir).quiet().text();
		if (worktreeList.includes(agentDir)) {
			spin.stop(`Workspace for ${agentName} already exists.`);
			return;
		}

		// Try to create branch and worktree
		try {
			await $`git branch ${branchName}`.cwd(rootDir).quiet();
		} catch {
			// Branch might already exist
		}

		await $`git worktree add ${agentDir} ${branchName}`.cwd(rootDir).quiet();

		// Create shared messages symlink
		const sharedMessagesDir = join(rootDir, "roadmap", "messages");
		const agentMessagesDir = join(agentDir, "roadmap", "messages");
		await mkdir(sharedMessagesDir, { recursive: true });
		
		try {
			const { symlink } = require("node:fs/promises");
			// Ensure agent roadmap dir exists
			await mkdir(join(agentDir, "roadmap"), { recursive: true });
			await symlink(sharedMessagesDir, agentMessagesDir, "dir");
		} catch (e) {
			// Ignore if symlink fails (e.g. on Windows without admin)
		}

		// Configure Git identity locally for the agent's worktree
		const gitUserName = `${agentName} (${role})`;
		const gitUserEmail = `${agentName}@agent-roadmap.local`;

		await $`git config user.name "${gitUserName}"`.cwd(agentDir).quiet();
		await $`git config user.email "${gitUserEmail}"`.cwd(agentDir).quiet();

		// 1. Configure OpenClaw (Identity, Soul, Heartbeat, Memory)
		const openClawConfig = {
			identity: {
				name: agentName,
				role: role,
				type: "executor",
			},
			soul: {
				alignment: "You are an autonomous agent contributing to a shared project roadmap.",
				directives: ["Scout local roadmap state", "Map new objectives", "Reach active targets"],
			},
			heartbeat: {
				intervalMs: 60000,
				syncEndpoint: "http://localhost:6420/api/heartbeat",
			},
			memory: {
				localStore: "./.agent-memory",
				sharedStore: "../roadmap/shared",
			},
		};
		await Bun.write(
			join(agentDir, "openclaw.json"),
			JSON.stringify(openClawConfig, null, 2)
		);

		// 2. Configure Claude Code (CLAUDE.md for local context)
		const claudeContext = `# Claude Code Configuration
You are operating as ${gitUserName}.
Your primary role is: ${role}.

## 🚀 YOUR FIRST MISSION
1. **Understand the Vision**: Read \`../../roadmap/DNA.md\`.
2. **Scout the Roadmap**: Read \`../../roadmap/MAP.md\` and run \`roadmap state list -a @${agentName} --plain\`.
3. **Take Ownership**: Pick your first state, move it to "In Progress", and start the Discovery phase.
4. **Refine**: If you discover technical gaps or risks, create new states or obstacles.

**Directives:**
- Always check the \`roadmap/\` directory in the project root to understand your objectives.
- Do NOT push directly to remote origin. Your changes will be synced by the Coordinator.
- Update your assigned state files in \`roadmap/nodes/\` when you make progress.`;
		await Bun.write(join(agentDir, "CLAUDE.md"), claudeContext);

		// 3. Configure Gemini CLI (GEMINI.md for local context)
		const geminiContext = `# Gemini CLI Configuration
You are operating as ${gitUserName}.
Your primary role is: ${role}.

## 🚀 YOUR FIRST MISSION
1. **Understand the Vision**: Read \`../../roadmap/DNA.md\`.
2. **Scout the Roadmap**: Read \`../../roadmap/MAP.md\` and run \`roadmap state list -a @${agentName} --plain\`.
3. **Take Ownership**: Pick your first state, move it to "In Progress", and start the Discovery phase.
4. **Refine**: If you discover technical gaps or risks, create new states or obstacles.

**Directives:**
- Operate strictly within this worktree.
- Read \`roadmap/DNA.md\` and \`roadmap/MAP.md\` to align with project goals.
- Use the MCP server at \`http://localhost:6420\` for real-time roadmap updates.`;
		await Bun.write(join(agentDir, "GEMINI.md"), geminiContext);

		spin.stop(`Provisioned ${agentName} (${role})`);
	} catch (error) {
		spin.stop(`Failed to provision ${agentName}`);
		console.error(error);
	}
}