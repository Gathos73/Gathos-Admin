import type { Metadata } from "next";
import { ComputeRegistry } from "@/components/compute-registry";

export const metadata: Metadata = { title: "GPUs & Services" };
export default function GpusPage() { return <ComputeRegistry />; }
