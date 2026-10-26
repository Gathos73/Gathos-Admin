import { EditorialEditor } from "@/components/editorial-editor";
export default async function ContentPage({ params }: { params: Promise<{ contentId: string }> }) {
  const { contentId } = await params;
  return <EditorialEditor id={contentId} />;
}
