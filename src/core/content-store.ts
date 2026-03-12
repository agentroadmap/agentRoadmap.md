import { type FSWatcher, watch } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";
import type { FileSystem } from "../file-system/operations.ts";
import { parseDecision, parseDocument, parseState } from "../markdown/parser.ts";
import type { Decision, Document, State, StateListFilter } from "../types/index.ts";
import { normalizeStateId, normalizeStateIdentity, stateIdsEqual } from "../utils/state-path.ts";
import { sortByStateId } from "../utils/state-sorting.ts";

interface ContentSnapshot {
	states: State[];
	documents: Document[];
	decisions: Decision[];
}

type ContentStoreEventType = "ready" | "states" | "documents" | "decisions";

export type ContentStoreEvent =
	| { type: "ready"; snapshot: ContentSnapshot; version: number }
	| { type: "states"; states: State[]; snapshot: ContentSnapshot; version: number }
	| { type: "documents"; documents: Document[]; snapshot: ContentSnapshot; version: number }
	| { type: "decisions"; decisions: Decision[]; snapshot: ContentSnapshot; version: number };

export type ContentStoreListener = (event: ContentStoreEvent) => void;

interface WatchHandle {
	stop(): void;
}

export class ContentStore {
	private initialized = false;
	private initializing: Promise<void> | null = null;
	private version = 0;

	private readonly states = new Map<string, State>();
	private readonly documents = new Map<string, Document>();
	private readonly decisions = new Map<string, Decision>();

	private cachedStates: State[] = [];
	private cachedDocuments: Document[] = [];
	private cachedDecisions: Decision[] = [];

	private readonly listeners = new Set<ContentStoreListener>();
	private readonly watchers: WatchHandle[] = [];
	private restoreFilesystemPatch?: () => void;
	private chainTail: Promise<void> = Promise.resolve();
	private watchersInitialized = false;
	private configWatcherActive = false;

	private attachWatcherErrorHandler(watcher: FSWatcher, context: string): void {
		watcher.on("error", (error) => {
			if (process.env.DEBUG) {
				console.warn(`Watcher error (${context})`, error);
			}
		});
	}

	constructor(
		private readonly filesystem: FileSystem,
		private readonly stateLoader?: () => Promise<State[]>,
		private readonly enableWatchers = false,
	) {
		this.patchFilesystem();
	}

	subscribe(listener: ContentStoreListener): () => void {
		this.listeners.add(listener);

		if (this.initialized) {
			listener({ type: "ready", snapshot: this.getSnapshot(), version: this.version });
		} else {
			void this.ensureInitialized();
		}

		return () => {
			this.listeners.delete(listener);
		};
	}

	async ensureInitialized(): Promise<ContentSnapshot> {
		if (this.initialized) {
			return this.getSnapshot();
		}

		if (!this.initializing) {
			this.initializing = this.loadInitialData().catch((error) => {
				this.initializing = null;
				throw error;
			});
		}

		await this.initializing;
		return this.getSnapshot();
	}

	getStates(filter?: StateListFilter): State[] {
		if (!this.initialized) {
			throw new Error("ContentStore not initialized. Call ensureInitialized() first.");
		}

		let states = this.cachedStates;
		if (filter?.status) {
			const statusLower = filter.status.toLowerCase();
			states = states.filter((state) => state.status.toLowerCase() === statusLower);
		}
		if (filter?.assignee) {
			const assignee = filter.assignee;
			states = states.filter((state) => state.assignee.includes(assignee));
		}
		if (filter?.priority) {
			const priority = filter.priority.toLowerCase();
			states = states.filter((state) => (state.priority ?? "").toLowerCase() === priority);
		}
		if (filter?.parentStateId) {
			const parentFilter = filter.parentStateId;
			states = states.filter((state) => state.parentStateId && stateIdsEqual(parentFilter, state.parentStateId));
		}

		return states.slice();
	}

	upsertState(state: State): void {
		if (!this.initialized) {
			return;
		}
		this.states.set(state.id, state);
		this.cachedStates = sortByStateId(Array.from(this.states.values()));
		this.notify("states");
	}

