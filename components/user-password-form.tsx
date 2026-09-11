"use client";

import { useId, useRef, useState, type FormEvent } from "react";

import { setUserPassword } from "../lib/api";
import { CloseIcon } from "./icons";
import { useDialogFocus } from "./use-dialog-focus";

interface UserPasswordDialogProps {
  email: string;
  onCancel: () => void;
  onSuccess: () => void;
  open: boolean;
  userId: string;
}

export function UserPasswordDialog({
  email,
  onCancel,
  onSuccess,
  open,
  userId,
}: UserPasswordDialogProps) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const passwordRef = useRef<HTMLInputElement>(null);
  const dialogRef = useDialogFocus<HTMLElement>({
    initialFocusRef: passwordRef,
    onEscape: busy ? undefined : close,
    open,
  });

  function close() {
    if (busy) return;
    setPassword("");
    setConfirmation("");
    setError(null);
    onCancel();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await setUserPassword(userId, password);
      setPassword("");
      setConfirmation("");
      onSuccess();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not set the password.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="confirm-dialog password-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="dialog-header">
          <h2 id={titleId}>Reset password</h2>
          <button
            aria-label="Close dialog"
            className="icon-button"
            disabled={busy}
            onClick={close}
            type="button"
          >
            <CloseIcon size={18} />
          </button>
        </div>
        <p className="dialog-description" id={descriptionId}>
          Create a new password for {email}. This immediately replaces the existing password without requiring an OTP.
        </p>
        <form className="record-form" onSubmit={submit} aria-busy={busy}>
          {error ? (
            <p className="form-error form-error--summary" role="alert">
              {error}
            </p>
          ) : null}
          <fieldset disabled={busy}>
            <div className="form-grid">
              <label className="form-field">
                <span className="form-label">New password</span>
                <input
                  ref={passwordRef}
                  type="password"
                  name="new-password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  maxLength={1024}
                  aria-describedby="user-password-help"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setError(null);
                  }}
                />
                <span className="form-help" id="user-password-help">Use at least 8 characters.</span>
              </label>
              <label className="form-field">
                <span className="form-label">Confirm new password</span>
                <input
                  type="password"
                  name="confirm-password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  maxLength={1024}
                  value={confirmation}
                  onChange={(event) => {
                    setConfirmation(event.target.value);
                    setError(null);
                  }}
                />
              </label>
            </div>
            <div className="dialog-actions">
              <button className="button button--secondary" type="button" disabled={busy} onClick={close}>
                Cancel
              </button>
              <button className="button button--primary" type="submit" disabled={busy}>
                {busy ? "Resetting password…" : "Reset password"}
              </button>
            </div>
          </fieldset>
        </form>
      </section>
    </div>
  );
}
