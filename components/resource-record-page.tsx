"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  ApiError,
  deleteResource,
  getResourceRecord,
  updateResource,
} from "../lib/api";
import { getResourceConfig } from "../lib/resources";
import type { JsonObject, ResourceKey, ResourceRecord } from "../lib/types";
import { ConfirmDialog } from "./confirm-dialog";
import {
  AlertIcon,
  ChevronRightIcon,
  DeleteIcon,
  EditIcon,
  RefreshIcon,
} from "./icons";
import { RecordDetail, recordLabel } from "./record-detail";
import { RecordForm } from "./record-form";
import { ToastViewport, useToast } from "./toast";

type RecordPageMode = "view" | "edit";

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

interface RecordLoadState {
  error: string | null;
  record: ResourceRecord | null;
  requestKey: string;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.status > 0 ? `${error.message} (HTTP ${error.status})` : error.message;
  }
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

function formatDate(value: unknown): string {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return DATE_FORMATTER.format(date);
}

export function ResourceRecordPage({
  mode,
  recordId,
  resourceKey,
  resourceSlug,
}: {
  mode: RecordPageMode;
  recordId: string;
  resourceKey: ResourceKey;
  resourceSlug: string;
}) {
  const config = getResourceConfig(resourceKey);
  const router = useRouter();
  const { dismissToast, pushToast, toasts } = useToast();
  const [refreshVersion, setRefreshVersion] = useState(0);
  const requestKey = `${resourceKey}:${recordId}:${refreshVersion}`;
  const [loadState, setLoadState] = useState<RecordLoadState>({
    error: null,
    record: null,
    requestKey: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loading = loadState.requestKey !== requestKey;
  const record = loading ? null : loadState.record;
  const loadError = loading ? null : loadState.error;
  const encodedId = encodeURIComponent(recordId);
  const listPath = `/${resourceSlug}`;
  const viewPath = `${listPath}/${encodedId}`;
  const editPath = `${viewPath}/edit`;
  const label = record ? recordLabel(record, config.primaryKey) : recordId;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    getResourceRecord(resourceKey, recordId, controller.signal)
      .then((response) => {
        if (!active) return;
        setLoadState({ error: null, record: response.row, requestKey });
      })
      .catch((error: unknown) => {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) return;
        setLoadState({ error: errorMessage(error), record: null, requestKey });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [recordId, requestKey, resourceKey]);

  async function submitRecord(payload: JsonObject) {
    setSubmitting(true);
    setActionError(null);
    setSuccessMessage(null);
    try {
      await updateResource(config, recordId, payload);
      const message = `${config.labelSingular[0].toUpperCase()}${config.labelSingular.slice(1)} updated successfully.`;
      setSuccessMessage(message);
      pushToast(message, "success");
      setRefreshVersion((version) => version + 1);
    } catch (error) {
      const message = errorMessage(error);
      setActionError(message);
      pushToast(message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    setActionError(null);
    try {
      await deleteResource(config, recordId);
      setDeleteOpen(false);
      router.push(listPath);
      router.refresh();
    } catch (error) {
      const message = errorMessage(error);
      setActionError(message);
      pushToast(message, "error");
      setDeleteOpen(false);
      setDeleting(false);
    }
  }

  return (
    <div className="record-page">
      <nav aria-label="Record breadcrumb" className="record-page-breadcrumbs">
        <Link href={listPath}>{config.label}</Link>
        <ChevronRightIcon aria-hidden="true" size={13} />
        <span aria-current="page">{mode === "edit" ? `Edit ${label}` : label}</span>
      </nav>

      <header className="record-page-header">
        <div>
          <p className="resource-eyebrow">{mode === "edit" ? "Change record" : "Record detail"}</p>
          <h1>{mode === "edit" ? `Edit ${config.labelSingular}` : label}</h1>
          <p>
            {mode === "edit"
              ? `Update the configured ${config.labelSingular} fields. Database-managed fields remain read-only.`
              : `Review this ${config.labelSingular} and its database-managed metadata.`}
          </p>
        </div>
        <div className="record-page-actions">
          <Link className="button button--secondary" href={listPath}>
            Back to {config.label.toLowerCase()}
          </Link>
          {mode === "view" && config.canEdit ? (
            <Link className="button button--primary" href={editPath}>
              <EditIcon size={15} />
              Edit
            </Link>
          ) : null}
          {mode === "edit" ? (
            <Link className="button button--secondary" href={viewPath}>
              View record
            </Link>
          ) : null}
          {config.canDelete && record ? (
            <button className="button button--danger" onClick={() => setDeleteOpen(true)} type="button">
              <DeleteIcon size={15} />
              Delete
            </button>
          ) : null}
        </div>
      </header>

      {record ? (
        <section aria-label="Record metadata" className="record-summary">
          <div>
            <span>Record ID</span>
            <code>{recordId}</code>
          </div>
          <div>
            <span>Created</span>
            <strong>{formatDate(record.created_at)}</strong>
          </div>
          <div>
            <span>Last updated</span>
            <strong>{formatDate(record.updated_at)}</strong>
          </div>
        </section>
      ) : null}

      <section className="record-page-panel">
        <header className="record-page-panel-header">
          <div>
            <h2>{mode === "edit" ? `${config.labelSingular} information` : "Database fields"}</h2>
            <p>
              {mode === "edit"
                ? "Fields shown here are controlled by this resource’s configurable fields list."
                : "Read-only values returned by the administration API."}
            </p>
          </div>
          {loading ? <span className="record-loading-label">Loading…</span> : null}
        </header>

        {actionError ? (
          <div className="record-message record-message--error" role="alert">
            <AlertIcon size={17} />
            <div>
              <strong>The request was not saved</strong>
              <span>{actionError}</span>
            </div>
          </div>
        ) : null}
        {successMessage ? (
          <div className="record-message record-message--success" role="status">
            <div>
              <strong>Saved</strong>
              <span>{successMessage}</span>
            </div>
          </div>
        ) : null}

        {loadError ? (
          <div className="record-load-error" role="alert">
            <span className="state-icon state-icon--error">
              <AlertIcon size={20} />
            </span>
            <h2>Could not load this record</h2>
            <p>{loadError}</p>
            <button
              className="button button--secondary"
              onClick={() => setRefreshVersion((version) => version + 1)}
              type="button"
            >
              <RefreshIcon size={15} />
              Retry
            </button>
          </div>
        ) : loading ? (
          <div aria-busy="true" aria-label="Loading record" className="record-page-skeleton">
            {Array.from({ length: 8 }, (_, index) => (
              <span className="skeleton-block" key={index} />
            ))}
          </div>
        ) : record ? (
          <div className="record-page-panel-body">
            {mode === "edit" ? (
              <RecordForm
                config={config}
                initialRecord={record}
                key={`edit-${recordId}-${refreshVersion}`}
                mode="edit"
                onCancel={() => router.push(viewPath)}
                onSubmit={submitRecord}
                submitting={submitting}
              />
            ) : (
              <RecordDetail config={config} record={record} />
            )}
          </div>
        ) : null}
      </section>

      <ConfirmDialog
        busy={deleting}
        confirmLabel="Delete record"
        description={`Delete ${config.labelSingular} “${label}”? This cannot be undone.`}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={confirmDelete}
        open={deleteOpen}
        title="Delete this record?"
      />
      <ToastViewport onDismiss={dismissToast} toasts={toasts} />
    </div>
  );
}
