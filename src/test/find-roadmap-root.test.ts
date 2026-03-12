import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { clearProjectRootCache, findRoadmapRoot } from "../utils/find-roadmap-root.ts";

describe("findRoadmapRoot", () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = join(tmpdir(), `roadmap-root-test-${Date.now()}`);
		await mkdir(testDir, { recursive: true });
		clearProjectRootCache();
	});

	afterEach(async () => {
		clearProjectRootCache();
		try {
			await rm(testDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	it("should find root when roadmap/ directory exists at start dir", async () => {
		// Create roadmap structure at root
		await mkdir(join(testDir, "roadmap", "nodes"), { recursive: true });

		const result = await findRoadmapRoot(testDir);
		expect(result).toBe(testDir);
	});

	it("should find root when roadmap.json exists at start dir", async () => {
		// Create roadmap.json at root
		await writeFile(join(testDir, "roadmap.json"), JSON.stringify({ name: "Test" }));

		const result = await findRoadmapRoot(testDir);
		expect(result).toBe(testDir);
	});

	it("should find root from a subfolder", async () => {
		// Create roadmap structure at root
		await mkdir(join(testDir, "roadmap", "nodes"), { recursive: true });

		// Create nested subfolder
		const subfolder = join(testDir, "src", "components", "ui");
		await mkdir(subfolder, { recursive: true });

		const result = await findRoadmapRoot(subfolder);
		expect(result).toBe(testDir);
	});

	it("should find root from deeply nested subfolder", async () => {
		// Create roadmap.json at root
		await writeFile(join(testDir, "roadmap.json"), JSON.stringify({ name: "Test" }));

		// Create deeply nested subfolder
		const deepFolder = join(testDir, "a", "b", "c", "d", "e", "f");
		await mkdir(deepFolder, { recursive: true });

		const result = await findRoadmapRoot(deepFolder);
		expect(result).toBe(testDir);
	});

	it("should return null when no roadmap project found", async () => {
		// Create a folder with no roadmap setup
		const emptyFolder = join(testDir, "empty");
		await mkdir(emptyFolder, { recursive: true });

		const result = await findRoadmapRoot(emptyFolder);
		expect(result).toBeNull();
	});

	it("should prefer roadmap/ directory over git root", async () => {
		// Initialize git repo
		await $`git init`.cwd(testDir).quiet();

		// Create roadmap in a subfolder (simulating monorepo)
		const projectFolder = join(testDir, "packages", "my-project");
		await mkdir(join(projectFolder, "roadmap", "nodes"), { recursive: true });

		// Search from within the project
		const searchDir = join(projectFolder, "src");
		await mkdir(searchDir, { recursive: true });

		const result = await findRoadmapRoot(searchDir);
		expect(result).toBe(projectFolder);
	});

	it("should find git root with roadmap as fallback", async () => {
		// Initialize git repo with roadmap at root
		await $`git init`.cwd(testDir).quiet();
		await mkdir(join(testDir, "roadmap", "nodes"), { recursive: true });

		// Create subfolder without its own roadmap
		const subfolder = join(testDir, "packages", "lib");
		await mkdir(subfolder, { recursive: true });

		const result = await findRoadmapRoot(subfolder);
		expect(result).toBe(testDir);
	});

	it("should not use git root if it has no roadmap setup", async () => {
		// Initialize git repo WITHOUT roadmap
		await $`git init`.cwd(testDir).quiet();

		// Create subfolder
		const subfolder = join(testDir, "src");
		await mkdir(subfolder, { recursive: true });

		const result = await findRoadmapRoot(subfolder);
		expect(result).toBeNull();
	});

	it("should handle nested git repos - find nearest roadmap root", async () => {
		// Initialize outer git repo with roadmap
		await $`git init`.cwd(testDir).quiet();
		await mkdir(join(testDir, "roadmap", "nodes"), { recursive: true });

		// Create inner project with its own roadmap (nested repo scenario)
		const innerProject = join(testDir, "packages", "inner");
		await mkdir(innerProject, { recursive: true });
		await $`git init`.cwd(innerProject).quiet();
		await mkdir(join(innerProject, "roadmap", "nodes"), { recursive: true });

		// Search from within inner project
		const innerSrc = join(innerProject, "src");
		await mkdir(innerSrc, { recursive: true });

		const result = await findRoadmapRoot(innerSrc);
		// Should find the inner project's roadmap, not the outer one
		expect(result).toBe(innerProject);
	});

	it("should handle roadmap/ with config.yaml", async () => {
		// Create roadmap structure with config.yaml instead of states/
		await mkdir(join(testDir, "roadmap"), { recursive: true });
		await writeFile(join(testDir, "roadmap", "config.yaml"), "name: Test");

		const result = await findRoadmapRoot(testDir);
		expect(result).toBe(testDir);
	});
});
