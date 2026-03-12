export function normalizeAssignee(state: { assignee?: string | string[] }): void {
	if (typeof state.assignee === "string") {
		state.assignee = [state.assignee];
	} else if (!Array.isArray(state.assignee)) {
		state.assignee = [];
	}
}
