import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../core/roadmap.ts";
import { createUniqueTestDir, isWindows, safeCleanup } from "./test-utils.ts";

describe("Symlinked roadmap root", () => {
	const itIfSymlinks = isWindows() ? it.skip : it;
	let repoDir: string;
	let roadmapDir: string;

	beforeEach(async () => {
		repoDir = createUniqueTestDir("test-symlink-root-repo");
		roadmapDir = createUniqueTestDir("test-symlink-root-roadmap");
		await mkdir(repoDir, { recursive: true });
		await mkdir(roadmapDir, { recursive: true });
	});

	afterEach(async () => {
		await safeCleanup(repoDir);
		await safeCleanup(roadmapDir);
	});

	itIfSymlinks("creates states when roadmap root is a symlink and autoCommit is false", async () => {
		await mkdir(join(roadmapDir, "nodes"), { recursive: true });
		await mkdir(join(roadmapDir, "drafts"), { recursive: true });
		await writeFile(
			join(roadmapDir, "config.yml"),
			`project_name: "Symlink Root"
statuses: ["To Do", "In Progress", "Done"]
auto_commit: false
`,
		);

		await symlink(roadmapDir, join(repoDir, "roadmap"));

		const core = new Core(repoDir);
		const { state } = await core.createStateFromInput({ title: "Symlink root state" });

		const files = await Array.fromAsync(new Bun.Glob("state-*.md").scan({ cwd: join(roadmapDir, "nodes") }));
		expect(files.length).toBe(1);
		expect(state.id).toBe("STATE-1");

		const states = await core.listStatesWithMetadata();
		expect(states).toHaveLength(1);
		expect(states[0]?.id).toBe("STATE-1");
	});

	itIfSymlinks("auto-commit writes to the symlinked roadmap repo when enabled", async () => {
		await $`git init`.cwd(roadmapDir).quiet();
		await $`git config user.email test@example.com`.cwd(roadmapDir).quiet();
		await $`git config user.name "Test User"`.cwd(roadmapDir).quiet();
		await writeFile(join(roadmapDir, "README.md"), "# Roadmap Repo");
		await $`git add README.md`.cwd(roadmapDir).quiet();
		await $`git commit -m "Initial commit"`.cwd(roadmapDir).quiet();

		await mkdir(join(roadmapDir, "nodes"), { recursive: true });
		await mkdir(join(roadmapDir, "drafts"), { recursive: true });
		await writeFile(
			join(roadmapDir, "config.yml"),
			`project_name: "Symlink Root"
statuses: ["To Do", "In Progress", "Done"]
auto_commit: true
`,
		);

		await symlink(roadmapDir, join(repoDir, "roadmap"));

		const core = new Core(repoDir);
		await core.createStateFromInput({ title: "Symlink root auto-commit" });

		const { stdout } = await $`git log -1 --pretty=format:%s`.cwd(roadmapDir).quiet();
		expect(stdout.toString()).toContain("Create state");
	});
});