	getDocuments(): Document[] {
		if (!this.initialized) {
			throw new Error("ContentStore not initialized. Call ensureInitialized() first.");
		}
		return this.cachedDocuments.slice();
	}

	getDecisions(): Decision[] {
		if (!this.initialized) {
			throw new Error("ContentStore not initialized. Call ensureInitialized() first.");
		}
		return this.cachedDecisions.slice();
	}

	getSnapshot(): ContentSnapshot {
		return {
			states: this.cachedStates.slice(),
			documents: this.cachedDocuments.slice(),
			decisions: this.cachedDecisions.slice(),
		};
	}

	dispose(): void {
		if (this.restoreFilesystemPatch) {
			this.restoreFilesystemPatch();
			this.restoreFilesystemPatch = undefined;
		}
		for (const watcher of this.watchers) {
			try {
				watcher.stop();
			} catch {
				// Ignore watcher shutdown errors
			}
		}
		this.watchers.length = 0;
		this.watchersInitialized = false;
	}

	private emit(event: ContentStoreEvent): void {
		for (const listener of [...this.listeners]) {
			listener(event);
		}
	}

	private notify(type: ContentStoreEventType): void {
		this.version += 1;
		const snapshot = this.getSnapshot();

		if (type === "states") {
			this.emit({ type, states: snapshot.states, snapshot, version: this.version });
			return;
		}

		if (type === "documents") {
			this.emit({ type, documents: snapshot.documents, snapshot, version: this.version });
			return;
		}

		if (type === "decisions") {
			this.emit({ type, decisions: snapshot.decisions, snapshot, version: this.version });
			return;
		}

		this.emit({ type: "ready", snapshot, version: this.version });
	}

	private async loadInitialData(): Promise<void> {
		await this.filesystem.ensureRoadmapStructure();

		// Use custom state loader if provided (e.g., loadStates for cross-branch support)
		// Otherwise fall back to filesystem-only loading
		const [states, documents, decisions] = await Promise.all([
			this.loadStatesWithLoader(),
			this.filesystem.listDocuments(),
			this.filesystem.listDecisions(),
		]);

		this.replaceStates(states);
		this.replaceDocuments(documents);
		this.replaceDecisions(decisions);

		this.initialized = true;
		if (this.enableWatchers) {
			await this.setupWatchers();
		}
		this.notify("ready");
	}

	private async setupWatchers(): Promise<void> {
		if (this.watchersInitialized) return;
		this.watchersInitialized = true;

		try {
			this.watchers.push(this.createStateWatcher());
		} catch (error) {
			if (process.env.DEBUG) {
				console.error("Failed to initialize state watcher", error);
			}
		}

		try {
			this.watchers.push(this.createDecisionWatcher());
		} catch (error) {
			if (process.env.DEBUG) {
				console.error("Failed to initialize decision watcher", error);
			}
		}

		try {
			const docWatcher = await this.createDocumentWatcher();
			this.watchers.push(docWatcher);
		} catch (error) {
			if (process.env.DEBUG) {
				console.error("Failed to initialize document watcher", error);
			}
		}

		try {
			const configWatcher = this.createConfigWatcher();
			if (configWatcher) {
				this.watchers.push(configWatcher);
				this.configWatcherActive = true;
			}
		} catch (error) {
			if (process.env.DEBUG) {
				console.error("Failed to initialize config watcher", error);
			}
		}
	}

	/**
	 * Retry setting up the config watcher after initialization.
	 * Called when the config file is created after the server started.
	 */
	ensureConfigWatcher(): void {
		if (this.configWatcherActive) {
			return;
		}
		try {
			const configWatcher = this.createConfigWatcher();
			if (configWatcher) {
				this.watchers.push(configWatcher);
				this.configWatcherActive = true;
			}
		} catch (error) {
			if (process.env.DEBUG) {
				console.error("Failed to setup config watcher after init", error);
			}
		}
	}

	private createConfigWatcher(): WatchHandle | null {
		const configPath = this.filesystem.configFilePath;
		try {
			const watcher: FSWatcher = watch(configPath, (eventType) => {
				if (eventType !== "change" && eventType !== "rename") {
					return;
				}
				this.enqueue(async () => {
					this.filesystem.invalidateConfigCache();
					this.notify("states");
				});
			});
			this.attachWatcherErrorHandler(watcher, "config");

			return {
				stop() {
					watcher.close();
				},
			};
		} catch (error) {
			if (process.env.DEBUG) {
				console.error("Failed to watch config file", error);
			}
			return null;
		}
	}

