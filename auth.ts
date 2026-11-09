import { compare } from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";
import { checkRateLimit, getPool } from "@/lib/server/db";

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(72),
});

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  providers: [
    CredentialsProvider({
      name: "Email e senha",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success || Buffer.byteLength(parsed.data.password, "utf8") > 72) return null;

        const email = parsed.data.email.trim().toLowerCase();
        const rateLimit = await checkRateLimit(`login:${email}`, 8, 15 * 60 * 1000);
        if (!rateLimit.allowed) return null;

        const result = await getPool().query<{
          id: string;
          name: string;
          email: string;
          password_hash: string;
          role: "customer" | "admin";
        }>(
          "SELECT id, name, email, password_hash, role FROM users WHERE email = $1",
          [email],
        );
        const user = result.rows[0];
        if (!user || !(await compare(parsed.data.password, user.password_hash))) return null;

        return { id: user.id, name: user.name, email: user.email, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
      }
      return session;
    },
  },
};
