import { NextResponse } from "next/server";

import { createSession, hashPassword } from "@/lib/auth";
import { DEFAULT_WORKSPACE_ID, pool } from "@/lib/db";

export const runtime = "nodejs";

const MIN_PASSWORD = 8;

export async function POST(request: Request) {
  const { email, name, password } = await request.json();

  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Enter your name." }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD} characters.` },
      { status: 400 },
    );
  }

  const normalisedEmail = email.trim().toLowerCase();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows: existing } = await client.query(
      "SELECT 1 FROM users WHERE lower(email) = $1",
      [normalisedEmail],
    );
    if (existing.length > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "An account with that email already exists." },
        { status: 409 },
      );
    }

    // The first account to sign up runs the instance, so it gets the admin role.
    const { rows: counted } = await client.query("SELECT count(*)::int AS total FROM users");
    const isFirstUser = counted[0].total === 0;

    const { rows: created } = await client.query(
      `INSERT INTO users (email, name, password_hash, role)
       VALUES ($1, $2, $3, $4) RETURNING id, email, name, role`,
      [normalisedEmail, name.trim(), await hashPassword(password), isFirstUser ? "admin" : "user"],
    );
    const user = created[0];

    // The pre-auth workspace holds any documents and guides created before
    // accounts existed. Rather than orphan them, the first account adopts it.
    const { rowCount: adopted } = isFirstUser
      ? await client.query(
          "UPDATE workspaces SET owner_id = $1 WHERE id = $2 AND owner_id IS NULL",
          [user.id, DEFAULT_WORKSPACE_ID],
        )
      : { rowCount: 0 };

    if (!adopted) {
      await client.query("INSERT INTO workspaces (name, owner_id) VALUES ($1, $2)", [
        `${name.trim()}'s workspace`,
        user.id,
      ]);
    }

    await client.query("COMMIT");
    await createSession(user.id);

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
