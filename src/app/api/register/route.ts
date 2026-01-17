// src/app/api/register/route.ts
import { NextResponse } from "next/server";
import { Pool } from "pg";
import bcrypt from "bcrypt";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

}

// Use the same Pool setup as your integrals API
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Missing email or password" }, { status: 400 });
    }

    // 1. Hash the password before saving
    const hashedPassword = await bcrypt.hash(password, 10);

    // 2. Insert the user into the Neon database
    await pool.query(
      "INSERT INTO users (email, password) VALUES ($1, $2)",
      [email, hashedPassword]
    );

    return NextResponse.json({ message: "User created successfully" }, { status: 201 });
  } catch (error: any) {
    // Handle unique constraint violation (user already exists)
    if (error.code === '23505') {
      return NextResponse.json({ error: "User already exists" }, { status: 400 });
    }
    console.error("Registration Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}