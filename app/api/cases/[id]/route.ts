import { NextRequest, NextResponse } from "next/server";
import { apiError, parseIntegerParam } from "@/lib/api-helpers";
import { deleteCase, getCaseDetail, updateCase } from "@/services/workflow.service";
import type { CaseStatus } from "@/db/schema";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const caseId = parseIntegerParam(id, "Case ID");
    const detail = await getCaseDetail(caseId);
    return NextResponse.json(detail, { status: 200 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const caseId = parseIntegerParam(id, "Case ID");
    const body = await request.json();

    await updateCase(caseId, {
      title: body.title,
      description: body.description,
      customerName: body.customerName,
      status: body.status as CaseStatus | undefined,
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const caseId = parseIntegerParam(id, "Case ID");
    await deleteCase(caseId);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return apiError(error);
  }
}
