import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ResourceManager } from "../../../components/resource-manager";
import {
  getResourceConfig,
  resourceKeyFromSlug,
  RESOURCE_ROUTE_SLUGS,
} from "../../../lib/resources";
import { getServerResourceList } from "../../../lib/server-auth";

interface ResourcePageProps {
  params: Promise<{ resource: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export function generateStaticParams() {
  return RESOURCE_ROUTE_SLUGS.map((resource) => ({ resource }));
}

export async function generateMetadata({ params }: ResourcePageProps): Promise<Metadata> {
  const { resource } = await params;
  const resourceKey = resourceKeyFromSlug(resource);
  if (!resourceKey) return {};
  return { title: getResourceConfig(resourceKey).label };
}

function ResourceFallback() {
  return (
    <div aria-busy="true" aria-label="Loading resource" className="resource-manager resource-loading">
      <div className="resource-header">
        <span className="skeleton-block skeleton-block--heading" />
      </div>
      <div className="resource-panel">
        <span className="skeleton-block" />
      </div>
    </div>
  );
}

export default async function ResourcePage({ params, searchParams }: ResourcePageProps) {
  const [{ resource }, parameters] = await Promise.all([params, searchParams]);
  const resourceKey = resourceKeyFromSlug(resource);
  if (!resourceKey) notFound();
  const config = getResourceConfig(resourceKey);
  const initialData = Object.keys(parameters).length === 0
    ? await getServerResourceList(resourceKey, {
        page: 1,
        pageSize: 50,
        orderBy: config.defaultOrder,
        descending: config.defaultDescending,
      })
    : null;

  return (
    <Suspense fallback={<ResourceFallback />}>
      <ResourceManager initialData={initialData} resourceKey={resourceKey} />
    </Suspense>
  );
}
