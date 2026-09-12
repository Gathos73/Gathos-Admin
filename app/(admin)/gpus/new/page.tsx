import type { Metadata } from "next";
import { ComputeGpuPage } from "@/components/compute-registry";

export const metadata: Metadata = { title: "Add GPU" };
export default function NewGpuPage() { return <ComputeGpuPage />; }
