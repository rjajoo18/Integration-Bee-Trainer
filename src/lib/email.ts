import nodemailer from 'nodemailer';

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth: { user, pass },
  });
}

export async function sendVerificationEmail(to: string, code: string): Promise<void> {
  const transporter = createTransporter();

  if (!transporter) {
    // Dev fallback: print code to server console so you can test without SMTP configured
    console.log(`\n[EMAIL DEV] Verification code for ${to}: ${code}\n`);
    return;
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  await transporter.sendMail({
    from: `"Integration Bee" <${from}>`,
    to,
    subject: 'Verify your Integration Bee account',
    html: `<!DOCTYPE html>
<html>
<body style="background:#0d1117;font-family:sans-serif;padding:32px;margin:0;">
  <div style="max-width:480px;margin:0 auto;background:#161b22;border-radius:16px;padding:40px;border:1px solid #30363d;">
    <h1 style="color:#e6edf3;font-size:22px;margin:0 0 8px;">Integration Bee Trainer</h1>
    <p style="color:#8b949e;font-size:15px;margin:0 0 8px;">Welcome! Enter this code to verify your email and activate your account:</p>
    <div style="background:#0d1117;border-radius:12px;padding:28px;text-align:center;border:1px solid #30363d;margin:24px 0;">
      <span style="font-size:44px;font-weight:900;letter-spacing:14px;color:#58a6ff;font-family:monospace;">${code}</span>
    </div>
    <p style="color:#8b949e;font-size:13px;margin:0;">
      This code expires in <strong style="color:#e6edf3;">15 minutes</strong>.
      If you didn't create an account, ignore this email — nothing will happen.
    </p>
  </div>
</body>
</html>`,
    text: `Your Integration Bee verification code is: ${code}\n\nThis code expires in 15 minutes.`,
  });
}
