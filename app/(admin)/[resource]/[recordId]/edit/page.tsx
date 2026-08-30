import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ResourceRecordPage } from "@/components/resource-record-page";
import { getResourceConfig, resourceKeyFromSlug } from "@/lib/resources";

interface EditRecordPageProps {
  params: Promise<{ recordId: string; resource: string }>;
}

export async function generateMetadata({ params }: EditRecordPageProps): Promise<Metadata> {
  const { resource } = await params;
  const resourceKey = resourceKeyFromSlug(resource);
  if (!resourceKey) return {};
  const config = getResourceConfig(resourceKey);
  return { title: `Edit ${config.labelSingular}` };
}

export default async function EditRecordPage({ params }: EditRecordPageProps) {
  const { recordId, resource } = await params;
  const resourceKey = resourceKeyFromSlug(resource);
  if (!resourceKey || !getResourceConfig(resourceKey).canEdit) notFound();

  return (
    <ResourceRecordPage
      mode="edit"
      recordId={recordId}
      resourceKey={resourceKey}
      resourceSlug={resource}
    />
  );
}