	private createStateWatcher(): WatchHandle {
		const statesDir = this.filesystem.statesDir;
		const watcher: FSWatcher = watch(statesDir, { recursive: false }, (eventType, filename) => {
			const file = this.normalizeFilename(filename);
			// Accept any prefix pattern (state-, jira-, etc.) followed by ID and ending in .md
			if (!file || !/^[a-zA-Z]+-/.test(file) || !file.endsWith(".md")) {
				this.enqueue(async () => {
					await this.refreshStatesFromDisk();
				});
				return;
			}

			this.enqueue(async () => {
				const [stateId] = file.split(" ");
				if (!stateId) return;
				const normalizedStateId = normalizeStateId(stateId);

				const fullPath = join(statesDir, file);
				const exists = await Bun.file(fullPath).exists();

				if (!exists && eventType === "rename") {
					if (this.states.delete(normalizedStateId)) {
						this.cachedStates = sortByStateId(Array.from(this.states.values()));
						this.notify("states");
					}
					return;
				}

				if (eventType === "rename" && exists) {
					await this.refreshStatesFromDisk();
					return;
				}

				const previous = this.states.get(normalizedStateId);
				const state = await this.retryRead(
					async () => {
						const stillExists = await Bun.file(fullPath).exists();
						if (!stillExists) {
							return null;
						}
						const content = await Bun.file(fullPath).text();
						return normalizeStateIdentity(parseState(content));
					},
					(result) => {
						if (!result) {
							return false;
						}
						if (!stateIdsEqual(result.id, normalizedStateId)) {
							return false;
						}
						if (!previous) {
							return true;
						}
						return this.hasStateChanged(previous, result);
					},
				);
				if (!state) {
					await this.refreshStatesFromDisk(normalizedStateId, previous);
					return;
				}

				this.states.set(state.id, state);
				this.cachedStates = sortByStateId(Array.from(this.states.values()));
				this.notify("states");
			});
		});
		this.attachWatcherErrorHandler(watcher, "states");

		return {
			stop() {
				watcher.close();
			},
		};
	}

	private createDecisionWatcher(): WatchHandle {
		const decisionsDir = this.filesystem.decisionsDir;
		const watcher: FSWatcher = watch(decisionsDir, { recursive: false }, (eventType, filename) => {
			const file = this.normalizeFilename(filename);
			if (!file || !file.startsWith("decision-") || !file.endsWith(".md")) {
				this.enqueue(async () => {
					await this.refreshDecisionsFromDisk();
				});
				return;
			}

			this.enqueue(async () => {
				const [idPart] = file.split(" - ");
				if (!idPart) return;

				const fullPath = join(decisionsDir, file);
				const exists = await Bun.file(fullPath).exists();

				if (!exists && eventType === "rename") {
					if (this.decisions.delete(idPart)) {
						this.cachedDecisions = sortByStateId(Array.from(this.decisions.values()));
						this.notify("decisions");
					}
					return;
				}

				if (eventType === "rename" && exists) {
					await this.refreshDecisionsFromDisk();
					return;
				}

				const previous = this.decisions.get(idPart);
				const decision = await this.retryRead(
					async () => {
						try {
							const content = await Bun.file(fullPath).text();
							return parseDecision(content);
						} catch {
							return null;
						}
					},
					(result) => {
						if (!result) {
							return false;
						}
						if (result.id !== idPart) {
							return false;
						}
						if (!previous) {
							return true;
						}
						return this.hasDecisionChanged(previous, result);
					},
				);
				if (!decision) {
					await this.refreshDecisionsFromDisk(idPart, previous);
					return;
				}
				this.decisions.set(decision.id, decision);
				this.cachedDecisions = sortByStateId(Array.from(this.decisions.values()));
				this.notify("decisions");
			});
		});
		this.attachWatcherErrorHandler(watcher, "decisions");

		return {
			stop() {
				watcher.close();
			},
		};
	}

