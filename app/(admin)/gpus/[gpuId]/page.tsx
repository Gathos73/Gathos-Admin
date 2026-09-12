import type { Metadata } from "next";
import { ComputeGpuPage } from "@/components/compute-registry";

export const metadata: Metadata = { title: "GPU configuration" };
export default async function GpuPage({ params }: { params: Promise<{ gpuId: string }> }) {
  const { gpuId } = await params;
  return <ComputeGpuPage gpuId={gpuId} />;
}
