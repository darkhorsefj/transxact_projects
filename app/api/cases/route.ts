import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-helpers";
import { createCase, listCases } from "@/services/workflow.service";

export async function GET(_request: NextRequest) {
  try {
    const cases = await listCases();
    return NextResponse.json(cases, { status: 200 });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, description, customerName, projectId } = body;

    if (!title) {
      return NextResponse.json(
        { error: "Title is required." },
        { status: 400 },
      );
    }

    if (!projectId) {
      return NextResponse.json(
        { error: "Project is required." },
        { status: 400 },
      );
    }

    const result = await createCase({ projectId, title, description, customerName });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
