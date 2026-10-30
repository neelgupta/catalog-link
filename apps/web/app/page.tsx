import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";

export default async function Home() {
  const session = await getStaffSession();
  if (!session) redirect("/login");
  redirect(session.role === "SUPER_ADMIN" ? "/admin" : "/app");
}
