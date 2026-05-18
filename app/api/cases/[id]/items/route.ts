import { NextRequest, NextResponse } from "next/server";
import { apiError, parseIntegerParam } from "@/lib/api-helpers";
import { createItem } from "@/services/workflow.service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const caseId = parseIntegerParam(id, "Case ID");
    const body = await request.json();

    const result = await createItem({
      caseId,
      dateReported: body.dateReported ?? new Date().toISOString(),
      description: body.description,
      impact: body.impact ?? "one",
      severity: body.severity ?? "minor",
      classification: body.classification ?? "bug",
      relatedItemIds: body.relatedItemIds,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
