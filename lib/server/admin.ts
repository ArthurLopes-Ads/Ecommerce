import { getServerSession } from "next-auth"
import { authOptions } from "@/auth"
import { getPool } from "@/lib/server/db"

export async function isCurrentAdmin(): Promise<boolean> {
  const session = await getServerSession(authOptions)
  if (!session?.user.id) return false

  const result = await getPool().query(
    "SELECT 1 FROM users WHERE id = $1 AND role = 'admin'",
    [session.user.id],
  )
  return result.rowCount === 1
}