	private async createDocumentWatcher(): Promise<WatchHandle> {
		const docsDir = this.filesystem.docsDir;
		return this.createDirectoryWatcher(docsDir, async (eventType, absolutePath, relativePath) => {
			const base = basename(absolutePath);
			if (!base.endsWith(".md")) {
				if (relativePath === null) {
					await this.refreshDocumentsFromDisk();
				}
				return;
			}

			if (!base.startsWith("doc-")) {
				await this.refreshDocumentsFromDisk();
				return;
			}

			const [idPart] = base.split(" - ");
			if (!idPart) {
				await this.refreshDocumentsFromDisk();
				return;
			}

			const exists = await Bun.file(absolutePath).exists();

			if (!exists && eventType === "rename") {
				if (this.documents.delete(idPart)) {
					this.cachedDocuments = [...this.documents.values()].sort((a, b) => a.title.localeCompare(b.title));
					this.notify("documents");
				}
				return;
			}

			if (eventType === "rename" && exists) {
				await this.refreshDocumentsFromDisk();
				return;
			}

			const previous = this.documents.get(idPart);
			const document = await this.retryRead(
				async () => {
					try {
						const content = await Bun.file(absolutePath).text();
						return parseDocument(content);
					} catch {
						return null;
					}
				},
				(result) => {
					if (!result) {
						return false;
					}
					if (result.id !== idPart) {
						return false;
					}
					if (!previous) {
						return true;
					}
					return this.hasDocumentChanged(previous, result);
				},
			);
			if (!document) {
				await this.refreshDocumentsFromDisk(idPart, previous);
				return;
			}

			this.documents.set(document.id, document);
			this.cachedDocuments = [...this.documents.values()].sort((a, b) => a.title.localeCompare(b.title));
			this.notify("documents");
		});
	}

	private normalizeFilename(value: string | Buffer | null | undefined): string | null {
		if (typeof value === "string") {
			return value;
		}
		if (value instanceof Buffer) {
			return value.toString();
		}
		return null;
	}

	private async createDirectoryWatcher(
		rootDir: string,
		handler: (eventType: string, absolutePath: string, relativePath: string | null) => Promise<void> | void,
	): Promise<WatchHandle> {
		try {
			const watcher = watch(rootDir, { recursive: true }, (eventType, filename) => {
				const relativePath = this.normalizeFilename(filename);
				const absolutePath = relativePath ? join(rootDir, relativePath) : rootDir;

				this.enqueue(async () => {
					await handler(eventType, absolutePath, relativePath);
				});
			});
			this.attachWatcherErrorHandler(watcher, `dir:${rootDir}`);

			return {
				stop() {
					watcher.close();
				},
			};
		} catch (error) {
			if (this.isRecursiveUnsupported(error)) {
				return this.createManualRecursiveWatcher(rootDir, handler);
			}
			throw error;
		}
	}

	private isRecursiveUnsupported(error: unknown): boolean {
		if (!error || typeof error !== "object") {
			return false;
		}
		const maybeError = error as { code?: string; message?: string };
		if (maybeError.code === "ERR_FEATURE_UNAVAILABLE_ON_PLATFORM") {
			return true;
		}
		return (
			typeof maybeError.message === "string" &&
			maybeError.message.toLowerCase().includes("recursive") &&
			maybeError.message.toLowerCase().includes("not supported")
		);
	}

	private replaceStates(states: State[]): void {
		this.states.clear();
		for (const state of states) {
			this.states.set(state.id, state);
		}
		this.cachedStates = sortByStateId(Array.from(this.states.values()));
	}

	private replaceDocuments(documents: Document[]): void {
		this.documents.clear();
		for (const document of documents) {
			this.documents.set(document.id, document);
		}
		this.cachedDocuments = [...this.documents.values()].sort((a, b) => a.title.localeCompare(b.title));
	}

	private replaceDecisions(decisions: Decision[]): void {
		this.decisions.clear();
		for (const decision of decisions) {
			this.decisions.set(decision.id, decision);
		}
		this.cachedDecisions = sortByStateId(Array.from(this.decisions.values()));
	}

