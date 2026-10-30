"use client";

import { useRouter } from "next/navigation";
import { CustomerLogin } from "../_components/customer-login";

/** OTP login for "My orders"; reloads the page once verified. */
export function LoginGate({ slug, devHint }: { slug: string; devHint: boolean }) {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-sm rounded-2xl bg-white p-5 ring-1 ring-stone-200">
      <CustomerLogin slug={slug} devHint={devHint} title="See your orders" onVerified={() => router.refresh()} />
    </div>
  );
}

export function LogoutButton({ slug }: { slug: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch(`/api/v1/public/c/${slug}/logout`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
        router.refresh();
      }}
      className="text-sm text-stone-500 underline"
    >
      Not you? Log out
    </button>
  );
}
