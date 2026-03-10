import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { pool } from "@/lib/db";

function normalizeEmail(raw: string): string {
  return raw.toLowerCase().trim();
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(String(body.email ?? ""));
    const code = String(body.code ?? "").trim();

    if (!email || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const codeHash = hashCode(code);

    // Look for a valid, unconsumed token that matches this email + code
    const tokenResult = await pool.query(
      `SELECT id, attempts FROM email_verification_tokens
       WHERE email = $1
         AND code_hash = $2
         AND consumed_at IS NULL
         AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [email, codeHash],
    );

    if (tokenResult.rows.length === 0) {
      // Increment attempt counter on any live token for this email (brute-force protection)
      await pool.query(
        `UPDATE email_verification_tokens
         SET attempts = attempts + 1
         WHERE email = $1 AND consumed_at IS NULL AND expires_at > NOW()`,
        [email],
      );
      return NextResponse.json(
        { error: "Invalid or expired code." },
        { status: 400 },
      );
    }

    const token = tokenResult.rows[0];

    if (token.attempts >= 5) {
      return NextResponse.json(
        { error: "Too many incorrect attempts. Please request a new code." },
        { status: 400 },
      );
    }

    // Mark the token as consumed immediately (single-use)
    await pool.query(
      `UPDATE email_verification_tokens SET consumed_at = NOW() WHERE id = $1`,
      [token.id],
    );

    // Mark the user's email as verified
    const updateResult = await pool.query(
      `UPDATE users SET email_verified = NOW()
       WHERE email = $1 AND email_verified IS NULL
       RETURNING id`,
      [email],
    );

    if (updateResult.rows.length === 0) {
      // User was already verified (edge case: double-submit)
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[verify-email] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
