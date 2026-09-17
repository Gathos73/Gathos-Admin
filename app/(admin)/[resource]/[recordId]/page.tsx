import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ResourceRecordPage } from "@/components/resource-record-page";
import { getResourceConfig, resourceKeyFromSlug } from "@/lib/resources";
import { getServerResourceRecord } from "@/lib/server-auth";

interface RecordPageProps {
  params: Promise<{ recordId: string; resource: string }>;
}

export async function generateMetadata({ params }: RecordPageProps): Promise<Metadata> {
  const { resource } = await params;
  const resourceKey = resourceKeyFromSlug(resource);
  if (!resourceKey) return {};
  const config = getResourceConfig(resourceKey);
  return { title: `View ${config.labelSingular}` };
}

export default async function RecordPage({ params }: RecordPageProps) {
  const { recordId, resource } = await params;
  const resourceKey = resourceKeyFromSlug(resource);
  if (!resourceKey) notFound();
  const initialResponse = await getServerResourceRecord(resourceKey, recordId);

  return (
    <ResourceRecordPage
      initialRecord={initialResponse?.row ?? null}
      mode="view"
      recordId={recordId}
      resourceKey={resourceKey}
      resourceSlug={resource}
    />
  );
}
