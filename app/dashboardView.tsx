"use client";

import { useMemo, useState } from "react";
import type { ReactElement } from "react";
import { FiArrowDown, FiArrowUp } from "react-icons/fi";
import InlineStatus from "@/app/ui/inlineStatus";
import { useSseRefresh } from "@/app/ui/useSseRefresh";

interface AssigneeTaskSummary {
  assigneeName: string | null;
  total: number;
}

interface ProjectIssueSummary {
  projectName: string;
  total: number;
}

interface DashboardViewProps {
  openTasksByAssignee: AssigneeTaskSummary[];
  overdueTaskCount: number;
  openIssuesByProject: ProjectIssueSummary[];
}

type SortDirection = "asc" | "desc";

function resolveAssigneeName(assigneeName: string | null): string {
  if (!assigneeName || !assigneeName.trim()) {
    return "Unassigned";
  }

  return assigneeName;
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

export default function DashboardView({
  openIssuesByProject,
  openTasksByAssignee,
  overdueTaskCount,
}: DashboardViewProps): ReactElement {
  useSseRefresh();
  const [taskFilter, setTaskFilter] = useState("");
  const [issueFilter, setIssueFilter] = useState("");
  const [taskSortDirection, setTaskSortDirection] = useState<SortDirection>(
    "desc",
  );
  const [issueSortDirection, setIssueSortDirection] = useState<SortDirection>(
    "desc",
  );

  const filteredAndSortedTasks = useMemo(() => {
    const normalizedFilter = taskFilter.trim().toLowerCase();
    const rows = openTasksByAssignee.filter((row) =>
      resolveAssigneeName(row.assigneeName).toLowerCase().includes(normalizedFilter),
    );

    return rows.sort((a, b) => {
      const countDelta = a.total - b.total;
      if (countDelta !== 0) {
        return taskSortDirection === "asc" ? countDelta : -countDelta;
      }

      const aName = resolveAssigneeName(a.assigneeName);
      const bName = resolveAssigneeName(b.assigneeName);
      return aName.localeCompare(bName);
    });
  }, [openTasksByAssignee, taskFilter, taskSortDirection]);

  const filteredAndSortedIssues = useMemo(() => {
    const normalizedFilter = issueFilter.trim().toLowerCase();
    const rows = openIssuesByProject.filter((row) =>
      row.projectName.toLowerCase().includes(normalizedFilter),
    );

    return rows.sort((a, b) => {
      const countDelta = a.total - b.total;
      if (countDelta !== 0) {
        return issueSortDirection === "asc" ? countDelta : -countDelta;
      }

      return a.projectName.localeCompare(b.projectName);
    });
  }, [issueFilter, issueSortDirection, openIssuesByProject]);

  const toggleTaskSortDirection = (): void => {
    setTaskSortDirection((current) => (current === "desc" ? "asc" : "desc"));
  };

  const toggleIssueSortDirection = (): void => {
    setIssueSortDirection((current) => (current === "desc" ? "asc" : "desc"));
  };

  const issueStatusMessage =
    overdueTaskCount > 0
      ? `${overdueTaskCount} ${pluralize(overdueTaskCount, "task", "tasks")} overdue`
      : "All tasks on track";
  const TaskSortIcon = taskSortDirection === "desc" ? FiArrowDown : FiArrowUp;
  const IssueSortIcon = issueSortDirection === "desc" ? FiArrowDown : FiArrowUp;

  return (
    <section className="dashboard-stack">
      <div className="kpi-grid">
        <article className="kpi-card">
          <p className="kpi-label">Overdue tasks</p>
          <p className="kpi-value">{overdueTaskCount}</p>
        </article>
        <article className="kpi-card">
          <p className="kpi-label">Active assignees</p>
          <p className="kpi-value">{openTasksByAssignee.length}</p>
        </article>
        <article className="kpi-card">
          <p className="kpi-label">Projects with open issues</p>
          <p className="kpi-value">{openIssuesByProject.length}</p>
        </article>
      </div>

      <InlineStatus
        tone={overdueTaskCount > 0 ? "error" : "success"}
        message={issueStatusMessage}
      />

      <section className="card">
        <div className="card-header">
          <h2>Open tasks by assignee</h2>
          <div className="card-controls">
            <input
              type="search"
              value={taskFilter}
              onChange={(event) => setTaskFilter(event.target.value)}
              className="filter-input"
              placeholder="Quick filter by assignee"
              aria-label="Filter assignees"
            />
            <button
              type="button"
              className="sort-button"
              onClick={toggleTaskSortDirection}
            >
              <span className="sort-button-content">
                <TaskSortIcon
                  className="sort-button-icon"
                  aria-hidden="true"
                />
                <span>
                  Sort {taskSortDirection === "desc" ? "highest first" : "lowest first"}
                </span>
              </span>
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Assignee</th>
                <th scope="col">Open tasks</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedTasks.length === 0 ? (
                <tr>
                  <td
                    colSpan={2}
                    className="empty-row"
                  >
                    No matching assignees.
                  </td>
                </tr>
              ) : (
                filteredAndSortedTasks.map((item, index) => (
                  <tr key={`${resolveAssigneeName(item.assigneeName)}-${index}`}>
                    <td>{resolveAssigneeName(item.assigneeName)}</td>
                    <td>{item.total}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <h2>Open issues by project</h2>
          </div>
          <div className="card-controls">
            <input
              type="search"
              value={issueFilter}
              onChange={(event) => setIssueFilter(event.target.value)}
              className="filter-input"
              placeholder="Quick filter by project"
              aria-label="Filter projects"
            />
            <button
              type="button"
              className="sort-button"
              onClick={toggleIssueSortDirection}
            >
              <span className="sort-button-content">
                <IssueSortIcon
                  className="sort-button-icon"
                  aria-hidden="true"
                />
                <span>
                  Sort {issueSortDirection === "desc" ? "highest first" : "lowest first"}
                </span>
              </span>
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Project</th>
                <th scope="col">Open issues</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedIssues.length === 0 ? (
                <tr>
                  <td
                    colSpan={2}
                    className="empty-row"
                  >
                    No matching projects.
                  </td>
                </tr>
              ) : (
                filteredAndSortedIssues.map((item) => (
                  <tr key={item.projectName}>
                    <td>{item.projectName}</td>
                    <td>{item.total}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
