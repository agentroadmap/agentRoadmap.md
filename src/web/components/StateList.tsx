import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiClient } from "../lib/api";
import type {
	Milestone,
	SearchPriorityFilter,
	State,
	StateSearchResult,
} from "../../types";
import { collectAvailableLabels } from "../../utils/label-filter.ts";
import { collectArchivedMilestoneKeys, getMilestoneLabel, milestoneKey } from "../utils/milestones";
import { formatStoredUtcDateForCompactDisplay, parseStoredUtcDate } from "../utils/date-display";
import CleanupModal from "./CleanupModal";
import { SuccessToast } from "./SuccessToast";

interface StateListProps {
	onEditState: (state: State) => void;
	onNewState: () => void;
	states: State[];
	availableStatuses: string[];
	availableLabels: string[];
	availableMilestones: string[];
	milestoneEntities: Milestone[];
	archivedMilestones: Milestone[];
	onRefreshData?: () => Promise<void>;
}

const PRIORITY_OPTIONS: Array<{ label: string; value: "" | SearchPriorityFilter }> = [
	{ label: "All priorities", value: "" },
	{ label: "High", value: "high" },
	{ label: "Medium", value: "medium" },
	{ label: "Low", value: "low" },
];

type StateSortColumn = "id" | "title" | "status" | "priority" | "milestone" | "created";
type SortDirection = "asc" | "desc";

const PRIORITY_RANK: Record<string, number> = {
	high: 3,
	medium: 2,
	low: 1,
};

function extractStateNumericId(stateId: string): number | null {
	const match = stateId.trim().match(/(\d+)$/);
	if (!match?.[1]) return null;
	return Number.parseInt(match[1], 10);
}

function compareStateIdsAscending(a: State, b: State): number {
	const idA = extractStateNumericId(a.id);
	const idB = extractStateNumericId(b.id);

	if (idA !== null && idB !== null) {
		return idA - idB;
	}
	if (idA !== null) return -1;
	if (idB !== null) return 1;
	return a.id.localeCompare(b.id, undefined, { sensitivity: "base", numeric: true });
}

function sortStatesByIdDescending(list: State[]): State[] {
	return [...list].sort((a, b) => compareStateIdsAscending(b, a));
}

function getAssigneeInitials(value: string): string {
	const cleaned = value.replace(/^@/, "").trim();
	if (!cleaned) return "?";
	const parts = cleaned
		.split(/[\s._-]+/)
		.map((part) => part.trim())
		.filter(Boolean);
	if (parts.length === 0) return cleaned.slice(0, 2).toUpperCase();
	const first = parts[0] ?? "";
	if (parts.length === 1) return first.slice(0, 2).toUpperCase();
	const second = parts[1] ?? "";
	return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
}

