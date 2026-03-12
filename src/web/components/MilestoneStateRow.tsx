import React from "react";
import type { State } from "../../types";

interface MilestoneStateRowProps {
	state: State;
	isDone: boolean;
	statusBadgeClass: string;
	priorityBadgeClass: string;
	onEditState: (state: State) => void;
	onDragStart: (event: React.DragEvent, state: State) => void;
	onDragEnd: (event: React.DragEvent) => void;
}

const DragHandle = () => (
	<svg className="w-4 h-4 text-gray-400 cursor-grab active:cursor-grabbing" viewBox="0 0 24 24" fill="currentColor">
		<circle cx="9" cy="6" r="1.5" />
		<circle cx="15" cy="6" r="1.5" />
		<circle cx="9" cy="12" r="1.5" />
		<circle cx="15" cy="12" r="1.5" />
		<circle cx="9" cy="18" r="1.5" />
		<circle cx="15" cy="18" r="1.5" />
	</svg>
);

const MilestoneStateRow: React.FC<MilestoneStateRowProps> = ({
	state,
	isDone,
	statusBadgeClass,
	priorityBadgeClass,
	onEditState,
	onDragStart,
	onDragEnd,
}) => (
	<div
		draggable
		onDragStart={(event) => onDragStart(event, state)}
		onDragEnd={onDragEnd}
		onClick={() => onEditState(state)}
		className="group grid grid-cols-[auto_auto_1fr_auto_auto] gap-3 items-center px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
	>
		<div className="w-6 flex justify-center opacity-40 group-hover:opacity-100 transition-opacity">
			<DragHandle />
		</div>

		<div className={`w-24 text-xs font-mono text-gray-500 dark:text-gray-400 whitespace-nowrap ${isDone ? "opacity-60" : ""}`}>
			{state.id}
		</div>

		<div className={`min-w-0 overflow-hidden ${isDone ? "opacity-60" : ""}`}>
			<span
				className={`text-sm truncate block whitespace-nowrap ${
					isDone ? "line-through text-gray-500" : "text-gray-900 dark:text-gray-100"
				}`}
			>
				{state.title}
			</span>
		</div>

		<div className="w-24 flex justify-center">
			<span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${statusBadgeClass}`}>{state.status}</span>
		</div>

		<div className="w-20 flex justify-center">
			{state.priority ? (
				<span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${priorityBadgeClass}`}>
					{state.priority}
				</span>
			) : (
				<span className="text-xs text-gray-300 dark:text-gray-600">—</span>
			)}
		</div>
	</div>
);

export default MilestoneStateRow;
