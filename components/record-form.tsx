"use client";

import { FormEvent, useMemo, useState } from "react";

import type {
  JsonObject,
  JsonValue,
  ResourceConfig,
  ResourceField,
  ResourceRecord,
} from "../lib/types";

type FormMode = "create" | "edit";
type FormValue = string | boolean;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function dateTimeLocalValue(value: JsonValue | undefined): string {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function initialFieldValue(field: ResourceField, record?: ResourceRecord): FormValue {
  const value = record?.[field.name] ?? field.defaultValue;
  if (field.kind === "boolean") return Boolean(value);
  if (field.kind === "json") {
    if (value === undefined || value === null) return "";
    return JSON.stringify(value, null, 2);
  }
  if (field.kind === "datetime") return dateTimeLocalValue(value);
  if (value !== undefined && value !== null) return String(value);
  if (field.kind === "select" && field.required) return field.options?.[0]?.value ?? "";
  return "";
}

function fieldPayloadValue(
  field: ResourceField,
  value: FormValue,
): { value?: JsonValue; error?: string } {
  if (field.kind === "boolean") return { value: Boolean(value) };
  const raw = String(value).trim();

  if (!raw) {
    if (field.required) return { error: `${field.label} is required.` };
    return field.nullable ? { value: null } : {};
  }

  if (field.kind === "number") {
    const number = Number(raw);
    if (!Number.isFinite(number)) return { error: `${field.label} must be a number.` };
    if (field.min !== undefined && number < field.min) {
      return { error: `${field.label} must be at least ${field.min}.` };
    }
    return { value: number };
  }
  if (field.kind === "json") {
    try {
      const parsed = JSON.parse(raw) as JsonValue;
      if (field.jsonObject && (!parsed || typeof parsed !== "object" || Array.isArray(parsed))) {
        return { error: `${field.label} must be a JSON object.` };
      }
      return { value: parsed };
    } catch {
      return { error: `${field.label} must contain valid JSON.` };
    }
  }
  if (field.kind === "datetime") {
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return { error: `${field.label} is not a valid date.` };
    return { value: date.toISOString() };
  }
  if (field.kind === "email" && !EMAIL_PATTERN.test(raw)) {
    return { error: `${field.label} must be a valid email address.` };
  }
  return { value: raw };
}

interface RecordFormProps {
  config: ResourceConfig;
  mode: FormMode;
  initialRecord?: ResourceRecord;
  submitting: boolean;
  onSubmit: (payload: JsonObject) => Promise<void>;
  onCancel: () => void;
}

export function RecordForm({
  config,
  mode,
  initialRecord,
  submitting,
  onSubmit,
  onCancel,
}: RecordFormProps) {
  const visibleFields = useMemo(
    () =>
      config.fields.filter((field) =>
        mode === "create" ? !field.editOnly : !field.createOnly,
      ),
    [config.fields, mode],
  );
  const [values, setValues] = useState<Record<string, FormValue>>(() =>
    Object.fromEntries(
      visibleFields.map((field) => [field.name, initialFieldValue(field, initialRecord)]),
    ),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload: JsonObject = {};
    const nextErrors: Record<string, string> = {};

    for (const field of visibleFields) {
      if (mode === "edit" && field.immutableOnEdit) continue;
      const parsed = fieldPayloadValue(field, values[field.name] ?? "");
      if (parsed.error) nextErrors[field.name] = parsed.error;
      else if (parsed.value !== undefined) {
        if (mode === "edit") {
          const initial = fieldPayloadValue(
            field,
            initialFieldValue(field, initialRecord),
          ).value;
          if (JSON.stringify(initial) === JSON.stringify(parsed.value)) continue;
        }
        payload[field.name] = parsed.value;
      }
    }

    if (config.key === "users") {
      const plan = String(payload.plan ?? initialRecord?.plan ?? "free");
      const isComped = Boolean(payload.is_comped ?? initialRecord?.is_comped ?? false);
      const assigningPaidPlan =
        (plan === "pro" || plan === "pro_plus") &&
        (mode === "create" || payload.plan !== undefined) &&
        plan !== initialRecord?.plan;
      if (assigningPaidPlan && !isComped) {
        nextErrors.is_comped = "Admin-assigned paid plans must be marked as comped.";
      }
    }

    if (mode === "edit" && Object.keys(payload).length === 0 && Object.keys(nextErrors).length === 0) {
      nextErrors.__form = "Make at least one change before saving.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    await onSubmit(payload);
  };

  return (
    <form className="record-form" noValidate onSubmit={handleSubmit}>
      {errors.__form ? (
        <div className="form-error form-error--summary" role="alert">
          {errors.__form}
        </div>
      ) : null}
      <fieldset disabled={submitting}>
        <div className="form-grid">
          {visibleFields.map((field) => {
            const error = errors[field.name];
            const errorId = `${field.name}-error`;
            const helpId = `${field.name}-help`;
            const disabled = mode === "edit" && field.immutableOnEdit;
            const describedBy = error ? errorId : field.help ? helpId : undefined;

            return (
              <label
                className={`form-field form-field--${field.kind}${error ? " form-field--error" : ""}`}
                key={field.name}
              >
                {field.kind === "boolean" ? (
                  <span className="checkbox-field">
                    <input
                      checked={Boolean(values[field.name])}
                      disabled={disabled}
                      name={field.name}
                      onChange={(event) =>
                        setValues((current) => ({ ...current, [field.name]: event.target.checked }))
                      }
                      type="checkbox"
                    />
                    <span>{field.label}</span>
                  </span>
                ) : (
                  <span className="form-label">
                    {field.label}
                    {field.required ? <span aria-hidden="true"> *</span> : null}
                  </span>
                )}

                {field.kind === "select" ? (
                  <select
                    aria-describedby={describedBy}
                    aria-invalid={Boolean(error)}
                    disabled={disabled}
                    name={field.name}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, [field.name]: event.target.value }))
                    }
                    required={field.required}
                    value={String(values[field.name] ?? "")}
                  >
                    {field.nullable || !field.required ? <option value="">None</option> : null}
                    {field.options?.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : null}

                {field.kind === "textarea" || field.kind === "json" ? (
                  <textarea
                    aria-describedby={describedBy}
                    aria-invalid={Boolean(error)}
                    className={field.kind === "json" ? "json-input" : undefined}
                    disabled={disabled}
                    name={field.name}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, [field.name]: event.target.value }))
                    }
                    placeholder={field.placeholder}
                    required={field.required}
                    rows={field.kind === "json" ? 9 : 4}
                    value={String(values[field.name] ?? "")}
                  />
                ) : null}

                {["text", "email", "number", "datetime"].includes(field.kind) ? (
                  <input
                    aria-describedby={describedBy}
                    aria-invalid={Boolean(error)}
                    disabled={disabled}
                    min={field.min}
                    name={field.name}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, [field.name]: event.target.value }))
                    }
                    placeholder={field.placeholder}
                    required={field.required}
                    step={field.step}
                    type={field.kind === "datetime" ? "datetime-local" : field.kind}
                    value={String(values[field.name] ?? "")}
                  />
                ) : null}

                {field.help ? (
                  <span className="form-help" id={helpId}>
                    {field.help}
                  </span>
                ) : null}
                {error ? (
                  <span className="form-error" id={errorId} role="alert">
                    {error}
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="drawer-actions">
        <button className="button button--secondary" disabled={submitting} onClick={onCancel} type="button">
          Cancel
        </button>
        <button className="button button--primary" disabled={submitting} type="submit">
          {submitting ? "Saving…" : mode === "create" ? `Create ${config.labelSingular}` : "Save changes"}
        </button>
      </div>
    </form>
  );
}