const StateList: React.FC<StateListProps> = ({
	onEditState,
	onNewState,
	states,
	availableStatuses,
	availableLabels,
	availableMilestones,
	milestoneEntities,
	archivedMilestones,
	onRefreshData,
}) => {
	const [searchParams, setSearchParams] = useSearchParams();
	const [searchValue, setSearchValue] = useState(() => searchParams.get("query") ?? "");
	const [statusFilter, setStatusFilter] = useState(() => searchParams.get("status") ?? "");
	const [priorityFilter, setPriorityFilter] = useState<"" | SearchPriorityFilter>(
		() => (searchParams.get("priority") as SearchPriorityFilter | null) ?? "",
	);
	const [milestoneFilter, setMilestoneFilter] = useState(() => searchParams.get("milestone") ?? "");
	const initialLabelParams = useMemo(() => {
		const labels = [...searchParams.getAll("label"), ...searchParams.getAll("labels")];
		const labelsCsv = searchParams.get("labels");
		if (labelsCsv) labels.push(...labelsCsv.split(","));
		return labels.map((label) => label.trim()).filter((label) => label.length > 0);
	}, []);
	const [labelFilter, setLabelFilter] = useState<string[]>(initialLabelParams);
	const [displayStates, setDisplayStates] = useState<State[]>(() => sortStatesByIdDescending(states));
	const [error, setError] = useState<string | null>(null);
	const [showCleanupModal, setShowCleanupModal] = useState(false);
	const [cleanupSuccessMessage, setCleanupSuccessMessage] = useState<string | null>(null);
	const [showLabelsMenu, setShowLabelsMenu] = useState(false);
	const [sortColumn, setSortColumn] = useState<StateSortColumn>("id");
	const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
	const labelsButtonRef = useRef<HTMLButtonElement | null>(null);
	const labelsMenuRef = useRef<HTMLDivElement | null>(null);
	const tableHeaderScrollRef = useRef<HTMLDivElement | null>(null);
	const tableBodyScrollRef = useRef<HTMLDivElement | null>(null);
	const isSyncingTableScrollRef = useRef(false);
	const milestoneAliasToCanonical = useMemo(() => {
		const aliasMap = new Map<string, string>();
		const collectIdAliasKeys = (value: string): string[] => {
			const normalized = value.trim();
			const normalizedKey = normalized.toLowerCase();
			if (!normalizedKey) return [];
			const keys = new Set<string>([normalizedKey]);
			if (/^\d+$/.test(normalized)) {
				const numericAlias = String(Number.parseInt(normalized, 10));
				keys.add(numericAlias);
				keys.add(`m-${numericAlias}`);
				return Array.from(keys);
			}
			const idMatch = normalized.match(/^m-(\d+)$/i);
			if (idMatch?.[1]) {
				const numericAlias = String(Number.parseInt(idMatch[1], 10));
				keys.add(`m-${numericAlias}`);
				keys.add(numericAlias);
			}
			return Array.from(keys);
		};
		const reservedIdKeys = new Set<string>();
		for (const milestone of [...(milestoneEntities ?? []), ...(archivedMilestones ?? [])]) {
			for (const key of collectIdAliasKeys(milestone.id)) {
				reservedIdKeys.add(key);
			}
		}
		const setAlias = (aliasKey: string, id: string, allowOverwrite: boolean) => {
			const existing = aliasMap.get(aliasKey);
			if (!existing) {
				aliasMap.set(aliasKey, id);
				return;
			}
			if (!allowOverwrite) {
				return;
			}
			const existingKey = existing.toLowerCase();
			const nextKey = id.toLowerCase();
			const preferredRawId = /^\d+$/.test(aliasKey) ? `m-${aliasKey}` : /^m-\d+$/.test(aliasKey) ? aliasKey : null;
			if (preferredRawId) {
				const existingIsPreferred = existingKey === preferredRawId;
				const nextIsPreferred = nextKey === preferredRawId;
				if (existingIsPreferred && !nextIsPreferred) {
					return;
				}
				if (nextIsPreferred && !existingIsPreferred) {
					aliasMap.set(aliasKey, id);
				}
				return;
			}
			aliasMap.set(aliasKey, id);
		};
		const addIdAliases = (id: string, allowOverwrite = true) => {
			const idKey = id.toLowerCase();
			setAlias(idKey, id, allowOverwrite);
			const idMatch = id.match(/^m-(\d+)$/i);
			if (!idMatch?.[1]) return;
			const numericAlias = String(Number.parseInt(idMatch[1], 10));
			const canonicalId = `m-${numericAlias}`;
			setAlias(canonicalId, id, allowOverwrite);
			setAlias(numericAlias, id, allowOverwrite);
		};
		const activeTitleCounts = new Map<string, number>();
		for (const milestone of milestoneEntities ?? []) {
			const title = milestone.title.trim();
			if (!title) continue;
			const titleKey = title.toLowerCase();
			activeTitleCounts.set(titleKey, (activeTitleCounts.get(titleKey) ?? 0) + 1);
		};
		const activeTitleKeys = new Set(activeTitleCounts.keys());
		for (const milestone of milestoneEntities ?? []) {
			const id = milestone.id.trim();
			const title = milestone.title.trim();
			if (!id) continue;
			addIdAliases(id, true);
			if (title && !reservedIdKeys.has(title.toLowerCase()) && activeTitleCounts.get(title.toLowerCase()) === 1) {
				const titleKey = title.toLowerCase();
				if (!aliasMap.has(titleKey)) {
					aliasMap.set(titleKey, id);
				}
			}
		}
		const archivedTitleCounts = new Map<string, number>();
		for (const milestone of archivedMilestones ?? []) {
			const title = milestone.title.trim();
			if (!title) continue;
			const titleKey = title.toLowerCase();
			if (activeTitleKeys.has(titleKey)) continue;
			archivedTitleCounts.set(titleKey, (archivedTitleCounts.get(titleKey) ?? 0) + 1);
		}
		for (const milestone of archivedMilestones ?? []) {
			const id = milestone.id.trim();
			const title = milestone.title.trim();
			if (!id) continue;
			addIdAliases(id, false);
			const titleKey = title.toLowerCase();
			if (
				title &&
				!activeTitleKeys.has(titleKey) &&
				!reservedIdKeys.has(titleKey) &&
				archivedTitleCounts.get(titleKey) === 1
			) {
				if (!aliasMap.has(titleKey)) {
					aliasMap.set(titleKey, id);
				}
			}
		}
		return aliasMap;
	}, [milestoneEntities, archivedMilestones]);
	const archivedMilestoneKeys = useMemo(
		() => new Set(collectArchivedMilestoneKeys(archivedMilestones, milestoneEntities).map((value) => milestoneKey(value))),
		[archivedMilestones, milestoneEntities],
	);
	const canonicalizeMilestone = (value?: string | null): string => {
		const normalized = (value ?? "").trim();
		if (!normalized) return "";
		const key = normalized.toLowerCase();
		const direct = milestoneAliasToCanonical.get(key);
		if (direct) {
			return direct;
		}
		const idMatch = normalized.match(/^m-(\d+)$/i);
		if (idMatch?.[1]) {
			const numericAlias = String(Number.parseInt(idMatch[1], 10));
			return milestoneAliasToCanonical.get(`m-${numericAlias}`) ?? milestoneAliasToCanonical.get(numericAlias) ?? normalized;
		}
		if (/^\d+$/.test(normalized)) {
			const numericAlias = String(Number.parseInt(normalized, 10));
			return milestoneAliasToCanonical.get(`m-${numericAlias}`) ?? milestoneAliasToCanonical.get(numericAlias) ?? normalized;
		}
		return normalized;
	};

	const sortedBaseStates = useMemo(() => sortStatesByIdDescending(states), [states]);
	const mergedAvailableLabels = useMemo(
		() => collectAvailableLabels(states, availableLabels),
		[states, availableLabels],
	);
	const milestoneOptions = useMemo(() => {
		const uniqueMilestones = Array.from(new Set([...availableMilestones.map((m) => m.trim()).filter(Boolean)]));
		return uniqueMilestones;
	}, [availableMilestones]);
	const normalizedSearch = searchValue.trim();
	const hasActiveFilters = Boolean(
		normalizedSearch || statusFilter || priorityFilter || labelFilter.length > 0 || milestoneFilter,
	);
	const totalStates = sortedBaseStates.length;

	useEffect(() => {
		const paramQuery = searchParams.get("query") ?? "";
		const paramStatus = searchParams.get("status") ?? "";
		const paramPriority = (searchParams.get("priority") as SearchPriorityFilter | null) ?? "";
		const paramMilestone = searchParams.get("milestone") ?? "";
		const paramLabels = [...searchParams.getAll("label"), ...searchParams.getAll("labels")];
		const labelsCsv = searchParams.get("labels");
		if (labelsCsv) {
			paramLabels.push(...labelsCsv.split(","));
		}
		const normalizedLabels = paramLabels.map((label) => label.trim()).filter((label) => label.length > 0);

		if (paramQuery !== searchValue) {
			setSearchValue(paramQuery);
		}
		if (paramStatus !== statusFilter) {
			setStatusFilter(paramStatus);
		}
		if (paramPriority !== priorityFilter) {
			setPriorityFilter(paramPriority);
		}
		if (paramMilestone !== milestoneFilter) {
			setMilestoneFilter(paramMilestone);
		}
		if (normalizedLabels.join("|") !== labelFilter.join("|")) {
			setLabelFilter(normalizedLabels);
		}
	}, [searchParams]);

	useEffect(() => {
		if (!hasActiveFilters) {
			setDisplayStates(sortedBaseStates);
			setError(null);
		}
	}, [hasActiveFilters, sortedBaseStates]);

	useEffect(() => {
		const filterByMilestone = (list: State[]): State[] => {
			const normalized = canonicalizeMilestone(milestoneFilter);
			if (!normalized) return list;
			return list.filter((state) => {
				const canonicalStateMilestone = canonicalizeMilestone(state.milestone);
				const stateKey = milestoneKey(canonicalStateMilestone);
				const normalizedStateMilestone = stateKey && archivedMilestoneKeys.has(stateKey) ? "" : canonicalStateMilestone;
				if (normalized === "__none") {
					return !normalizedStateMilestone;
				}
				return normalizedStateMilestone === normalized;
			});
		};

		const shouldUseApi =
			Boolean(normalizedSearch) || Boolean(statusFilter) || Boolean(priorityFilter) || labelFilter.length > 0;

		if (!hasActiveFilters) {
			return;
		}

		let cancelled = false;
		setError(null);

		const fetchFilteredStates = async () => {
			// If only milestone filter is active, filter locally to avoid an extra request
			if (!shouldUseApi) {
				setDisplayStates(filterByMilestone(sortedBaseStates));
				return;
			}
			try {
				const results = await apiClient.search({
					query: normalizedSearch || undefined,
					types: ["state"],
					status: statusFilter || undefined,
					priority: (priorityFilter || undefined) as SearchPriorityFilter | undefined,
					labels: labelFilter.length > 0 ? labelFilter : undefined,
				});
				if (cancelled) {
					return;
				}
				const stateResults = results.filter((result): result is StateSearchResult => result.type === "state");
				const filtered = filterByMilestone(stateResults.map((result) => result.state));
				setDisplayStates(sortStatesByIdDescending(filtered));
			} catch (err) {
				console.error("Failed to apply state filters:", err);
				if (!cancelled) {
					setDisplayStates([]);
					setError("Unable to fetch states for the selected filters.");
				}
			}
		};

		fetchFilteredStates();

		return () => {
			cancelled = true;
		};
	}, [
		hasActiveFilters,
		normalizedSearch,
		priorityFilter,
		statusFilter,
		labelFilter,
			states,
			milestoneFilter,
			sortedBaseStates,
			milestoneAliasToCanonical,
			archivedMilestoneKeys,
		]);

	const syncUrl = (
		nextQuery: string,
		nextStatus: string,
		nextPriority: "" | SearchPriorityFilter,
		nextLabels: string[],
		nextMilestone: string,
	) => {
		const params = new URLSearchParams();
		const trimmedQuery = nextQuery.trim();
		if (trimmedQuery) {
			params.set("query", trimmedQuery);
		}
		if (nextStatus) {
			params.set("status", nextStatus);
		}
		if (nextPriority) {
			params.set("priority", nextPriority);
		}
		if (nextLabels.length > 0) {
			for (const label of nextLabels) {
				params.append("label", label);
			}
		}
		if (nextMilestone) {
			params.set("milestone", nextMilestone);
		}
		setSearchParams(params, { replace: true });
	};

	const handleSearchChange = (value: string) => {
		setSearchValue(value);
		syncUrl(value, statusFilter, priorityFilter, labelFilter, milestoneFilter);
	};

	const handleStatusChange = (value: string) => {
		setStatusFilter(value);
		syncUrl(searchValue, value, priorityFilter, labelFilter, milestoneFilter);
	};

	const handlePriorityChange = (value: "" | SearchPriorityFilter) => {
		setPriorityFilter(value);
		syncUrl(searchValue, statusFilter, value, labelFilter, milestoneFilter);
	};

	const handleLabelChange = (next: string[]) => {
		const normalized = next.map((label) => label.trim()).filter((label) => label.length > 0);
		setLabelFilter(normalized);
		syncUrl(searchValue, statusFilter, priorityFilter, normalized, milestoneFilter);
	};

	const handleMilestoneChange = (value: string) => {
		setMilestoneFilter(value);
		syncUrl(searchValue, statusFilter, priorityFilter, labelFilter, value);
	};

	const handleClearFilters = () => {
		setSearchValue("");
		setStatusFilter("");
		setPriorityFilter("");
		setLabelFilter([]);
		setMilestoneFilter("");
		syncUrl("", "", "", [], "");
		setDisplayStates(sortedBaseStates);
		setError(null);
	};

	useEffect(() => {
		if (!showLabelsMenu) return;
		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as Node;
			if (
				labelsButtonRef.current &&
				labelsMenuRef.current &&
				!labelsButtonRef.current.contains(target) &&
				!labelsMenuRef.current.contains(target)
			) {
				setShowLabelsMenu(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [showLabelsMenu]);

	const handleCleanupSuccess = async (movedCount: number) => {
		setShowCleanupModal(false);
		setCleanupSuccessMessage(`Successfully moved ${movedCount} state${movedCount !== 1 ? 's' : ''} to completed folder`);

		// Refresh the data - existing effects will handle re-filtering automatically
		if (onRefreshData) {
			await onRefreshData();
		}

		// Auto-dismiss success message after 4 seconds
		setTimeout(() => {
			setCleanupSuccessMessage(null);
		}, 4000);
	};

	const getStatusColor = (status: string) => {
		switch (status.toLowerCase()) {
			case "to do":
				return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
			case "in progress":
				return "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200";
			case "done":
				return "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200";
			default:
				return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
		}
	};

	const getPriorityColor = (priority?: string) => {
		switch (priority?.toLowerCase()) {
			case "high":
				return "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200";
			case "medium":
				return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200";
			case "low":
				return "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200";
			default:
				return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
		}
	};

	const handleSortChange = (column: StateSortColumn) => {
		if (sortColumn === column) {
			setSortDirection((previous) => (previous === "asc" ? "desc" : "asc"));
			return;
		}

		setSortColumn(column);
		setSortDirection(column === "id" || column === "created" ? "desc" : "asc");
	};

	const getSortAriaValue = (column: StateSortColumn): "none" | "ascending" | "descending" => {
		if (sortColumn !== column) return "none";
		return sortDirection === "asc" ? "ascending" : "descending";
	};

	const renderSortIcon = (column: StateSortColumn) => {
		const isActive = sortColumn === column;
		if (!isActive) {
			return (
				<span className="text-[10px] text-gray-300 dark:text-gray-600 select-none" aria-hidden="true">
					↕
				</span>
			);
		}
		return (
			<span className="text-[10px] text-gray-600 dark:text-gray-300 select-none" aria-hidden="true">
				{sortDirection === "asc" ? "▲" : "▼"}
			</span>
		);
	};

	const renderSortableHeader = (label: string, column: StateSortColumn) => (
		<th className="px-3 py-2" aria-sort={getSortAriaValue(column)}>
			<button
				type="button"
				onClick={() => handleSortChange(column)}
				className="inline-flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-100"
			>
				{label}
				{renderSortIcon(column)}
			</button>
		</th>
	);

	const renderColumnGroup = () => (
		<colgroup>
			<col style={{ width: "8rem" }} />
			<col style={{ width: "28rem" }} />
			<col style={{ width: "8rem" }} />
			<col style={{ width: "7rem" }} />
			<col style={{ width: "11rem" }} />
			<col style={{ width: "11rem" }} />
			<col style={{ width: "11rem" }} />
			<col style={{ width: "7rem" }} />
		</colgroup>
	);

	const sortedDisplayStates = useMemo(() => {
		const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
		const compareText = (a: string, b: string) => collator.compare(a, b);
		const withDirection = (value: number) => (sortDirection === "asc" ? value : -value);

		return [...displayStates].sort((a, b) => {
			let result = 0;
			switch (sortColumn) {
				case "id": {
					result = withDirection(compareStateIdsAscending(a, b));
					break;
				}
				case "title": {
					result = withDirection(compareText(a.title, b.title));
					break;
				}
				case "status": {
					result = withDirection(compareText(a.status, b.status));
					break;
				}
				case "priority": {
					const rankA = PRIORITY_RANK[(a.priority ?? "").toLowerCase()] ?? 0;
					const rankB = PRIORITY_RANK[(b.priority ?? "").toLowerCase()] ?? 0;
					result = withDirection(rankA - rankB);
					break;
				}
				case "milestone": {
					const milestoneA = getMilestoneLabel(a.milestone, milestoneEntities);
					const milestoneB = getMilestoneLabel(b.milestone, milestoneEntities);
					result = withDirection(compareText(milestoneA, milestoneB));
					break;
				}
				case "created": {
					const createdA = parseStoredUtcDate(a.createdDate)?.getTime();
					const createdB = parseStoredUtcDate(b.createdDate)?.getTime();
					if (createdA === undefined && createdB === undefined) {
						result = 0;
					} else if (createdA === undefined) {
						result = 1;
					} else if (createdB === undefined) {
						result = -1;
					} else {
						result = withDirection(createdA - createdB);
					}
					break;
				}
			}

			if (result !== 0) return result;
			return compareStateIdsAscending(b, a);
		});
	}, [displayStates, milestoneEntities, sortColumn, sortDirection]);

	const currentCount = sortedDisplayStates.length;

	useEffect(() => {
		const headerEl = tableHeaderScrollRef.current;
		const bodyEl = tableBodyScrollRef.current;
		if (!headerEl || !bodyEl) return;

		const syncScrollLeft = (source: HTMLDivElement, target: HTMLDivElement) => {
			if (isSyncingTableScrollRef.current) return;
			isSyncingTableScrollRef.current = true;
			target.scrollLeft = source.scrollLeft;
			isSyncingTableScrollRef.current = false;
		};

		const handleHeaderScroll = () => syncScrollLeft(headerEl, bodyEl);
		const handleBodyScroll = () => syncScrollLeft(bodyEl, headerEl);

		headerEl.addEventListener("scroll", handleHeaderScroll, { passive: true });
		bodyEl.addEventListener("scroll", handleBodyScroll, { passive: true });
		headerEl.scrollLeft = bodyEl.scrollLeft;

		return () => {
			headerEl.removeEventListener("scroll", handleHeaderScroll);
			bodyEl.removeEventListener("scroll", handleBodyScroll);
		};
	}, [currentCount]);

	return (
		<div className="container mx-auto px-4 py-8 transition-colors duration-200">
			<div className="flex flex-col gap-4 mb-6">
				<div className="flex items-center justify-between gap-3">
						<h1 className="text-2xl font-bold text-gray-900 dark:text-white">All States</h1>
						<button
							className="inline-flex items-center px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-400 dark:focus:ring-offset-gray-900 transition-colors duration-200"
							onClick={onNewState}
						>
							+ New State
					</button>
				</div>

				<div className="flex flex-wrap items-center gap-3 justify-between">
					<div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
						<div className="relative flex-1 basis-[200px] min-w-[180px] max-w-[280px]">
							<span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400 dark:text-gray-500">
								<svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
								</svg>
							</span>
						<input
							type="text"
							value={searchValue}
							onChange={(event) => handleSearchChange(event.target.value)}
							placeholder="Search states"
							className="w-full pl-10 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 focus:border-transparent transition-colors duration-200"
						/>
						{searchValue && (
								<button
									type="button"
									onClick={() => handleSearchChange("")}
									className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
								>
									<svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
								</svg>
							</button>
						)}
						</div>

					<select
						value={statusFilter}
						onChange={(event) => handleStatusChange(event.target.value)}
						className="min-w-[140px] h-10 py-2 px-3 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 transition-colors duration-200"
					>
						<option value="">All statuses</option>
						{availableStatuses.map((status) => (
							<option key={status} value={status}>
								{status}
							</option>
						))}
					</select>

					<select
						value={priorityFilter}
						onChange={(event) => handlePriorityChange(event.target.value as "" | SearchPriorityFilter)}
						className="min-w-[140px] h-10 py-2 px-3 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 transition-colors duration-200"
					>
						{PRIORITY_OPTIONS.map((option) => (
							<option key={option.value || "all"} value={option.value}>
								{option.label}
							</option>
						))}
					</select>

					<select
						value={milestoneFilter}
						onChange={(event) => handleMilestoneChange(event.target.value)}
						className="min-w-[160px] h-10 py-2 px-3 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 transition-colors duration-200"
					>
						<option value="">All milestones</option>
						<option value="__none">No milestone</option>
						{milestoneOptions.map((milestone) => (
							<option key={milestone} value={milestone}>
								{getMilestoneLabel(milestone, milestoneEntities)}
							</option>
						))}
					</select>

					<div className="relative">
						<button
							type="button"
							ref={labelsButtonRef}
							onClick={() => setShowLabelsMenu((open) => !open)}
							className="min-w-[200px] py-2 px-3 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 transition-colors duration-200 text-left"
						>
							<div className="flex items-center justify-between gap-2">
								<span>Labels</span>
								<span className="text-xs text-gray-500 dark:text-gray-400">
									{labelFilter.length === 0
										? "All"
										: labelFilter.length === 1
											? labelFilter[0]
											: `${labelFilter.length} selected`}
								</span>
							</div>
						</button>
						{showLabelsMenu && (
							<div
								ref={labelsMenuRef}
								className="absolute z-10 mt-2 w-[220px] max-h-56 overflow-y-auto rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg"
							>
								{mergedAvailableLabels.length === 0 ? (
									<div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No labels</div>
								) : (
									mergedAvailableLabels.map((label) => {
										const isSelected = labelFilter.includes(label);
										return (
											<label
												key={label}
												className="flex items-center gap-2 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
											>
												<input
													type="checkbox"
													checked={isSelected}
													onChange={() => {
														const next = isSelected
															? labelFilter.filter((item) => item !== label)
															: [...labelFilter, label];
														handleLabelChange(next);
													}}
													className="h-4 w-4 text-blue-600 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500"
												/>
												<span className="truncate">{label}</span>
											</label>
										);
									})
								)}
								{labelFilter.length > 0 && (
									<button
										type="button"
										className="w-full text-left px-3 py-2 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 border-t border-gray-200 dark:border-gray-700"
										onClick={() => {
											handleLabelChange([]);
											setShowLabelsMenu(false);
										}}
									>
										Clear label filter
									</button>
								)}
							</div>
						)}
					</div>

					</div>

					<div className="flex items-center gap-3 flex-shrink-0">
						{statusFilter.toLowerCase() === "done" && currentCount > 0 && (
								<button
									type="button"
									onClick={() => setShowCleanupModal(true)}
									className="py-2 px-3 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200 flex items-center gap-2 whitespace-nowrap"
									title="Clean up old completed states"
								>
									<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
								</svg>
								Clean Up
							</button>
						)}

							<div className="relative">
								<button
									type="button"
									onClick={hasActiveFilters ? handleClearFilters : undefined}
									className="py-2 px-3 text-sm border border-gray-300 dark:border-gray-600 rounded-lg whitespace-nowrap transition-colors duration-200 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
									style={{ visibility: hasActiveFilters ? "visible" : "hidden" }}
									aria-hidden={!hasActiveFilters}
								>
									Clear filters
							</button>
						</div>

						<div className="text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap text-right min-w-[170px]">
							Showing {currentCount} of {totalStates} states
						</div>
					</div>
				</div>

				{error && (
					<div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
						{error}
					</div>
				)}
			</div>

			{currentCount === 0 ? (
				<div className="text-center py-12">
					<svg className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
					</svg>
					<h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
						{hasActiveFilters ? "No states match the current filters" : "No states"}
					</h3>
					<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
						{hasActiveFilters
							? "Try adjusting your search or clearing filters to see more states."
							: "Get started by creating a new state."}
					</p>
				</div>
			) : (
				<div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
					<div className="sticky top-0 z-10 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/95 backdrop-blur supports-[backdrop-filter]:bg-gray-50/90 supports-[backdrop-filter]:dark:bg-gray-700/85">
						<div ref={tableHeaderScrollRef} className="overflow-x-auto" style={{ overflowY: "hidden" }}>
							<table className="w-full min-w-[1100px] table-fixed border-collapse">
								{renderColumnGroup()}
								<thead>
									<tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
										{renderSortableHeader("ID", "id")}
										{renderSortableHeader("Title", "title")}
										{renderSortableHeader("Status", "status")}
										{renderSortableHeader("Priority", "priority")}
										<th className="px-3 py-2">Labels</th>
										<th className="px-3 py-2">Assignee</th>
										{renderSortableHeader("Milestone", "milestone")}
										{renderSortableHeader("Created", "created")}
									</tr>
								</thead>
							</table>
						</div>
					</div>
					<div ref={tableBodyScrollRef} className="overflow-x-auto" style={{ overflowY: "hidden" }}>
						<table className="w-full min-w-[1100px] table-fixed border-collapse">
							{renderColumnGroup()}
							<tbody className="divide-y divide-gray-200 dark:divide-gray-700">
								{sortedDisplayStates.map((state) => {
									const isFromOtherBranch = Boolean(state.branch);
									const visibleLabels = state.labels.slice(0, 2);
									const labelOverflow = Math.max(state.labels.length - visibleLabels.length, 0);
									const visibleAssignees = state.assignee.slice(0, 2);
									const assigneeOverflow = Math.max(state.assignee.length - visibleAssignees.length, 0);
									const milestoneLabel = state.milestone ? getMilestoneLabel(state.milestone, milestoneEntities) : "—";
									const createdLabel = formatStoredUtcDateForCompactDisplay(state.createdDate ?? "");

									return (
										<tr
											key={state.id}
											onClick={() => onEditState(state)}
											className={`cursor-pointer transition-colors ${
												isFromOtherBranch
													? "bg-amber-50/50 hover:bg-amber-100/70 dark:bg-amber-900/10 dark:hover:bg-amber-900/20"
													: "bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700/50"
											}`}
										>
											<td className="px-3 py-2.5 text-xs font-mono text-gray-500 dark:text-gray-400 whitespace-nowrap">
												{state.id}
											</td>
											<td className="px-3 py-2.5">
												<div className="flex items-center gap-2 min-w-0">
													<span
														className={`block truncate text-sm ${
															isFromOtherBranch
																? "text-gray-600 dark:text-gray-300"
																: "text-gray-900 dark:text-gray-100"
														}`}
														title={state.title}
													>
														{state.title}
													</span>
													{isFromOtherBranch && state.branch && (
														<span
															className="inline-flex shrink-0 items-center rounded-circle bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
															title={`Read-only state from ${state.branch} branch`}
														>
															{state.branch}
														</span>
													)}
												</div>
											</td>
											<td className="px-3 py-2.5">
												<span className={`inline-flex rounded-circle px-2 py-0.5 text-[11px] font-medium ${getStatusColor(state.status)}`}>
													{state.status}
												</span>
											</td>
											<td className="px-3 py-2.5">
												{state.priority ? (
													<span
														className={`inline-flex rounded-circle px-2 py-0.5 text-[11px] font-medium ${getPriorityColor(state.priority)}`}
													>
														{state.priority}
													</span>
												) : (
													<span className="text-xs text-gray-300 dark:text-gray-600">—</span>
												)}
											</td>
											<td className="px-3 py-2.5">
												{visibleLabels.length > 0 ? (
													<div className="flex items-center gap-1 min-w-0">
														{visibleLabels.map((label) => (
															<span
																key={label}
																className="inline-flex max-w-[7rem] truncate rounded-circle bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700 dark:bg-gray-700 dark:text-gray-200"
																title={label}
															>
																{label}
															</span>
														))}
														{labelOverflow > 0 && (
															<span className="text-[11px] text-gray-500 dark:text-gray-400">+{labelOverflow}</span>
														)}
													</div>
												) : (
													<span className="text-xs text-gray-300 dark:text-gray-600">—</span>
												)}
											</td>
											<td className="px-3 py-2.5">
												{visibleAssignees.length > 0 ? (
													<div className="flex items-center gap-1.5">
														{visibleAssignees.map((assignee) => (
															<span
																key={assignee}
																title={assignee}
																className="inline-flex h-6 w-6 items-center justify-center rounded-circle bg-blue-100 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/50 dark:text-blue-200"
															>
																{getAssigneeInitials(assignee)}
															</span>
														))}
														{assigneeOverflow > 0 && (
															<span className="text-[11px] text-gray-500 dark:text-gray-400">+{assigneeOverflow}</span>
														)}
													</div>
												) : (
													<span className="text-xs text-gray-300 dark:text-gray-600">—</span>
												)}
											</td>
											<td className="px-3 py-2.5 text-xs text-gray-600 dark:text-gray-300 truncate" title={milestoneLabel}>
												{milestoneLabel}
											</td>
											<td className="px-3 py-2.5 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
												{createdLabel}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</div>
			)}

			{/* Cleanup Modal */}
			<CleanupModal
				isOpen={showCleanupModal}
				onClose={() => setShowCleanupModal(false)}
				onSuccess={handleCleanupSuccess}
			/>

			{/* Cleanup Success Toast */}
			{cleanupSuccessMessage && (
				<SuccessToast
					message={cleanupSuccessMessage}
					onDismiss={() => setCleanupSuccessMessage(null)}
					icon={
						<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
					}
				/>
			)}
		</div>
	);
};

export default StateList;
