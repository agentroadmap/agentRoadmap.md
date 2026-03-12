import type { StateStatistics } from "../../core/statistics.ts";
import type {
	RoadmapConfig,
	Decision,
	Document,
	Milestone,
	SearchPriorityFilter,
	SearchResult,
	SearchResultType,
	State,
	StateStatus,
} from "../../types/index.ts";

const API_BASE = "/api";

export interface ReorderStatePayload {
	stateId: string;
	targetStatus: string;
	orderedStateIds: string[];
	targetMilestone?: string | null;
}

// Enhanced error types for better error handling
export class ApiError extends Error {
	constructor(
		message: string,
		public status?: number,
		public code?: string,
		public data?: unknown,
	) {
		super(message);
		this.name = "ApiError";
	}

	static fromResponse(response: Response, data?: unknown): ApiError {
		const message = `HTTP ${response.status}: ${response.statusText}`;
		return new ApiError(message, response.status, response.statusText, data);
	}
}

export class NetworkError extends Error {
	constructor(message = "Network request failed") {
		super(message);
		this.name = "NetworkError";
	}
}

// Request configuration interface
interface RequestConfig {
	retries?: number;
	timeout?: number;
	Headers?: Record<string, string>;
}

// Default configuration
const DEFAULT_CONFIG: RequestConfig = {
	retries: 3,
	timeout: 10000,
};

export class ApiClient {
	private config: RequestConfig;

	constructor(config: RequestConfig = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	// Enhanced fetch with retry logic and better error handling
	private async fetchWithRetry(url: string, options: RequestInit = {}): Promise<Response> {
		const { retries = 3, timeout = 10000 } = this.config;
		let lastError: Error | undefined;

		for (let attempt = 0; attempt <= retries; attempt++) {
			try {
				// Add timeout to the request
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), timeout);

				const response = await fetch(url, {
					...options,
					signal: controller.signal,
					headers: {
						"Content-Type": "application/json",
						...options.headers,
					},
				});

				clearTimeout(timeoutId);

				if (!response.ok) {
					let errorData: unknown = null;
					try {
						errorData = await response.json();
					} catch {
						// Ignore JSON parse errors for error data
					}
					throw ApiError.fromResponse(response, errorData);
				}

				return response;
			} catch (error) {
				lastError = error as Error;

				// Don't retry on client errors (4xx) or specific cases
				if (error instanceof ApiError && error.status && error.status >= 400 && error.status < 500) {
					throw error;
				}

				// For network errors or server errors, retry with exponential backoff
				if (attempt < retries) {
					const delay = Math.min(1000 * 2 ** attempt, 10000);
					await new Promise((resolve) => setTimeout(resolve, delay));
				}
			}
		}

