import type { Metadata } from "next";

import { GpuHealthDashboard } from "@/components/gpu-health-dashboard";

export const metadata: Metadata = {
  title: "GPU health",
};

export default function GpuHealthPage() {
  return <GpuHealthDashboard />;
}
