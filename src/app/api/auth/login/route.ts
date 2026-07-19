import { NextResponse } from "next/server";

import { createSession, verifyPassword } from "@/lib/auth";
import { pool } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { email, password } = await request.json();

  if (typeof email !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
  }

  const { rows } = await pool.query(
    "SELECT id, email, name, role, password_hash FROM users WHERE lower(email) = $1",
    [email.trim().toLowerCase()],
  );

  const user = rows[0];
  // Same message and roughly the same work either way, so the response doesn't
  // reveal which addresses have accounts.
  const valid = user ? await verifyPassword(password, user.password_hash) : false;
  if (!user || !valid) {
    return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
  }

  await createSession(user.id);
  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
}
