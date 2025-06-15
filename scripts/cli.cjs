#!/usr/bin/env node

const { spawn } = require("node:child_process");
const { join } = require("node:path");

// Determine the correct binary based on platform and architecture
function getBinaryName() {
	const platform = process.platform;
	const arch = process.arch;

	let binaryName = "backlog-";

	// Map Node.js platform names to Bun target names
	switch (platform) {
		case "linux":
			binaryName += "bun-linux-";
			break;
		case "darwin":
			binaryName += "bun-darwin-";
			break;
		case "win32":
			binaryName += "bun-windows-";
			break;
		default:
			console.error(`Unsupported platform: ${platform}`);
			process.exit(1);
	}

	// Map Node.js arch names to Bun target names
	switch (arch) {
		case "x64":
			binaryName += "x64";
			break;
		case "arm64":
			binaryName += "arm64";
			break;
		default:
			console.error(`Unsupported architecture: ${arch}`);
			process.exit(1);
	}

	// Windows executables have .exe extension
	if (platform === "win32") {
		binaryName += ".exe";
	}

	return binaryName;
}

// Get the binary path
const binaryName = getBinaryName();
const binaryPath = join(__dirname, "bin", binaryName);

// Spawn the binary with all arguments
const child = spawn(binaryPath, process.argv.slice(2), {
	stdio: "inherit",
	windowsHide: true,
});

// Handle exit
child.on("exit", (code) => {
	process.exit(code || 0);
});

// Handle errors
child.on("error", (err) => {
	if (err.code === "ENOENT") {
		console.error(`Binary not found: ${binaryPath}`);
		console.error(`Please ensure you have the correct version for your platform (${process.platform}-${process.arch})`);
	} else {
		console.error("Failed to start backlog:", err);
	}
	process.exit(1);
});
