"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CONTENT_LABELS, editorialApi, type ContentData, type Draft, type Value } from "@/lib/editorial";

const label = (key: string) => key.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase());
function blank(value: Value): Value {
  if (Array.isArray(value)) return [];
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, blank(v)]));
  return typeof value === "number" ? 0 : typeof value === "boolean" ? false : "";
}
function Field({ name, value, onChange }: { name: string; value: Value; onChange: (v: Value) => void }) {
  if (name === "type" && typeof value === "string") return <p className="compute-muted">Block type: {value}</p>;
  if (Array.isArray(value)) return <fieldset className="editorial-fieldset"><legend>{label(name)}</legend>{value.map((item, i) => <div className="editorial-array-item" key={i}><Field name={`${name} ${i+1}`} value={item} onChange={v => onChange(value.map((old, j) => j === i ? v : old))} /><div className="editorial-row-actions"><button type="button" className="button" disabled={i === 0} onClick={() => { const next = [...value]; [next[i-1], next[i]] = [next[i], next[i-1]]; onChange(next); }}>Move up</button><button type="button" className="button" disabled={i === value.length-1} onClick={() => { const next = [...value]; [next[i+1], next[i]] = [next[i], next[i+1]]; onChange(next); }}>Move down</button><button type="button" className="button" onClick={() => onChange(value.filter((_, j) => i !== j))}>Remove</button></div></div>)}<button type="button" className="button" onClick={() => onChange([...value, value.length ? blank(value[0]) : name === "faqs" ? { q: "", a: "" } : name === "sections" ? { type: "p", text: "" } : ""])}>Add {label(name)}</button></fieldset>;
  if (value && typeof value === "object") return <fieldset className="editorial-fieldset"><legend>{label(name)}</legend>{Object.entries(value).map(([key, v]) => <Field key={key} name={key} value={v} onChange={next => onChange({ ...value, [key]: next })} />)}</fieldset>;
  return <label className="editorial-field">{label(name)}{typeof value === "boolean" ? <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} /> : typeof value === "number" ? <input type="number" value={value} onChange={e => onChange(Number(e.target.value))} /> : <textarea rows={String(value || "").length > 160 ? 5 : 2} value={String(value ?? "")} onChange={e => onChange(e.target.value)} />}</label>;
}
const blockTemplates: Record<string, ContentData> = {
  p: { type: "p", text: "" }, lead: { type: "lead", text: "" }, h2: { type: "h2", text: "" },
  ul: { type: "ul", items: [""] }, quote: { type: "quote", text: "" }, stat: { type: "stat", value: "", label: "", source: "" },
  "callout-skill": { type: "callout-skill", name: "", description: "", slug: "" },
  image: { type: "image", src: "", alt: "" }, code: { type: "code", text: "" }, html: { type: "html", html: "" },
};
export function EditorialEditor({ id }: { id: string }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [form, setForm] = useState<ContentData>({});
  const [json, setJson] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState("");
  const [blockType, setBlockType] = useState("p");
  const dirty = !!draft && (JSON.stringify(form) !== JSON.stringify(draft.data) || (json !== null && json !== JSON.stringify(form, null, 2)));
  useEffect(() => {
    const abort = new AbortController();
    editorialApi<{ draft: Draft }>(`content/${id}`, undefined, "GET", abort.signal).then(({ draft }) => { setDraft(draft); setForm(draft.data); }).catch(e => { if (!abort.signal.aborted) setError(e.message); });
    return () => abort.abort();
  }, [id]);
  useEffect(() => {
    function warn(event: BeforeUnloadEvent) { if (dirty) event.preventDefault(); }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function set(key: string, value: Value) { setForm(old => ({ ...old, [key]: value })); setMessage(""); }
  async function action(kind: "save" | "publish" | "archive" | "preview") {
    if (!draft) return;
    if (kind === "archive" && !window.confirm("Take this page offline? You can edit and publish it again later.")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      if (kind === "preview") {
        const data = await editorialApi<{ url: string }>(`content/${id}/preview`, {});
        setPreview(data.url); return;
      }
      let next = draft;
      if (kind === "save" || (kind === "publish" && dirty)) {
        const content = json === null ? form : JSON.parse(json);
        if (!content || Array.isArray(content) || typeof content !== "object") throw new Error("Content JSON must be an object");
        next = (await editorialApi<{ draft: Draft }>(`content/${id}`, { data: content, expected_updated_at: draft.updated_at }, "PATCH")).draft;
        // Keep the new revision even when subsequent publication validation fails.
        setDraft(next); setForm(next.data); setJson(null); setPreview("");
      }
      if (kind !== "save") next = (await editorialApi<{ draft: Draft }>(`content/${id}/${kind}`, { expected_updated_at: next.updated_at })).draft;
      setDraft(next); setForm(next.data); setJson(null); setPreview("");
      setMessage(kind === "save" ? "Draft saved. Publish when it is ready." : kind === "publish" ? "Published. Public caches refresh within a minute." : "Page archived and taken offline.");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  if (!draft) return <div className="compute-page">{error ? <p role="alert">{error}</p> : <p>Loading editor…</p>}</div>;
  const titleKey = draft.type === "blog" ? "title" : "h1";
  const primary = [titleKey, "slug", "summary", ...(draft.type === "blog" ? ["eyebrow", "seoTitle", "metaDescription", "ogTitle", "socialImage", "author", "keywords"] : ["metaTitle", "metaDesc", "socialImage"])];
  return <div className="compute-page editorial-page">
    <Link href={draft.type === "blog" ? "/blog" : "/seo"} className="compute-back">← Back to {draft.type === "blog" ? "blog" : "SEO pages"}</Link>
    <div className="record-page-header"><div><p className="section-kicker">{CONTENT_LABELS[draft.type]} · {draft.status}{draft.has_unpublished_changes ? " · Unpublished changes" : ""}</p><h1>{String(form[titleKey] || "Untitled")}</h1></div></div>
    <div className="editorial-toolbar"><button className="button button--primary" disabled={busy || !dirty} onClick={() => action("save")}>Save draft</button><button className="button" disabled={busy || dirty} title={dirty ? "Save changes before previewing" : "Preview saved draft"} onClick={() => action("preview")}>Preview saved draft</button><button className="button button--primary" disabled={busy} onClick={() => action("publish")}>{draft.status === "published" ? "Publish changes" : "Publish"}</button><button className="button" disabled={busy || draft.status === "archived"} onClick={() => action("archive")}>Archive / unpublish</button><button className="button" disabled={busy} onClick={() => { if (json !== null) { try { const parsed = JSON.parse(json); if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("Content must be an object"); setForm(parsed); setJson(null); } catch (e) { setError((e as Error).message); } } else setJson(JSON.stringify(form, null, 2)); }}>{json === null ? "Edit JSON" : "Use form"}</button></div>
    <p className="compute-muted">Saving keeps a working draft. Publishing updates the public page. {dirty ? "You have unsaved changes." : "All changes saved."}</p>
    {error && <p className="compute-notice compute-notice--error" role="alert">{error}</p>}{draft.error && <p className="compute-notice compute-notice--error">Generation error: {draft.error}</p>}{message && <p className="compute-notice" role="status">{message}</p>}
    {preview && <section className="compute-form-section"><div className="editorial-toolbar"><h2>Draft preview</h2><a href={preview} target="_blank" rel="noreferrer">Open preview ↗</a></div><p className="compute-muted">This private preview expires after five minutes.</p><iframe title="Draft preview" src={preview} sandbox="allow-scripts" className="editorial-preview" /></section>}
    {json !== null ? <label className="editorial-field">Content JSON<textarea className="editorial-json" rows={30} value={json} onChange={e => setJson(e.target.value)} /></label> : <>
      <section className="compute-form-section"><h2>Page details and metadata</h2>{primary.map(key => <Field key={key} name={key} value={form[key] ?? (key === "author" ? { name: "", title: "", url: "", image: "" } : "")} onChange={value => set(key, value)} />)}</section>
      <section className="compute-form-section"><h2>Content</h2>{Object.entries(form).filter(([key]) => !primary.includes(key) && !["sections", "publishedAt", "updatedAt"].includes(key)).map(([key, value]) => <Field key={key} name={key} value={value} onChange={next => set(key, next)} />)}
      {draft.type === "blog" && <><Field name="sections" value={form.sections || []} onChange={value => set("sections", value)} /><div className="editorial-toolbar"><label>Add a block<select value={blockType} onChange={e => setBlockType(e.target.value)}>{Object.keys(blockTemplates).map(t => <option key={t} value={t}>{label(t)}</option>)}</select></label><button className="button" onClick={() => set("sections", [...(Array.isArray(form.sections) ? form.sections : []), structuredClone(blockTemplates[blockType])])}>Add block</button></div>{form.bodyHtml && <p className="compute-muted">This migrated article uses the HTML body above. Clear that field to use section blocks instead.</p>}</>}
      </section>
    </>}
    {!!draft.versions.length && <section className="compute-form-section"><h2>Previous published versions</h2><p className="compute-muted">Restore into the editor, then save and publish when ready. The last ten versions are retained.</p>{draft.versions.map((version, i) => <div key={`${version.published_at}:${i}`} className="editorial-toolbar"><span>{new Date(version.published_at).toLocaleString()}</span><button className="button" disabled={busy} onClick={() => { if (dirty && !window.confirm("Replace unsaved changes with this version?")) return; setForm(version.data); setJson(null); setPreview(""); }}>Restore to editor</button></div>)}</section>}
  </div>;
}