	private patchFilesystem(): void {
		if (this.restoreFilesystemPatch) {
			return;
		}

		const originalSaveState = this.filesystem.saveState;
		const originalSaveDocument = this.filesystem.saveDocument;
		const originalSaveDecision = this.filesystem.saveDecision;

		this.filesystem.saveState = (async (state: State): Promise<string> => {
			const result = await originalSaveState.call(this.filesystem, state);
			await this.handleStateWrite(state.id);
			return result;
		}) as FileSystem["saveState"];

		this.filesystem.saveDocument = (async (document: Document, subPath = ""): Promise<string> => {
			const result = await originalSaveDocument.call(this.filesystem, document, subPath);
			await this.handleDocumentWrite(document.id);
			return result;
		}) as FileSystem["saveDocument"];

		this.filesystem.saveDecision = (async (decision: Decision): Promise<void> => {
			await originalSaveDecision.call(this.filesystem, decision);
			await this.handleDecisionWrite(decision.id);
		}) as FileSystem["saveDecision"];

		this.restoreFilesystemPatch = () => {
			this.filesystem.saveState = originalSaveState;
			this.filesystem.saveDocument = originalSaveDocument;
			this.filesystem.saveDecision = originalSaveDecision;
		};
	}

	private async handleStateWrite(stateId: string): Promise<void> {
		if (!this.initialized) {
			return;
		}
		await this.updateStateFromDisk(stateId);
	}

	private async handleDocumentWrite(documentId: string): Promise<void> {
		if (!this.initialized) {
			return;
		}
		await this.refreshDocumentsFromDisk(documentId, this.documents.get(documentId));
	}

	private hasStateChanged(previous: State, next: State): boolean {
		return JSON.stringify(previous) !== JSON.stringify(next);
	}

	private hasDocumentChanged(previous: Document, next: Document): boolean {
		return JSON.stringify(previous) !== JSON.stringify(next);
	}

	private hasDecisionChanged(previous: Decision, next: Decision): boolean {
		return JSON.stringify(previous) !== JSON.stringify(next);
	}

	private async refreshStatesFromDisk(expectedId?: string, previous?: State): Promise<void> {
		const states = await this.retryRead(
			async () => this.loadStatesWithLoader(),
			(expected) => {
				if (!expectedId) {
					return true;
				}
				const match = expected.find((state) => stateIdsEqual(state.id, expectedId));
				if (!match) {
					return false;
				}
				if (previous && !this.hasStateChanged(previous, match)) {
					return false;
				}
				return true;
			},
		);
		if (!states) {
			return;
		}
		this.replaceStates(states);
		this.notify("states");
	}

	private async refreshDocumentsFromDisk(expectedId?: string, previous?: Document): Promise<void> {
		const documents = await this.retryRead(
			async () => this.filesystem.listDocuments(),
			(expected) => {
				if (!expectedId) {
					return true;
				}
				const match = expected.find((doc) => doc.id === expectedId);
				if (!match) {
					return false;
				}
				if (previous && !this.hasDocumentChanged(previous, match)) {
					return false;
				}
				return true;
			},
		);
		if (!documents) {
			return;
		}
		this.replaceDocuments(documents);
		this.notify("documents");
	}

	private async refreshDecisionsFromDisk(expectedId?: string, previous?: Decision): Promise<void> {
		const decisions = await this.retryRead(
			async () => this.filesystem.listDecisions(),
			(expected) => {
				if (!expectedId) {
					return true;
				}
				const match = expected.find((decision) => decision.id === expectedId);
				if (!match) {
					return false;
				}
				if (previous && !this.hasDecisionChanged(previous, match)) {
					return false;
				}
				return true;
			},
		);
		if (!decisions) {
			return;
		}
		this.replaceDecisions(decisions);
		this.notify("decisions");
	}

	private async handleDecisionWrite(decisionId: string): Promise<void> {
		if (!this.initialized) {
			return;
		}
		await this.updateDecisionFromDisk(decisionId);
	}

	private async updateStateFromDisk(stateId: string): Promise<void> {
		const normalizedStateId = normalizeStateId(stateId);
		const previous = this.states.get(normalizedStateId);
		const state = await this.retryRead(
			async () => this.filesystem.loadState(stateId),
			(result) => result !== null && (!previous || this.hasStateChanged(previous, result)),
		);
		if (!state) {
			return;
		}
		this.states.set(state.id, state);
		this.cachedStates = sortByStateId(Array.from(this.states.values()));
		this.notify("states");
	}