		// If we get here, all retries failed
		if (lastError instanceof ApiError) {
			throw lastError;
		}
		throw new NetworkError(`Request failed after ${retries + 1} attempts: ${lastError?.message}`);
	}

	// Helper method for JSON responses
	private async fetchJson<T>(url: string, options: RequestInit = {}): Promise<T> {
		const response = await this.fetchWithRetry(url, options);
		return response.json();
	}
	async fetchStates(options?: {
		status?: string;
		assignee?: string;
		parent?: string;
		priority?: SearchPriorityFilter;
		labels?: string[];
		crossBranch?: boolean;
	}): Promise<State[]> {
		const params = new URLSearchParams();
		if (options?.status) params.append("status", options.status);
		if (options?.assignee) params.append("assignee", options.assignee);
		if (options?.parent) params.append("parent", options.parent);
		if (options?.priority) params.append("priority", options.priority);
		if (options?.labels) {
			for (const label of options.labels) {
				if (label && label.trim().length > 0) {
					params.append("label", label.trim());
				}
			}
		}
		// Default to true for cross-branch loading to match TUI behavior
		if (options?.crossBranch !== false) params.append("crossBranch", "true");

		const url = `${API_BASE}/states${params.toString() ? `?${params.toString()}` : ""}`;
		return this.fetchJson<State[]>(url);
	}

	async search(
		options: {
			query?: string;
			types?: SearchResultType[];
			status?: string | string[];
			priority?: SearchPriorityFilter | SearchPriorityFilter[];
			labels?: string[];
			limit?: number;
		} = {},
	): Promise<SearchResult[]> {
		const params = new URLSearchParams();
		if (options.query) {
			params.set("query", options.query);
		}
		if (options.types && options.types.length > 0) {
			for (const type of options.types) {
				params.append("type", type);
			}
		}
		if (options.status) {
			const statuses = Array.isArray(options.status) ? options.status : [options.status];
			for (const status of statuses) {
				params.append("status", status);
			}
		}
		if (options.priority) {
			const priorities = Array.isArray(options.priority) ? options.priority : [options.priority];
			for (const priority of priorities) {
				params.append("priority", priority);
			}
		}
		if (options.labels) {
			for (const label of options.labels) {
				if (label && label.trim().length > 0) {
					params.append("label", label.trim());
				}
			}
		}
		if (options.limit !== undefined) {
			params.set("limit", String(options.limit));
		}

		const url = `${API_BASE}/search${params.toString() ? `?${params.toString()}` : ""}`;
		return this.fetchJson<SearchResult[]>(url);
	}

	async fetchState(id: string): Promise<State> {
		return this.fetchJson<State>(`${API_BASE}/state/${id}`);
	}

	async createState(state: Omit<State, "id" | "createdDate">): Promise<State> {
		return this.fetchJson<State>(`${API_BASE}/states`, {
			method: "POST",
			body: JSON.stringify(state),
		});
	}

	async updateState(
		id: string,
		updates: Omit<Partial<State>, "milestone"> & { milestone?: string | null },
	): Promise<State> {
		return this.fetchJson<State>(`${API_BASE}/states/${id}`, {
			method: "PUT",
			body: JSON.stringify(updates),
		});
	}

	async reorderState(payload: ReorderStatePayload): Promise<{ success: boolean; state: State }> {
		return this.fetchJson<{ success: boolean; state: State }>(`${API_BASE}/states/reorder`, {
			method: "POST",
			body: JSON.stringify(payload),
		});
	}

	async archiveState(id: string): Promise<void> {
		await this.fetchWithRetry(`${API_BASE}/states/${id}`, {
			method: "DELETE",
		});
	}

	async completeState(id: string): Promise<void> {
		await this.fetchWithRetry(`${API_BASE}/states/${id}/complete`, {
			method: "POST",
		});
	}

	async getCleanupPreview(age: number): Promise<{
		count: number;
		states: Array<{ id: string; title: string; updatedDate?: string; createdDate: string }>;
	}> {
		return this.fetchJson<{
			count: number;
			states: Array<{ id: string; title: string; updatedDate?: string; createdDate: string }>;
		}>(`${API_BASE}/states/cleanup?age=${age}`);
	}

	async executeCleanup(
		age: number,
	): Promise<{ success: boolean; movedCount: number; totalCount: number; message: string; failedStates?: string[] }> {
		return this.fetchJson<{
			success: boolean;
			movedCount: number;
			totalCount: number;
			message: string;
			failedStates?: string[];
		}>(`${API_BASE}/states/cleanup/execute`, {
			method: "POST",
			body: JSON.stringify({ age }),
		});
	}

	async updateStateStatus(id: string, status: StateStatus): Promise<State> {
		return this.updateState(id, { status });
	}

	async fetchStatuses(): Promise<string[]> {
		const response = await fetch(`${API_BASE}/statuses`);
		if (!response.ok) {
			throw new Error("Failed to fetch statuses");
		}
		return response.json();
	}

	async fetchConfig(): Promise<RoadmapConfig> {
		const response = await fetch(`${API_BASE}/config`);
		if (!response.ok) {
			throw new Error("Failed to fetch config");
		}
		return response.json();
	}

	async updateConfig(config: RoadmapConfig): Promise<RoadmapConfig> {
		const response = await fetch(`${API_BASE}/config`, {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(config),
		});
		if (!response.ok) {
			throw new Error("Failed to update config");
		}
		return response.json();
	}

	async fetchDocs(): Promise<Document[]> {
		const response = await fetch(`${API_BASE}/docs`);
		if (!response.ok) {
			throw new Error("Failed to fetch documentation");
		}
		return response.json();
	}

	async fetchDoc(filename: string): Promise<Document> {
		const response = await fetch(`${API_BASE}/docs/${encodeURIComponent(filename)}`);
		if (!response.ok) {
			throw new Error("Failed to fetch document");
		}
		return response.json();
	}

	async fetchDocument(id: string): Promise<Document> {
		const response = await fetch(`${API_BASE}/doc/${encodeURIComponent(id)}`);
		if (!response.ok) {
			throw new Error("Failed to fetch document");
		}
		return response.json();
	}

	async updateDoc(filename: string, content: string, title?: string): Promise<void> {
		const payload: Record<string, unknown> = { content };
		if (typeof title === "string") {
			payload.title = title;
		}

		const response = await fetch(`${API_BASE}/docs/${encodeURIComponent(filename)}`, {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		});
		if (!response.ok) {
			throw new Error("Failed to update document");
		}
	}

	async createDoc(filename: string, content: string): Promise<{ id: string }> {
		const response = await fetch(`${API_BASE}/docs`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ filename, content }),
		});
		if (!response.ok) {
			throw new Error("Failed to create document");
		}
		return response.json();
	}

	async fetchDecisions(): Promise<Decision[]> {
		const response = await fetch(`${API_BASE}/decisions`);
		if (!response.ok) {
			throw new Error("Failed to fetch decisions");
		}
		return response.json();
	}

	async fetchDecision(id: string): Promise<Decision> {
		const response = await fetch(`${API_BASE}/decisions/${encodeURIComponent(id)}`);
		if (!response.ok) {
			throw new Error("Failed to fetch decision");
		}
		return response.json();
	}

	async fetchDecisionData(id: string): Promise<Decision> {
		const response = await fetch(`${API_BASE}/decision/${encodeURIComponent(id)}`);
		if (!response.ok) {
			throw new Error("Failed to fetch decision");
		}
		return response.json();
	}

	async updateDecision(id: string, content: string): Promise<void> {
		const response = await fetch(`${API_BASE}/decisions/${encodeURIComponent(id)}`, {
			method: "PUT",
			headers: {
				"Content-Type": "text/plain",
			},
			body: content,
		});
		if (!response.ok) {
			throw new Error("Failed to update decision");
		}
	}

	async createDecision(title: string): Promise<Decision> {
		const response = await fetch(`${API_BASE}/decisions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ title }),
		});
		if (!response.ok) {
			throw new Error("Failed to create decision");
		}
		return response.json();
	}

	async fetchMilestones(): Promise<Milestone[]> {
		const response = await fetch(`${API_BASE}/milestones`);
		if (!response.ok) {
			throw new Error("Failed to fetch milestones");
		}
		return response.json();
	}

	async fetchArchivedMilestones(): Promise<Milestone[]> {
		const response = await fetch(`${API_BASE}/milestones/archived`);
		if (!response.ok) {
			throw new Error("Failed to fetch archived milestones");
		}
		return response.json();
	}

	async fetchMilestone(id: string): Promise<Milestone> {
		const response = await fetch(`${API_BASE}/milestones/${encodeURIComponent(id)}`);
		if (!response.ok) {
			throw new Error("Failed to fetch milestone");
		}
		return response.json();
	}

	async createMilestone(title: string, description?: string): Promise<Milestone> {
		const response = await fetch(`${API_BASE}/milestones`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ title, description }),
		});
		if (!response.ok) {
			const data = await response.json().catch(() => ({}));
			throw new Error(data.error || "Failed to create milestone");
		}
		return response.json();
	}

	async archiveMilestone(id: string): Promise<{ success: boolean; milestone?: Milestone | null }> {
		const response = await fetch(`${API_BASE}/milestones/${encodeURIComponent(id)}/archive`, {
			method: "POST",
		});
		if (!response.ok) {
			const data = await response.json().catch(() => ({}));
			throw new Error(data.error || "Failed to archive milestone");
		}
		return response.json();
	}

	async fetchStatistics(): Promise<
		StateStatistics & { statusCounts: Record<string, number>; priorityCounts: Record<string, number> }
	> {
		return this.fetchJson<
			StateStatistics & { statusCounts: Record<string, number>; priorityCounts: Record<string, number> }
		>(`${API_BASE}/statistics`);
	}

	async checkStatus(): Promise<{ initialized: boolean; projectPath: string }> {
		return this.fetchJson<{ initialized: boolean; projectPath: string }>(`${API_BASE}/status`);
	}

	async initializeProject(options: {
		projectName: string;
		integrationMode: "mcp" | "cli" | "none";
		mcpClients?: ("claude" | "codex" | "gemini" | "kiro" | "guide")[];
		agentInstructions?: ("CLAUDE.md" | "AGENTS.md" | "GEMINI.md" | ".github/copilot-instructions.md")[];
		installClaudeAgent?: boolean;
		advancedConfig?: {
			checkActiveBranches?: boolean;
			remoteOperations?: boolean;
			activeBranchDays?: number;
			bypassGitHooks?: boolean;
			autoCommit?: boolean;
			zeroPaddedIds?: number;
			statePrefix?: string;
			defaultEditor?: string;
			defaultPort?: number;
			autoOpenBrowser?: boolean;
		};
	}): Promise<{ success: boolean; projectName: string; mcpResults?: Record<string, string> }> {
		return this.fetchJson<{ success: boolean; projectName: string; mcpResults?: Record<string, string> }>(
			`${API_BASE}/init`,
			{
				method: "POST",
				body: JSON.stringify(options),
			},
		);
	}
}

export const apiClient = new ApiClient();
