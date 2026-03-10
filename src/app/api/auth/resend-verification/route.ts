import { NextRequest, NextResponse } from "next/server";
import { createHash, randomInt } from "crypto";
import { pool } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/email";

function normalizeEmail(raw: string): string {
  return raw.toLowerCase().trim();
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

// Always returns 200 with the same body — no email enumeration
const OK = () => NextResponse.json({ ok: true });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(String(body.email ?? ""));

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return OK();
    }

    // Only resend for accounts that exist and are still unverified
    const userResult = await pool.query(
      "SELECT id FROM users WHERE email = $1 AND email_verified IS NULL",
      [email],
    );
    if (userResult.rows.length === 0) {
      return OK(); // Verified or doesn't exist — silent
    }

    // Rate-limit: max 3 resends per 5 minutes per email
    const rateResult = await pool.query(
      `SELECT COUNT(*) FROM email_verification_tokens
       WHERE email = $1 AND created_at > NOW() - INTERVAL '5 minutes'`,
      [email],
    );
    if (parseInt(rateResult.rows[0].count) >= 3) {
      return OK();
    }

    // Invalidate existing live tokens
    await pool.query(
      `UPDATE email_verification_tokens
       SET consumed_at = NOW()
       WHERE email = $1 AND consumed_at IS NULL AND expires_at > NOW()`,
      [email],
    );

    // Issue a new token
    const code = String(randomInt(100000, 1000000));
    const codeHash = hashCode(code);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await pool.query(
      `INSERT INTO email_verification_tokens (email, code_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [email, codeHash, expiresAt],
    );

    try {
      await sendVerificationEmail(email, code);
    } catch (emailErr) {
      console.error("[resend-verification] Email delivery failed:", emailErr);
    }

    return OK();
  } catch (err) {
    console.error("[resend-verification] error:", err);
    return OK();
  }
}
