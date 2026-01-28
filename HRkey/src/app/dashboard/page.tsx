import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function DashboardEntry() {
  redirect("/company/dashboard");
}
