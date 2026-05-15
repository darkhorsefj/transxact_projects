"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReactElement } from "react";
import { toast } from "sonner";
import { FiCheckCircle, FiExternalLink } from "react-icons/fi";
import AppButton from "@/app/ui/appButton";
import InlineStatus from "@/app/ui/inlineStatus";
import { formatDateTime } from "@/lib/utils";
import {
  resolveMessageReport,
  type AdminMessageReportItem,
} from "@/services/report.service";

interface ReportsViewProps {
  reports: AdminMessageReportItem[];
}

interface StatusState {
  tone: "success" | "error" | "info";
  message: string;
}

export default function ReportsView({ reports }: ReportsViewProps): ReactElement {
  const router = useRouter();
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [status, setStatus] = useState<StatusState | null>(null);

  const handleResolve = async (reportId: number): Promise<void> => {
    setResolvingId(reportId);
    try {
      await resolveMessageReport(reportId);
      setStatus({ tone: "success", message: "Report marked as resolved." });
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to resolve report.";
      setStatus({ tone: "error", message });
      toast.error(message);
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <section className="workflow-stack">
      <section className="card">
        <div className="card-header">
          <div>
            <h2>Abuse report queue</h2>
            <p>Review conversation and message reports from users.</p>
          </div>
        </div>

        <InlineStatus
          tone={status?.tone ?? "info"}
          message={status?.message ?? null}
        />

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Status</th>
                <th scope="col">Reported by</th>
                <th scope="col">Participants</th>
                <th scope="col">Reason</th>
                <th scope="col">Message</th>
                <th scope="col">Created</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {reports.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="empty-row"
                  >
                    No reports in queue.
                  </td>
                </tr>
              ) : (
                reports.map((report) => (
                  <tr key={report.id}>
                    <td>{report.status}</td>
                    <td>{report.reporterLabel}</td>
                    <td>{report.participantsLabel}</td>
                    <td>{report.reason}</td>
                    <td>{report.messagePreview}</td>
                    <td>{formatDateTime(report.createdAt)}</td>
                    <td>
                      <div className="button-row">
                        <Link
                          href={`/messages?conversationId=${report.conversationId}`}
                          className="text-link"
                        >
                          <span className="icon-with-label">
                            <FiExternalLink aria-hidden="true" />
                            <span>Open convo</span>
                          </span>
                        </Link>
                        {report.status === "open" ? (
                          <AppButton
                            variant="secondary"
                            onClick={() => void handleResolve(report.id)}
                            isLoading={resolvingId === report.id}
                            loadingLabel="Updating..."
                            startIcon={<FiCheckCircle aria-hidden="true" />}
                          >
                            Resolve
                          </AppButton>
                        ) : null}
                      </div>
                    </td>
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
