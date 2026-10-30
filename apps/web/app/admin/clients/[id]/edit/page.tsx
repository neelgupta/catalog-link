import { redirect } from "next/navigation";

/** Editing happens in a pop-up on the client page now; old links open it there. */
export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/admin/clients/${(await params).id}?edit=1`);
}
