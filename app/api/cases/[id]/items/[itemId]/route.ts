import { NextRequest, NextResponse } from "next/server";
import { apiError, parseIntegerParam } from "@/lib/api-helpers";
import { deleteItem, getItemDetail, updateItem } from "@/services/workflow.service";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  try {
    const { itemId: itemIdStr } = await params;
    const itemId = parseIntegerParam(itemIdStr, "Item ID");
    const detail = await getItemDetail(itemId);
    return NextResponse.json(detail, { status: 200 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  try {
    const { itemId: itemIdStr } = await params;
    const itemId = parseIntegerParam(itemIdStr, "Item ID");
    const body = await request.json();

    await updateItem(itemId, {
      dateReported: body.dateReported,
      description: body.description,
      impact: body.impact,
      severity: body.severity,
      classification: body.classification,
      status: body.status,
      relatedItemIds: body.relatedItemIds,
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  try {
    const { itemId: itemIdStr } = await params;
    const itemId = parseIntegerParam(itemIdStr, "Item ID");
    await deleteItem(itemId);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return apiError(error);
  }
}
