import { redirect } from "next/navigation";

/** Editing a plan happens in a pop-up on the Plans page now; old links open it there. */
export default async function EditPlanPage({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/admin/plans?edit=${encodeURIComponent((await params).id)}`);
}
