import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { pool } from "@/lib/db";

// Helper to sanitize BigInts
function sanitizeUser(user: any) {
  if (!user) return null;
  return {
    ...user,
    id: typeof user.id === 'bigint' ? Number(user.id) : user.id,
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Try to find the user
    let result = await pool.query(
      `SELECT id, name, email, bio, is_public, image 
       FROM users 
       WHERE email = $1`,
      [session.user.email]
    );

    // 2. If user doesn't exist (e.g. Google Login), CREATE them now
    if (result.rows.length === 0) {
      console.log("User not found in DB, creating new record for:", session.user.email);
      
      const insertResult = await pool.query(
        `INSERT INTO users (email, name, image, is_public) 
         VALUES ($1, $2, $3, $4) 
         RETURNING id, name, email, bio, is_public, image`,
        [
          session.user.email, 
          session.user.name || "New User", 
          session.user.image || null,
          true // Default is_public to true
        ]
      );
      result = insertResult;
    }

    return NextResponse.json(sanitizeUser(result.rows[0]));
  } catch (error) {
    console.error("Profile Fetch Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { name, bio, isPublic, image } = body;

    const query = `
      UPDATE users 
      SET 
        name = COALESCE($1, name),
        bio = COALESCE($2, bio),
        is_public = COALESCE($3, is_public),
        image = COALESCE($4, image)
      WHERE email = $5
      RETURNING id, name, email, bio, is_public, image
    `;

    const values = [name, bio, isPublic, image, session.user.email];
    const result = await pool.query(query, values);

    return NextResponse.json(sanitizeUser(result.rows[0]));
  } catch (error: any) {
    console.error("Profile Update Error:", error);
    return NextResponse.json({ error: error.message || "Failed to update" }, { status: 500 });
  }
}