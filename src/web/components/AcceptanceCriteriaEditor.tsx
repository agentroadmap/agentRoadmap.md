import React, { useState, useEffect } from "react";
import { type Task } from "../../types";
import { AcceptanceCriteriaManager, type AcceptanceCriterion } from "../../core/acceptance-criteria.ts";
import { apiClient } from "../lib/api";

interface Props {
  // Existing task (for immediate persistence)
  task?: Task;
  // Full markdown body of the task
  body: string;
  // Callback when body updates
  onChange: (body: string) => void;
}

const AcceptanceCriteriaEditor: React.FC<Props> = ({ task, body, onChange }) => {
  const [criteria, setCriteria] = useState<AcceptanceCriterion[]>(() =>
    AcceptanceCriteriaManager.parseAcceptanceCriteria(body),
  );
  const [newCriterion, setNewCriterion] = useState("");

  useEffect(() => {
    setCriteria(AcceptanceCriteriaManager.parseAcceptanceCriteria(body));
  }, [body]);

  const persist = (updated: AcceptanceCriterion[]) => {
    const updatedBody = AcceptanceCriteriaManager.updateContent(body, updated);
    onChange(updatedBody);
    if (task) {
      void apiClient.updateTask(task.id, { body: updatedBody });
    }
  };

  const handleToggle = (index: number, checked: boolean) => {
    const updated = criteria.map((c) =>
      c.index === index ? { ...c, checked } : c,
    );
    setCriteria(updated);
    persist(updated);
  };

  const handleTextChange = (index: number, text: string) => {
    const updated = criteria.map((c) =>
      c.index === index ? { ...c, text } : c,
    );
    setCriteria(updated);
    persist(updated);
  };

  const handleRemove = (index: number) => {
    const updated = criteria
      .filter((c) => c.index !== index)
      .map((c, i) => ({ ...c, index: i + 1 }));
    setCriteria(updated);
    persist(updated);
  };

  const handleAdd = () => {
    const text = newCriterion.trim();
    if (!text) return;
    const updated = [
      ...criteria,
      { checked: false, text, index: criteria.length + 1 },
    ];
    setCriteria(updated);
    setNewCriterion("");
    persist(updated);
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 transition-colors duration-200">
        Acceptance Criteria
      </label>
      <ul className="space-y-2">
        {criteria.map((c) => (
          <li key={c.index} className="flex items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              checked={c.checked}
              onChange={(e) => handleToggle(c.index, e.target.checked)}
            />
            <input
              type="text"
              value={c.text}
              onChange={(e) => handleTextChange(c.index, e.target.value)}
              className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 focus:border-transparent transition-colors duration-200"
            />
            <button
              type="button"
              onClick={() => handleRemove(c.index)}
              className="px-2 py-1 text-sm text-red-600 dark:text-red-400 hover:underline"
            >
              Remove
            </button>
          </li>
        ))}
        <li className="flex items-center gap-2">
          <input
            type="text"
            value={newCriterion}
            onChange={(e) => setNewCriterion(e.target.value)}
            placeholder="New criterion"
            className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 focus:border-transparent transition-colors duration-200"
          />
          <button
            type="button"
            onClick={handleAdd}
            className="px-2 py-1 text-sm bg-blue-500 dark:bg-blue-600 text-white rounded-md hover:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 focus:ring-blue-400 dark:focus:ring-blue-500 transition-colors duration-200"
          >
            Add
          </button>
        </li>
      </ul>
    </div>
  );
};

export default AcceptanceCriteriaEditor;
