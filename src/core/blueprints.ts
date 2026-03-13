import type { State } from "../types/index.ts";

export type BlueprintType = "software" | "research" | "content" | "versatile" | "evolution";

export interface BlueprintState extends Partial<State> {
	id: string;
	title: string;
	description: string;
	dependsOnIds?: string[];
	assignee?: string[];
	/** This state represents the guiding Vision/Goal of the project */
	isVision?: boolean;
	/** This state represents the starting point of exploration */
	isInitial?: boolean;
}

export interface Blueprint {
	type: BlueprintType;
	name: string;
	description: string;
	states: BlueprintState[];
}

export const BLUEPRINTS: Record<BlueprintType, Blueprint> = {
	software: {
		type: "software",
		name: "Software Product Journey",
		description: "From a raw vision to a realized product through continuous discovery and engineering.",
		states: [
			{
				id: "0",
				title: "Initial Exploration & Market Discovery",
				description: "Starting from the seed inspiration. Research the ecosystem, analyze competitors, and gather initial user feedback to validate the path.",
				assignee: ["@explorer"],
				labels: ["discovery"],
				isInitial: true,
			},
			{
				id: "1",
				title: "Requirement Refinement & Tech Discovery",
				description: "Based on initial exploration, define the technical feasibility and refine the project requirements.",
				dependsOnIds: ["0"],
				assignee: ["@architect", "@analyst"],
				labels: ["discovery", "planning"],
			},
			{
				id: "2",
				title: "Foundational Engineering (Backend/Infra)",
				description: "Establish the core technical foundations required to realize the vision.",
				dependsOnIds: ["1"],
				assignee: ["@backend"],
				labels: ["engineering"],
			},
			{
				id: "3",
				title: "Experience Implementation (Frontend/UI)",
				description: "Build the user-facing interface, ensuring it aligns with the discovered user needs.",
				dependsOnIds: ["1", "2"],
				assignee: ["@frontend", "@designer"],
				labels: ["engineering"],
			},
			{
				id: "4",
				title: "Public Feedback & Social Validation",
				description: "Engage with the community (polls, social media, beta tests) to gather feedback and pivot or refine the roadmap.",
				dependsOnIds: ["3"],
				assignee: ["@promoter", "@strategist"],
				labels: ["discovery", "marketing"],
			},
			{
				id: "5",
				title: "Project Vision: Realized Product",
				description: "The guiding vision has been achieved through this iterative process of discovery and creation.",
				dependsOnIds: ["3", "4"],
				assignee: ["@manager"],
				labels: ["vision", "goal"],
				isVision: true,
			},
		],
	},
	research: {
		type: "research",
		name: "Scientific Discovery",
		description: "A path from a guiding question to proven findings through rigorous exploration.",
		states: [
			{
				id: "0",
				title: "Initial Hypothesis & Prior Art Search",
				description: "We have a guiding question. Explore the existing landscape and formalize the initial hypothesis.",
				assignee: ["@researcher"],
				labels: ["discovery"],
				isInitial: true,
			},
			{
				id: "1",
				title: "Methodological Prototyping",
				description: "Experiment with different research methodologies to find the most effective path forward.",
				dependsOnIds: ["0"],
				assignee: ["@methodologist"],
				labels: ["planning"],
			},
			{
				id: "2",
				title: "Core Execution & Data Harvesting",
				description: "The main process of gathering evidence and running the discovery process.",
				dependsOnIds: ["1"],
				assignee: ["@operator"],
				labels: ["execution"],
			},
			{
				id: "3",
				title: "Deep Analysis & Critical Review",
				description: "Synthesize the findings and subject them to rigorous analysis or peer feedback.",
				dependsOnIds: ["2"],
				assignee: ["@analyst"],
				labels: ["analysis"],
			},
			{
				id: "4",
				title: "Project Vision: Proven Conclusion",
				description: "The initial guiding question has been answered and the findings are finalized.",
				dependsOnIds: ["3"],
				assignee: ["@writer"],
				labels: ["vision", "goal"],
				isVision: true,
			},
		],
	},
	content: {
		type: "content",
		name: "Content Creation Journey",
		description: "From a creative spark to a fully engaged audience.",
		states: [
			{
				id: "0",
				title: "Creative Spark & Audience Research",
				description: "Start with the seed idea. Explore who this is for and what will resonate most.",
				assignee: ["@strategist"],
				labels: ["discovery"],
				isInitial: true,
			},
			{
				id: "1",
				title: "Narrative & Outlining",
				description: "Develop the core message and structure the journey for the audience.",
				dependsOnIds: ["0"],
				assignee: ["@writer"],
				labels: ["drafting"],
			},
			{
				id: "2",
				title: "Production & Aesthetic Development",
				description: "Create the visual and auditory elements that bring the vision to life.",
				dependsOnIds: ["1"],
				assignee: ["@producer", "@designer"],
				labels: ["production"],
			},
			{
				id: "3",
				title: "Launch & Audience Engagement",
				description: "Go live and interact with the audience to gather feedback for future iterations.",
				dependsOnIds: ["2"],
				assignee: ["@promoter"],
				labels: ["marketing"],
			},
			{
				id: "4",
				title: "Project Vision: Resonant Content",
				description: "The initial spark has been transformed into a realized piece of content that connects with its audience.",
				dependsOnIds: ["3"],
				assignee: ["@manager"],
				labels: ["vision", "goal"],
				isVision: true,
			},
		],
	},
	evolution: {
		type: "evolution",
		name: "Improvement & Evolution",
		description: "For existing projects: Analyze current state -> Identify Gaps -> Assess Risks -> Implement & Evolve.",
		states: [
			{
				id: "0",
				title: "Current State Analysis & Gap Discovery",
				description: "Analyze the existing codebase or project structure. Identify the gap between the current state and the desired improvements.",
				assignee: ["@explorer", "@analyst"],
				labels: ["discovery", "analysis"],
				isInitial: true,
			},
			{
				id: "1",
				title: "Risk Assessment & Alternative Approaches",
				description: "Analyze technical risks and explore alternative implementation paths or task structures to reach the goal safely.",
				dependsOnIds: ["0"],
				assignee: ["@architect", "@strategist"],
				labels: ["analysis", "risk-management"],
			},
			{
				id: "2",
				title: "Improvement Plan & DAG Refinement",
				description: "Based on analysis and risk assessment, draw the detailed DAG and plan specific improvement tasks.",
				dependsOnIds: ["1"],
				assignee: ["@manager"],
				labels: ["planning"],
			},
			{
				id: "3",
				title: "Implementation: Core Improvements",
				description: "Execute the planned improvements and evolutionary changes.",
				dependsOnIds: ["2"],
				assignee: ["@builder"],
				labels: ["engineering", "evolution"],
			},
			{
				id: "4",
				title: "Validation & Regression Testing",
				description: "Verify that the improvements work as expected and no regressions were introduced to the original project.",
				dependsOnIds: ["3"],
				assignee: ["@reviewer"],
				labels: ["testing"],
			},
			{
				id: "5",
				title: "Project Vision: Evolved State",
				description: "The project has been successfully evolved to the new improved state as described in the vision.",
				dependsOnIds: ["4"],
				assignee: ["@manager"],
				labels: ["vision", "goal"],
				isVision: true,
			},
		],
	},
	versatile: {
		type: "versatile",
		name: "General Exploration",
		description: "A flexible path for any project starting from an idea.",
		states: [
			{
				id: "0",
				title: "Initial State: Discovery",
				description: "We have a seed. Time to explore the possibilities and map the first steps.",
				assignee: ["@planner"],
				labels: ["discovery"],
				isInitial: true,
			},
			{
				id: "1",
				title: "Core Implementation",
				description: "Execute the primary work required to move toward the vision.",
				dependsOnIds: ["0"],
				assignee: ["@builder"],
				labels: ["execution"],
			},
			{
				id: "2",
				title: "Validation & Refinement",
				description: "Test the results and refine based on findings.",
				dependsOnIds: ["1"],
				assignee: ["@reviewer"],
				labels: ["refinement"],
			},
			{
				id: "3",
				title: "Project Vision: Goal Realized",
				description: "The initial vision has been successfully brought to life.",
				dependsOnIds: ["2"],
				assignee: ["@manager"],
				labels: ["vision", "goal"],
				isVision: true,
			},
		],
	},
};
