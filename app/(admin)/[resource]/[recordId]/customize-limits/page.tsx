import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CustomizeUserLimits } from "@/components/customize-user-limits";

export const metadata: Metadata = { title: "Customize limits" };

export default async function CustomizeLimitsPage({ params }: {
  params: Promise<{ resource: string; recordId: string }>;
}) {
  const { resource, recordId } = await params;
  if (resource !== "users") notFound();
  return <CustomizeUserLimits key={recordId} userId={recordId} />;
}
