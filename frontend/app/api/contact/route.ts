import { Resend } from "resend";
import { NextRequest, NextResponse } from "next/server";

const resend = new Resend(process.env.NEXT_PUBLIC_RESEND_API_KEY);

const CONTACT_TO = "benbalthes@gmail.com";
const FROM = "Venue Voice <info@venuevoice.com.au>";

function buildHtml(data: {
  name: string;
  company: string;
  email: string;
  phone?: string;
  num_locations: number;
  message: string;
}): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
        <tr>
          <td style="background:#7c3aed;padding:32px 40px;">
            <p style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">New Contact Form Submission</p>
            <p style="margin:8px 0 0;color:#ddd6fe;font-size:14px;">via Venue Voice</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${row("Name", esc(data.name))}
              ${row("Company", esc(data.company))}
              ${row("Email", esc(data.email))}
              ${row("Phone", data.phone ? esc(data.phone) : "—")}
              ${row("Locations", String(data.num_locations))}
              ${row("Message", esc(data.message).replace(/\n/g, "<br>"))}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 40px 32px;color:#6b7280;font-size:12px;">
            This email was sent automatically from the Venue Voice contact form.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;width:140px;vertical-align:top;color:#6b7280;font-size:14px;">${label}</td>
    <td style="padding:10px 0 10px 16px;border-bottom:1px solid #f3f4f6;vertical-align:top;color:#111827;font-size:14px;">${value}</td>
  </tr>`;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, company, email, phone, num_locations, message } = body;

  if (!name || !company || !email || !num_locations || !message) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (typeof num_locations !== "number" || num_locations < 1) {
    return NextResponse.json({ error: "num_locations must be at least 1" }, { status: 400 });
  }

  const { error } = await resend.emails.send({
    from: FROM,
    to: [CONTACT_TO],
    subject: `New enquiry from ${name} — ${company}`,
    html: buildHtml({ name, company, email, phone, num_locations, message }),
  });

  if (error) {
    console.error("Resend error:", error);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
