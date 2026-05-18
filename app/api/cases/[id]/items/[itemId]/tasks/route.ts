import { NextRequest, NextResponse } from "next/server";
import { apiError, parseIntegerParam } from "@/lib/api-helpers";
import { createTask } from "@/services/workflow.service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  try {
    const { itemId: itemIdStr } = await params;
    const itemId = parseIntegerParam(itemIdStr, "Item ID");
    const body = await request.json();

    const result = await createTask({
      itemId,
      assigneeUserId: body.assigneeUserId,
      title: body.title,
      description: body.description,
      dueOn: body.dueOn ?? new Date().toISOString().slice(0, 10),
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
