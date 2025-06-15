#!/usr/bin/env node
/**
 * Idempotent Blessed patch for Bun standalone builds (Backlog.md)
 *
 * Features
 * --------
 * 1. Copies `xterm-256color` terminfo into  resources/terminfo/.
 * 2. Replaces the dynamic widget loader in blessed/lib/widget.js
 *    with static `require` calls so Bun bundles every widget.
 * 3. Injects a Windows‑only early‑return into blessed/lib/tput.js
 *    that feeds the bundled terminfo to Blessed.  The patch is
 *    **idempotent** – running it multiple times removes any previous
 *    patch block before re‑inserting, so brace counts always match.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const blessedDir = path.join(repoRoot, "node_modules", "blessed");
const widgetPath = path.join(blessedDir, "lib", "widget.js");
const tputPath = path.join(blessedDir, "lib", "tput.js");

// -----------------------------------------------------------------------------
// 0. Ensure the xterm-256color terminfo file is present (3 KB)
// -----------------------------------------------------------------------------
try {
	const terminfoSrc = path.join(blessedDir, "usr", "xterm-256color");
	const terminfoDestDir = path.join(repoRoot, "resources", "terminfo");

	// 1 · copy xterm-256color
	const dest256 = path.join(terminfoDestDir, "xterm-256color");
	if (!fs.existsSync(dest256)) {
		fs.mkdirSync(terminfoDestDir, { recursive: true });
		fs.copyFileSync(terminfoSrc, dest256);
		console.log("✓ Copied xterm-256color terminfo → resources/terminfo");
	}

	// 2 · copy plain xterm (same bytes, different name)
	const destShort = path.join(terminfoDestDir, "xterm");
	if (!fs.existsSync(destShort)) {
		fs.copyFileSync(terminfoSrc, destShort);
		console.log("✓ Copied xterm terminfo        → resources/terminfo");
	}
} catch (err) {
	console.error("✗ Failed to copy terminfo:", err.message);
	process.exit(1);
}

// -----------------------------------------------------------------------------
function patchWidget() {
	let src = fs.readFileSync(widgetPath, "utf8");
	if (src.includes("// Static widget imports for bundling")) {
		console.log("✓ widget.js already patched");
		return;
	}

	const dynRegex = /widget\.classes\.forEach\([\s\S]*?\}\);/m;
	if (!dynRegex.test(src)) {
		console.warn("⚠︎ Could not locate dynamic loader in widget.js – Blessed version changed?");
		return;
	}

	src = src.replace(
		dynRegex,
		`// Static widget imports for bundling
var widgets = {
  node: require('./widgets/node'),
  screen: require('./widgets/screen'),
  element: require('./widgets/element'),
  box: require('./widgets/box'),
  text: require('./widgets/text'),
  line: require('./widgets/line'),
  scrollablebox: require('./widgets/scrollablebox'),
  scrollabletext: require('./widgets/scrollabletext'),
  bigtext: require('./widgets/bigtext'),
  list: require('./widgets/list'),
  form: require('./widgets/form'),
  input: require('./widgets/input'),
  textarea: require('./widgets/textarea'),
  textbox: require('./widgets/textbox'),
  button: require('./widgets/button'),
  progressbar: require('./widgets/progressbar'),
  filemanager: require('./widgets/filemanager'),
  checkbox: require('./widgets/checkbox'),
  radioset: require('./widgets/radioset'),
  radiobutton: require('./widgets/radiobutton'),
  prompt: require('./widgets/prompt'),
  question: require('./widgets/question'),
  message: require('./widgets/message'),
  loading: require('./widgets/loading'),
  listbar: require('./widgets/listbar'),
  log: require('./widgets/log'),
  table: require('./widgets/table'),
  listtable: require('./widgets/listtable'),
  layout: require('./widgets/layout')
};

widget.classes.forEach(function(name) {
  var file = name.toLowerCase();
  widget[name] = widget[file] = widgets[file];
});`,
	);

	fs.writeFileSync(widgetPath, src);
	console.log("✓ Patched widget.js → static widget imports");
}

// -----------------------------------------------------------------------------
function patchTput() {
	let src = fs.readFileSync(tputPath, "utf8");

	// Remove any previous BACKLOG_PATCH block to keep idempotent
	const patchRegex = /\/\* BACKLOG_PATCH_BUNDLED_TERMINFO_START[\s\S]*?BACKLOG_PATCH_BUNDLED_TERMINFO_END \*\//g;
	src = src.replace(patchRegex, "");

	if (src.includes("BACKLOG_PATCH_BUNDLED_TERMINFO_START")) {
		// If, after removal, the marker still exists something is wrong
		console.warn("⚠︎ Inconsistent patch markers in tput.js, skipping injection");
		fs.writeFileSync(tputPath, src);
		return;
	}

	// Inject helper const if not present
	if (!src.includes("const _bundledXtermPath ")) {
		src = src.replace(
			"var fs = require('fs');",
			`var fs = require('fs');
       const _bundledXtermPath = path.join(
         __dirname, '..', '..', '..', 'resources', 'terminfo',
         term === 'xterm' ? 'xterm' : 'xterm-256color'
       );`,
		);
	}

	// Find anchor (first readFileSync(file) occurrence in readTerminfo)
	const anchorRegex = /data\s*=\s*fs\.readFileSync\(\s*file\s*\);/;
	if (!anchorRegex.test(src)) {
		console.warn("⚠︎ Could not locate readFileSync anchor in tput.js – Blessed version changed?");
		fs.writeFileSync(tputPath, src);
		return;
	}

	const injected = `
  /* BACKLOG_PATCH_BUNDLED_TERMINFO_START */
  if (process.platform === 'win32') {
    try {
      const bundled = fs.readFileSync(
        require('path').join(__dirname,'..','..','..',
          'resources','terminfo',
          (term === 'xterm' ? 'xterm' : 'xterm-256color'))
      );
      const _info = this.parseTerminfo(bundled, 'bundled-' + term);
      if (this.debug) this._terminfo = _info;
      return _info;
    } catch (e) {
      /* Last-ditch fallback: minimal 256-colour entry so UI works */
      return {
        name: term,
        names: [term],
        desc: 'Minimal fallback (Backlog)',
        bools: {},
        nums: { colors: 256 },
        numbers: { colors: 256 },
        strs: {},
        strings: {},
        acs: {},
        has: () => false,
        termcap: {}
      };
    }
  }
  /* BACKLOG_PATCH_BUNDLED_TERMINFO_END */`;

	src = src.replace(
		anchorRegex,
		(match) => `
    /* BACKLOG_PATCH_BUNDLED_TERMINFO_START */
    if (process.platform === 'win32' && (term === 'xterm' || term === 'xterm-256color')) {
      try {
        var _infoBundled = this.parseTerminfo(
          fs.readFileSync(
            require('path').join(__dirname,'..','..','..','resources','terminfo',
            term === 'xterm' ? 'xterm' : 'xterm-256color')
          ),
          'bundled-' + term
        );
        if (this.debug) this._terminfo = _infoBundled;
        return _infoBundled;
      } catch (_) {/* fallthrough */}
    }
    /* BACKLOG_PATCH_BUNDLED_TERMINFO_END */
    ${match}`,
	);

	fs.writeFileSync(tputPath, src);
	console.log("✓ Patched tput.js → bundled terminfo branch (idempotent)");
}

// -----------------------------------------------------------------------------
patchWidget();
patchTput();
console.log("✓ Blessed patching complete");
