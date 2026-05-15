import nodemailer from "nodemailer";

const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

interface UnifiedEmailContentInput {
  headline: string;
  messageLines: string[];
  codeBlock?: string;
  actionLabel?: string;
  actionUrl?: string;
  footerLines?: string[];
  previewText?: string;
}

const APP_NAME = "Transxact Projects";
const COMPANY_WEBSITE = "projects.transxact.biz";
const COMPANY_EMAIL = "contact@transxact.biz";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeLines(lines: string[] | undefined): string[] {
  if (!lines) {
    return [];
  }

  return lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function createUnifiedEmailContent(
  input: UnifiedEmailContentInput,
): { text: string; html: string } {
  const messageLines = normalizeLines(input.messageLines);
  const footerLines = normalizeLines(input.footerLines);
  const safeHeadline = escapeHtml(input.headline.trim());
  const safePreviewText = escapeHtml(input.previewText ?? input.headline);
  const hasAction = Boolean(input.actionLabel && input.actionUrl);
  const hasCodeBlock = Boolean(input.codeBlock);
  const safeCodeBlock = hasCodeBlock ? escapeHtml(input.codeBlock!) : "";

  const textLines = [
    input.headline.trim(),
    "",
    ...messageLines,
    hasCodeBlock ? "" : null,
    hasCodeBlock ? `Code: ${input.codeBlock}` : null,
    hasAction ? "" : null,
    hasAction ? `${input.actionLabel}: ${input.actionUrl}` : null,
    footerLines.length > 0 ? "" : null,
    ...footerLines,
    "",
    `—`,
    `Transxact Projects`,
    `Web: ${COMPANY_WEBSITE}`,
    `Email: ${COMPANY_EMAIL}`,
  ].filter((line): line is string => typeof line === "string" && line.length > 0);

  const messageHtml = messageLines
    .map(
      (line) =>
        `<p style="margin:0 0 14px;color:#1f2937;font-size:15px;line-height:1.6;">${escapeHtml(line)}</p>`,
    )
    .join("");
  const codeBlockHtml = hasCodeBlock
    ? `<div style="background:#f0f5ff;border:1px solid #bfdbfe;border-radius:8px;padding:18px 16px;text-align:center;margin:18px 0;">
         <p style="margin:0;color:#1e40af;font-size:26px;font-weight:700;letter-spacing:.12em;font-family:ui-monospace,SFMono-Regular,'SF Mono',Consolas,'Liberation Mono',monospace;">${safeCodeBlock}</p>
       </div>`
    : "";
  const actionHtml = hasAction
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:18px 0 0;">
         <tr>
           <td style="border-radius:8px;">
             <a href="${escapeHtml(input.actionUrl ?? "")}" style="display:inline-block;padding:13px 24px;background:#2563eb;border-radius:8px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;line-height:1.2;">${escapeHtml(input.actionLabel ?? "Open")}</a>
           </td>
         </tr>
       </table>`
    : "";
  const customFooterHtml =
    footerLines.length > 0
      ? `<div style="margin-top:20px;padding-top:16px;border-top:1px solid #e5e7eb;">${footerLines
          .map(
            (line) =>
              `<p style="margin:0 0 6px;color:#6b7280;font-size:12px;line-height:1.5;">${escapeHtml(line)}</p>`,
          )
          .join("")}</div>`
      : "";

  const hasCustomFooter = footerLines.length > 0;
  const companyFooterHtml = `<div style="margin-top:${hasCustomFooter ? "16" : "20"}px;${hasCustomFooter ? "" : "padding-top:16px;border-top:1px solid #e5e7eb;"}">
    <p style="margin:0 0 4px;color:#9ca3af;font-size:12px;line-height:1.5;">${escapeHtml(APP_NAME)}</p>
    <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;">
      <a href="https://${COMPANY_WEBSITE}" style="color:#6b7280;text-decoration:none;">${escapeHtml(COMPANY_WEBSITE)}</a>
      &nbsp;·&nbsp;
      <a href="mailto:${COMPANY_EMAIL}" style="color:#6b7280;text-decoration:none;">${escapeHtml(COMPANY_EMAIL)}</a>
    </p>
  </div>`;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeHeadline}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;">${safePreviewText}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:32px auto;">
      <tr>
        <td style="background:#2563eb;padding:22px 32px;border-radius:12px 12px 0 0;">
          <p style="margin:0;color:#ffffff;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">${APP_NAME}</p>
        </td>
      </tr>
      <tr>
        <td style="background:#ffffff;padding:32px;border-radius:0 0 12px 12px;">
          <h1 style="margin:0 0 20px;color:#111827;font-size:22px;line-height:1.3;font-weight:700;">${safeHeadline}</h1>
          ${messageHtml}
          ${codeBlockHtml}
          ${actionHtml}
          ${customFooterHtml}
          ${companyFooterHtml}
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return {
    text: textLines.join("\n"),
    html,
  };
}

export async function sendEmail(options: EmailOptions) {
  try {
    await transport.sendMail({
      from: `Transxact Projects <${process.env.SMTP_USER}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
    console.log(`Email sent to ${options.to}`);
  } catch (error) {
    console.error(`Failed to send email to ${options.to}:`, error);
    throw error;
  }
}
