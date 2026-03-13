const path = require("node:path");
const fs = require("node:fs");

function mapPlatform(platform = process.platform) {
	switch (platform) {
		case "win32":
			return "windows";
		case "darwin":
		case "linux":
			return platform;
		default:
			return platform;
	}
}

function mapArch(arch = process.arch) {
	switch (arch) {
		case "x64":
		case "arm64":
			return arch;
		default:
			return arch;
	}
}

function getPackageName(platform = process.platform, arch = process.arch) {
	return `agent-roadmap-${mapPlatform(platform)}-${mapArch(arch)}`;
}

function resolveBinaryPath(platform = process.platform, arch = process.arch) {
	const packageName = getPackageName(platform, arch);
	const binaryName = `roadmap${platform === "win32" ? ".exe" : ""}`;

	// List of locations to look for the binary
	const locations = [
		// 1. Same node_modules folder (standard for most installs)
		path.join(__dirname, "..", "..", packageName, binaryName),
		// 2. Local dist/ folder (for development/bundled use)
		path.join(__dirname, "..", "dist", binaryName),
		// 3. Current package's node_modules (if it ended up nested)
		path.join(__dirname, "..", "node_modules", packageName, binaryName),
	];

	// Try each location
	for (const loc of locations) {
		const absolutePath = path.resolve(loc);
		if (fs.existsSync(absolutePath)) {
			return absolutePath;
		}
	}

	// Fallback to require.resolve
	try {
		return require.resolve(`${packageName}/${binaryName}`);
	} catch (e) {
		const error = new Error(`Binary package not installed for ${platform}-${arch}. Tried: ${locations.join(", ")}`);
		error.code = "EBINARYNOTFOUND";
		throw error;
	}
}

module.exports = { getPackageName, resolveBinaryPath };