	private async updateDecisionFromDisk(decisionId: string): Promise<void> {
		const previous = this.decisions.get(decisionId);
		const decision = await this.retryRead(
			async () => this.filesystem.loadDecision(decisionId),
			(result) => result !== null && (!previous || this.hasDecisionChanged(previous, result)),
		);
		if (!decision) {
			return;
		}
		this.decisions.set(decision.id, decision);
		this.cachedDecisions = sortByStateId(Array.from(this.decisions.values()));
		this.notify("decisions");
	}

	private async createManualRecursiveWatcher(
		rootDir: string,
		handler: (eventType: string, absolutePath: string, relativePath: string | null) => Promise<void> | void,
	): Promise<WatchHandle> {
		const watchers = new Map<string, FSWatcher>();
		let disposed = false;

		const removeSubtreeWatchers = (baseDir: string) => {
			const prefix = baseDir.endsWith(sep) ? baseDir : `${baseDir}${sep}`;
			for (const path of [...watchers.keys()]) {
				if (path === baseDir || path.startsWith(prefix)) {
					watchers.get(path)?.close();
					watchers.delete(path);
				}
			}
		};

		const addWatcher = async (dir: string): Promise<void> => {
			if (disposed || watchers.has(dir)) {
				return;
			}

			const watcher = watch(dir, { recursive: false }, (eventType, filename) => {
				if (disposed) {
					return;
				}
				const relativePath = this.normalizeFilename(filename);
				const absolutePath = relativePath ? join(dir, relativePath) : dir;
				const normalizedRelative = relativePath ? relative(rootDir, absolutePath) : null;

				this.enqueue(async () => {
					await handler(eventType, absolutePath, normalizedRelative);

					if (eventType === "rename" && relativePath) {
						try {
							const stats = await stat(absolutePath);
							if (stats.isDirectory()) {
								await addWatcher(absolutePath);
							}
						} catch {
							removeSubtreeWatchers(absolutePath);
						}
					}
				});
			});
			this.attachWatcherErrorHandler(watcher, `manual:${dir}`);

			watchers.set(dir, watcher);

			try {
				const entries = await readdir(dir, { withFileTypes: true });
				for (const entry of entries) {
					const entryPath = join(dir, entry.name);
					if (entry.isDirectory()) {
						await addWatcher(entryPath);
						continue;
					}

					if (entry.isFile()) {
						this.enqueue(async () => {
							await handler("change", entryPath, relative(rootDir, entryPath));
						});
					}
				}
			} catch {
				// Ignore transient directory enumeration issues
			}
		};

		await addWatcher(rootDir);

		return {
			stop() {
				disposed = true;
				for (const watcher of watchers.values()) {
					watcher.close();
				}
				watchers.clear();
			},
		};
	}

	private async retryRead<T>(
		loader: () => Promise<T>,
		isValid: (result: T) => boolean = (value) => value !== null && value !== undefined,
		attempts = 12,
		delayMs = 75,
	): Promise<T | null> {
		let lastError: unknown = null;
		for (let attempt = 1; attempt <= attempts; attempt++) {
			try {
				const result = await loader();
				if (isValid(result)) {
					return result;
				}
			} catch (error) {
				lastError = error;
			}
			if (attempt < attempts) {
				await this.delay(delayMs * attempt);
			}
		}

		if (lastError && process.env.DEBUG) {
			console.error("ContentStore retryRead exhausted attempts", lastError);
		}
		return null;
	}

	private async delay(ms: number): Promise<void> {
		await new Promise((resolve) => setTimeout(resolve, ms));
	}

	private enqueue(fn: () => Promise<void>): void {
		this.chainTail = this.chainTail
			.then(() => fn())
			.catch((error) => {
				if (process.env.DEBUG) {
					console.error("ContentStore update failed", error);
				}
			});
	}

	private async loadStatesWithLoader(): Promise<State[]> {
		if (this.stateLoader) {
			return await this.stateLoader();
		}
		return await this.filesystem.listStates();
	}
}

export type { ContentSnapshot };
