import type { JsonSchema } from "../../validation/validators.ts";

export const milestoneListSchema: JsonSchema = {
	type: "object",
	properties: {},
	required: [],
	additionalProperties: false,
};

export const milestoneAddSchema: JsonSchema = {
	type: "object",
	properties: {
		name: {
			type: "string",
			minLength: 1,
			maxLength: 100,
			description: "Milestone name/title (trimmed; case-insensitive uniqueness)",
		},
		description: {
			type: "string",
			maxLength: 2000,
			description: "Optional description for the milestone",
		},
	},
	required: ["name"],
	additionalProperties: false,
};

export const milestoneRenameSchema: JsonSchema = {
	type: "object",
	properties: {
		from: {
			type: "string",
			minLength: 1,
			maxLength: 100,
			description: "Existing milestone name (case-insensitive match)",
		},
		to: {
			type: "string",
			minLength: 1,
			maxLength: 100,
			description: "New milestone name (trimmed; case-insensitive uniqueness)",
		},
		updateStates: {
			type: "boolean",
			description: "Whether to update local states that reference the milestone (default: true)",
			default: true,
		},
	},
	required: ["from", "to"],
	additionalProperties: false,
};

export const milestoneRemoveSchema: JsonSchema = {
	type: "object",
	properties: {
		name: {
			type: "string",
			minLength: 1,
			maxLength: 100,
			description: "Milestone name to remove (case-insensitive match)",
		},
		stateHandling: {
			type: "string",
			enum: ["clear", "keep", "reassign"],
			description: "What to do with local states currently set to this milestone: clear (default), keep, or reassign",
			default: "clear",
		},
		reassignTo: {
			type: "string",
			maxLength: 100,
			description: "Target milestone name when stateHandling is reassign (must exist as an active milestone file)",
		},
	},
	required: ["name"],
	additionalProperties: false,
};

export const milestoneArchiveSchema: JsonSchema = {
	type: "object",
	properties: {
		name: {
			type: "string",
			minLength: 1,
			maxLength: 100,
			description: "Milestone name or ID to archive (case-insensitive match)",
		},
	},
	required: ["name"],
	additionalProperties: false,
};
