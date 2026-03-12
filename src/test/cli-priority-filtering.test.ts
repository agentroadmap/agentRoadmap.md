import { describe, expect, test } from "bun:test";
import { $ } from "bun";

describe("CLI Priority Filtering", () => {
	test("state list --priority high shows only high priority states", async () => {
		const result = await $`bun run cli state list --priority high --plain`.quiet();
		expect(result.exitCode).toBe(0);

		// Should only show high priority states
		const output = result.stdout.toString();
		if (output.includes("state-")) {
			// If states exist, check they have HIGH priority indicators
			expect(output).toMatch(/\[HIGH\]/);
			// Should not contain other priority indicators
			expect(output).not.toMatch(/\[MEDIUM\]/);
			expect(output).not.toMatch(/\[LOW\]/);
		}
	});

	test("state list --priority medium shows only medium priority states", async () => {
		const result = await $`bun run cli state list --priority medium --plain`.quiet();
		expect(result.exitCode).toBe(0);

		const output = result.stdout.toString();
		if (output.includes("state-")) {
			expect(output).toMatch(/\[MEDIUM\]/);
			expect(output).not.toMatch(/\[HIGH\]/);
			expect(output).not.toMatch(/\[LOW\]/);
		}
	});

	test("state list --priority low shows only low priority states", async () => {
		const result = await $`bun run cli state list --priority low --plain`.quiet();
		expect(result.exitCode).toBe(0);

		const output = result.stdout.toString();
		if (output.includes("state-")) {
			expect(output).toMatch(/\[LOW\]/);
			expect(output).not.toMatch(/\[HIGH\]/);
			expect(output).not.toMatch(/\[MEDIUM\]/);
		}
	});

	test("state list --priority invalid shows error", async () => {
		const result = await $`bun run cli state list --priority invalid --plain`.nothrow().quiet();
		expect(result.exitCode).toBe(1);
		expect(result.stderr.toString()).toContain("Invalid priority: invalid");
		expect(result.stderr.toString()).toContain("Valid values are: high, medium, low");
	});

	test("state list --sort priority sorts by priority", async () => {
		const result = await $`bun run cli state list --sort priority --plain`.quiet();
		expect(result.exitCode).toBe(0);

		const output = result.stdout.toString();
		// If states exist, high priority should come before medium, which comes before low
		if (output.includes("[HIGH]") && output.includes("[MEDIUM]")) {
			const highIndex = output.indexOf("[HIGH]");
			const mediumIndex = output.indexOf("[MEDIUM]");
			expect(highIndex).toBeLessThan(mediumIndex);
		}
		if (output.includes("[MEDIUM]") && output.includes("[LOW]")) {
			const mediumIndex = output.indexOf("[MEDIUM]");
			const lowIndex = output.indexOf("[LOW]");
			expect(mediumIndex).toBeLessThan(lowIndex);
		}
	});

	test("state list --sort id sorts by state ID", async () => {
		const result = await $`bun run cli state list --sort id --plain`.quiet();
		expect(result.exitCode).toBe(0);
		// Should exit successfully - detailed sorting verification would require known test data
	});

	test("state list --sort invalid shows error", async () => {
		const result = await $`bun run cli state list --sort invalid --plain`.nothrow().quiet();
		expect(result.exitCode).toBe(1);
		expect(result.stderr.toString()).toContain("Invalid sort field: invalid");
		expect(result.stderr.toString()).toContain("Valid values are: priority, id");
	});

	test("state list combines priority filter with status filter", async () => {
		const result = await $`bun run cli state list --priority high --status "To Do" --plain`.quiet();
		expect(result.exitCode).toBe(0);

		const output = result.stdout.toString();
		if (output.includes("state-")) {
			// Should only show high priority states in "To Do" status
			expect(output).toMatch(/\[HIGH\]/);
			expect(output).toMatch(/To Do:/);
		}
	});

	test("state list combines priority filter with sort", async () => {
		const result = await $`bun run cli state list --priority high --sort id --plain`.quiet();
		expect(result.exitCode).toBe(0);

		const output = result.stdout.toString();
		if (output.includes("[HIGH]")) {
			// Should only show high priority states, sorted by ID
			expect(output).toMatch(/\[HIGH\]/);
			expect(output).not.toMatch(/\[MEDIUM\]/);
			expect(output).not.toMatch(/\[LOW\]/);
		}
	});

	test("plain output includes priority indicators", async () => {
		const result = await $`bun run cli state list --plain`.quiet();
		expect(result.exitCode).toBe(0);

		const output = result.stdout.toString();
		// If any priority states exist, they should have proper indicators
		if (output.includes("state-")) {
			// Should have proper format with optional priority indicators
			expect(output).toMatch(/^\s*(\[HIGH\]|\[MEDIUM\]|\[LOW\])?\s*state-\d+\s+-\s+/m);
		}
	});

	test("case insensitive priority filtering", async () => {
		const upperResult = await $`bun run cli state list --priority HIGH --plain`.quiet();
		const lowerResult = await $`bun run cli state list --priority high --plain`.quiet();
		const mixedResult = await $`bun run cli state list --priority High --plain`.quiet();

		expect(upperResult.exitCode).toBe(0);
		expect(lowerResult.exitCode).toBe(0);
		expect(mixedResult.exitCode).toBe(0);

		const [upperOutput, lowerOutput, mixedOutput] = [
			upperResult.stdout.toString(),
			lowerResult.stdout.toString(),
			mixedResult.stdout.toString(),
		];
		const listUpper = upperOutput.split("\n").filter((line) => line.includes("state-"));
		const listLower = lowerOutput.split("\n").filter((line) => line.includes("state-"));
		const listMixed = mixedOutput.split("\n").filter((line) => line.includes("state-"));
		if (listLower.length > 0) {
			expect(listUpper).toEqual(listLower);
			expect(listMixed).toEqual(listLower);
		}

		for (const output of [upperOutput, lowerOutput, mixedOutput]) {
			if (output.includes("state-")) {
				expect(output).toMatch(/\[HIGH\]/);
				expect(output).not.toMatch(/\[MEDIUM\]/);
				expect(output).not.toMatch(/\[LOW\]/);
			}
		}
	});
});
