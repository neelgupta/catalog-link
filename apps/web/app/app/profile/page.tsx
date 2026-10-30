import { parseBankDetails } from "@cataloglink/core/profile";
import { prisma } from "@cataloglink/db";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireClient } from "@/lib/auth";
import { updateProfileAction } from "./actions";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const { clientId } = await requireClient();
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
  const bank = parseBankDetails(client.bankDetails);

  return (
    <>
      <PageHeader title="Business profile" subtitle="Shown to customers on your catalog links and at checkout." />
      <ProfileForm
        action={updateProfileAction}
        profile={{
          businessName: client.businessName,
          whatsappNumber: client.whatsappNumber ?? "",
          loginMobile: client.mobile,
          loginEmail: client.email,
          city: client.city,
          address: client.address ?? "",
          gst: client.gst ?? "",
          logoUrl: client.logoUrl,
          bannerUrl: client.bannerUrl,
          upiQrUrl: client.upiQrUrl,
          upiId: client.upiId ?? "",
          paymentModes: client.paymentModes,
          bankAccountName: bank?.accountName ?? "",
          bankAccountNumber: bank?.accountNumber ?? "",
          bankIfsc: bank?.ifsc ?? "",
          bankName: bank?.bankName ?? "",
          bankBranch: bank?.branch ?? "",
        }}
      />
    </>
  );
}
