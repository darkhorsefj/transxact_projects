import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-helpers";
import { uploadAttachment } from "@/services/attachment.service";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const taskIdRaw = formData.get("taskId");
    const issueIdRaw = formData.get("issueId");
    const actionIdRaw = formData.get("actionId");
    const commentIdRaw = formData.get("commentId");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    const taskId = taskIdRaw ? Number(taskIdRaw) : undefined;
    const issueId = issueIdRaw ? Number(issueIdRaw) : undefined;
    const actionId = actionIdRaw ? Number(actionIdRaw) : undefined;
    const commentId = commentIdRaw ? Number(commentIdRaw) : undefined;

    const result = await uploadAttachment(file, taskId, issueId, actionId, commentId);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
