"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CONTENT_LABELS, editorialApi, type ContentKind, type ContentData, type Draft } from "@/lib/editorial";

export function EditorialList({ blog = false }: { blog?: boolean }) {
  const router = useRouter();
  const [kind, setKind] = useState<ContentKind>(blog ? "blog" : "compare");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ items: Draft[]; total: number }>({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [topic, setTopic] = useState("");
  const [competitor, setCompetitor] = useState("");
  const [job, setJob] = useState<string | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true); setError("");
      const query = new URLSearchParams({ kind, status, search, page: String(page) });
      editorialApi<{ items: Draft[]; total: number }>(`content?${query}`, undefined, "GET", abort.signal)
        .then(setResult).catch(e => { if (!abort.signal.aborted) setError(e.message); })
        .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    }, 200);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [kind, status, search, page]);
  useEffect(() => {
    if (!job) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const data = await editorialApi<{ state: string; draft_id?: string; error?: string }>(`content-generation/jobs/${job}`);
        if (cancelled) return;
        if (data.state === "completed" && data.draft_id) {
          setJob(null); setBusy(false); router.push(`/content/${data.draft_id}`);
        } else if (data.state === "failed") {
          setError(data.error || "Generation failed"); setJob(null); setBusy(false);
          if (data.draft_id) router.push(`/content/${data.draft_id}`);
        } else timer = setTimeout(poll, 2000);
      } catch (e) { if (!cancelled) { setError((e as Error).message); setBusy(false); setJob(null); } }
    }
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [job, router]);
  async function create() {
    setBusy(true); setError("");
    try {
      const { templates } = await editorialApi<{ templates: Record<ContentKind, ContentData> }>("content/templates");
      const data: ContentData = kind === "blog" ? { title: "Untitled article", summary: "", eyebrow: "Blog", accent: "matcha", sections: [{ type: "p", text: "Write your article here." }], faqs: [], author: { name: "Gathos team" } } : { ...templates[kind], h1: "Untitled page", slug: null };
      delete data.slug;
      const { draft } = await editorialApi<{ draft: Draft }>("content", { kind, data });
      router.push(`/content/${draft.id}`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function generate() {
    setBusy(true); setError("");
    try {
      const data = await editorialApi<{ job_id: string }>("content-generation/jobs", { kind, topic, competitor });
      setJob(data.job_id);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  return <div className="compute-page editorial-page">
    <div className="record-page-header"><div><p className="section-kicker">Publishing</p><h1>{blog ? "Blog" : "SEO pages"}</h1><p className="compute-section-description">Create, review and publish content on the public site.</p></div><button className="button button--primary" disabled={busy} onClick={create}>New {CONTENT_LABELS[kind].toLowerCase()}</button></div>
    <div className="editorial-toolbar">
      {!blog && <label>Page type<select value={kind} onChange={e => { setKind(e.target.value as ContentKind); setPage(1); }}>{Object.entries(CONTENT_LABELS).filter(([k]) => k !== "blog").map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select></label>}
      <label>Status<select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">All</option>{["draft", "published", "archived", "failed"].map(s => <option key={s}>{s}</option>)}</select></label>
      <label className="editorial-search">Search<input type="search" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Title or slug" /></label>
    </div>
    {error && <p role="alert" className="compute-notice compute-notice--error">{error}</p>}
    <div className="compute-inventory"><div className="compute-table-wrap"><table className="compute-table"><thead><tr><th>Title</th><th>URL</th><th>Status</th><th>Updated</th></tr></thead><tbody>{loading ? <tr><td colSpan={4}>Loading content…</td></tr> : result.items.length === 0 ? <tr><td colSpan={4}>No pages found.</td></tr> : result.items.map(d => <tr key={d.id}><td><Link className="compute-name" href={`/content/${d.id}`}>{d.title}</Link>{d.has_unpublished_changes && <small>Unpublished changes</small>}</td><td>{d.slug || "No slug yet"}</td><td>{d.status}</td><td>{new Date(d.updated_at).toLocaleDateString()}</td></tr>)}</tbody></table></div>
    <div className="compute-pagination"><span>{result.total} pages</span><button className="button" disabled={page === 1 || loading} onClick={() => setPage(p => p-1)}>Previous</button><span>Page {page}</span><button className="button" disabled={page*25 >= result.total || loading} onClick={() => setPage(p => p+1)}>Next</button></div></div>
    {["blog", "compare", "skill"].includes(kind) && <section className="compute-form-section"><h2>Draft with AI</h2><p className="compute-section-description">Generation runs in the background. Review the result before publishing.</p><div className="editorial-toolbar"><label className="editorial-search">Topic<textarea value={topic} onChange={e => setTopic(e.target.value)} maxLength={600} rows={3} /></label>{kind === "compare" && <label>Competitor<input value={competitor} onChange={e => setCompetitor(e.target.value)} maxLength={80} /></label>}<button className="button" disabled={busy || topic.trim().length < 8 || (kind === "compare" && competitor.trim().length < 2)} onClick={generate}>{job ? "Generating…" : "Generate draft"}</button></div></section>}
  </div>;
}
