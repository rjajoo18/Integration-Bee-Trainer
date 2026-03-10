import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { createHash, randomInt } from "crypto";
import { pool } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/email";

function normalizeEmail(raw: string): string {
  return raw.toLowerCase().trim();
}

function normalizeUsername(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_]/g, "").trim();
}

function validateUsername(u: string): string | null {
  if (!u) return "Username is required";
  if (u.length < 3) return "Username must be at least 3 characters";
  if (u.length > 20) return "Username must be at most 20 characters";
  if (!/^[a-z0-9_]+$/.test(u)) return "Username may only contain lowercase letters, numbers, and underscores";
  return null;
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = normalizeEmail(String(body.email ?? ""));
    const username = normalizeUsername(String(body.username ?? ""));
    const password = String(body.password ?? "");

    // Input validation
    if (!email || !password) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }
    const usernameError = validateUsername(username);
    if (usernameError) {
      return NextResponse.json({ error: usernameError }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const hashedPassword = await hash(password, 10);

    // Check for existing user with this email
    const existing = await pool.query(
      "SELECT id, email_verified, username FROM users WHERE email = $1",
      [email],
    );

    if (existing.rows.length > 0) {
      const existingUser = existing.rows[0];

      if (existingUser.email_verified) {
        return NextResponse.json(
          { error: "An account with this email already exists." },
          { status: 409 },
        );
      }

      // Unverified re-registration: check username is available (another user might have claimed it)
      if (existingUser.username !== username) {
        const usernameConflict = await pool.query(
          "SELECT id FROM users WHERE username = $1 AND id != $2",
          [username, existingUser.id],
        );
        if (usernameConflict.rows.length > 0) {
          return NextResponse.json({ error: "Username already taken" }, { status: 409 });
        }
      }

      // Update password and username for the unverified account
      await pool.query(
        "UPDATE users SET password = $1, username = $2 WHERE email = $3",
        [hashedPassword, username, email],
      );
    } else {
      // New user: check username availability first
      const usernameConflict = await pool.query(
        "SELECT id FROM users WHERE username = $1",
        [username],
      );
      if (usernameConflict.rows.length > 0) {
        return NextResponse.json({ error: "Username already taken" }, { status: 409 });
      }

      // Insert with email_verified = NULL (unverified)
      await pool.query(
        "INSERT INTO users (email, password, username, is_public) VALUES ($1, $2, $3, true)",
        [email, hashedPassword, username],
      );
    }

    // Rate-limit: max 3 verification code requests per 5 minutes per email
    const rateResult = await pool.query(
      `SELECT COUNT(*) FROM email_verification_tokens
       WHERE email = $1 AND created_at > NOW() - INTERVAL '5 minutes'`,
      [email],
    );
    if (parseInt(rateResult.rows[0].count) >= 3) {
      // User already has a live code — don't send again but report as success
      return NextResponse.json({ needsVerification: true }, { status: 200 });
    }

    // Invalidate any outstanding tokens for this email
    await pool.query(
      `UPDATE email_verification_tokens
       SET consumed_at = NOW()
       WHERE email = $1 AND consumed_at IS NULL AND expires_at > NOW()`,
      [email],
    );

    // Generate a cryptographically random 6-digit code
    const code = String(randomInt(100000, 1000000));
    const codeHash = hashCode(code);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await pool.query(
      `INSERT INTO email_verification_tokens (email, code_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [email, codeHash, expiresAt],
    );

    try {
      await sendVerificationEmail(email, code);
    } catch (emailErr) {
      console.error("[register] Email delivery failed:", emailErr);
    }

    return NextResponse.json({ needsVerification: true }, { status: 200 });
  } catch (error: any) {
    console.error("Registration Error:", error);
    return NextResponse.json(
      { error: error?.message ?? "Internal Server Error" },
      { status: 500 },
    );
  }
}
