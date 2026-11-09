import { hash } from "bcryptjs";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, getPool } from "@/lib/server/db";
import { isTrustedOrigin } from "@/lib/server/origin";

const registrationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(72),
});

export async function POST(request: Request) {
  if (!isTrustedOrigin(request)) {
    return NextResponse.json({ error: "Origem da solicitação inválida." }, { status: 403 });
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = registrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados de cadastro inválidos." }, { status: 400 });
  }
  if (Buffer.byteLength(parsed.data.password, "utf8") > 72) {
    return NextResponse.json({ error: "Dados de cadastro inválidos." }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  const limit = await checkRateLimit(`register:${email}`, 4, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Tente novamente mais tarde." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const passwordHash = await hash(parsed.data.password, 12);

  try {
    await getPool().query(
      "INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)",
      [randomUUID(), parsed.data.name, email, passwordHash],
    );
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      return NextResponse.json({ error: "Não foi possível criar a conta com esses dados." }, { status: 409 });
    }

    console.error("User registration failed.", error);
    return NextResponse.json({ error: "Não foi possível criar a conta." }, { status: 500 });
  }

  return NextResponse.json({ message: "Conta criada." }, { status: 201 });
}
