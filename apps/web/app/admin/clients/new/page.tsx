import { redirect } from "next/navigation";

/** Adding a client happens in a pop-up on the Clients page now; old links open it there. */
export default function NewClientPage() {
  redirect("/admin/clients?add=1");
}
