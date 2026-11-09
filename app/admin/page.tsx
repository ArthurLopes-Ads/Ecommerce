import { redirect } from "next/navigation"
import AdminProducts from "@/components/admin-products"
import { isCurrentAdmin } from "@/lib/server/admin"

export const dynamic = "force-dynamic"

export default async function AdminPage() {
  if (!(await isCurrentAdmin())) redirect("/")

  return <AdminProducts />
}
