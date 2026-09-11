"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  CloseIcon,
  PlusIcon,
  SearchIcon,
} from "./icons";

export interface TransferItem {
  id: string;
  name: string;
  code?: string;
  retired?: boolean;
  disabled?: boolean;
}

interface TransferListProps {
  disabled?: boolean;
  items: TransferItem[];
  leftEmptySubtext?: string;
  leftEmptyText?: string;
  leftTitle?: string;
  loading?: boolean;
  onChange: (selectedIds: string[]) => void;
  rightEmptySubtext?: string;
  rightEmptyText?: string;
  rightTitle?: string;
  value: string[];
}

function IndeterminateCheckbox({
  checked,
  disabled,
  indeterminate,
  onChange,
  title,
}: {
  checked: boolean;
  disabled?: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  title?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = Boolean(indeterminate);
    }
  }, [indeterminate]);

  return (
    <input
      aria-label={title || "Select all items"}
      checked={checked}
      className="transfer-checkbox"
      disabled={disabled}
      onChange={onChange}
      ref={ref}
      title={title}
      type="checkbox"
    />
  );
}

export function TransferList({
  disabled = false,
  items,
  leftEmptySubtext = "All products have been added to this plan.",
  leftEmptyText = "No available products",
  leftTitle = "Available products",
  loading = false,
  onChange,
  rightEmptySubtext = "Select products on the left and move them over to grant access.",
  rightEmptyText = "No products selected",
  rightTitle = "Selected products",
  value,
}: TransferListProps) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [leftSearch, setLeftSearch] = useState("");
  const [rightSearch, setRightSearch] = useState("");

  const searchIdLeft = useId();
  const searchIdRight = useId();

  // Set of selected IDs
  const selectedSet = useMemo(() => new Set(value), [value]);

  // Separate available vs selected items
  const { availableItems, selectedItems } = useMemo(() => {
    const available: TransferItem[] = [];
    const selected: TransferItem[] = [];
    const itemMap = new Map<string, TransferItem>();

    for (const item of items) {
      itemMap.set(item.id, item);
      if (selectedSet.has(item.id)) {
        selected.push(item);
      } else {
        available.push(item);
      }
    }

    return { availableItems: available, selectedItems: selected };
  }, [items, selectedSet]);

  // Filtered by search queries
  const filteredAvailable = useMemo(() => {
    const q = leftSearch.trim().toLowerCase();
    if (!q) return availableItems;
    return availableItems.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.code && item.code.toLowerCase().includes(q)),
    );
  }, [availableItems, leftSearch]);

  const filteredSelected = useMemo(() => {
    const q = rightSearch.trim().toLowerCase();
    if (!q) return selectedItems;
    return selectedItems.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.code && item.code.toLowerCase().includes(q)),
    );
  }, [selectedItems, rightSearch]);

  // Checked items in each list
  const checkedLeft = useMemo(
    () => filteredAvailable.filter((i) => checked.has(i.id)),
    [filteredAvailable, checked],
  );

  const checkedRight = useMemo(
    () => filteredSelected.filter((i) => checked.has(i.id)),
    [filteredSelected, checked],
  );

  // Toggle single item check
  const toggleItemCheck = (id: string) => {
    if (disabled) return;
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Select all / deselect all for left column
  const toggleAllLeft = () => {
    if (disabled || filteredAvailable.length === 0) return;
    const allChecked = checkedLeft.length === filteredAvailable.length;
    setChecked((prev) => {
      const next = new Set(prev);
      for (const item of filteredAvailable) {
        if (allChecked) {
          next.delete(item.id);
        } else {
          next.add(item.id);
        }
      }
      return next;
    });
  };

  // Select all / deselect all for right column
  const toggleAllRight = () => {
    if (disabled || filteredSelected.length === 0) return;
    const allChecked = checkedRight.length === filteredSelected.length;
    setChecked((prev) => {
      const next = new Set(prev);
      for (const item of filteredSelected) {
        if (allChecked) {
          next.delete(item.id);
        } else {
          next.add(item.id);
        }
      }
      return next;
    });
  };

  // Move checked items to the right (Available -> Selected)
  const handleMoveRight = () => {
    if (disabled || checkedLeft.length === 0) return;
    const idsToAdd = checkedLeft.map((i) => i.id);
    const nextSelected = Array.from(new Set([...value, ...idsToAdd]));

    setChecked((prev) => {
      const next = new Set(prev);
      for (const id of idsToAdd) next.delete(id);
      return next;
    });

    onChange(nextSelected);
  };

  // Move checked items to the left (Selected -> Available)
  const handleMoveLeft = () => {
    if (disabled || checkedRight.length === 0) return;
    const idsToRemove = new Set(checkedRight.map((i) => i.id));
    const nextSelected = value.filter((id) => !idsToRemove.has(id));

    setChecked((prev) => {
      const next = new Set(prev);
      for (const id of idsToRemove) next.delete(id);
      return next;
    });

    onChange(nextSelected);
  };

  // Move ALL visible available items to Selected
  const handleMoveAllRight = () => {
    if (disabled || filteredAvailable.length === 0) return;
    const idsToAdd = filteredAvailable.map((i) => i.id);
    const nextSelected = Array.from(new Set([...value, ...idsToAdd]));

    setChecked((prev) => {
      const next = new Set(prev);
      for (const id of idsToAdd) next.delete(id);
      return next;
    });

    onChange(nextSelected);
  };

  // Move ALL visible selected items to Available
  const handleMoveAllLeft = () => {
    if (disabled || filteredSelected.length === 0) return;
    const idsToRemove = new Set(filteredSelected.map((i) => i.id));
    const nextSelected = value.filter((id) => !idsToRemove.has(id));

    setChecked((prev) => {
      const next = new Set(prev);
      for (const id of idsToRemove) next.delete(id);
      return next;
    });

    onChange(nextSelected);
  };

  // Quick single item transfer
  const quickTransferToSelected = (id: string) => {
    if (disabled) return;
    setChecked((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    onChange(Array.from(new Set([...value, id])));
  };

  const quickTransferToAvailable = (id: string) => {
    if (disabled) return;
    setChecked((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    onChange(value.filter((currentId) => currentId !== id));
  };

  return (
    <div className={`transfer-list-root${disabled ? " transfer-list--disabled" : ""}`}>
      {/* LEFT LIST: Available */}
      <div className="transfer-list-card" role="region" aria-label={leftTitle}>
        <div className="transfer-list-header">
          <label className="transfer-list-header-label">
            <IndeterminateCheckbox
              checked={
                filteredAvailable.length > 0 &&
                checkedLeft.length === filteredAvailable.length
              }
              disabled={disabled || filteredAvailable.length === 0}
              indeterminate={
                checkedLeft.length > 0 &&
                checkedLeft.length < filteredAvailable.length
              }
              onChange={toggleAllLeft}
              title="Select all available products"
            />
            <span className="transfer-list-title">{leftTitle}</span>
          </label>
          <span className="transfer-list-badge">
            {checkedLeft.length > 0
              ? `${checkedLeft.length}/${filteredAvailable.length} checked`
              : `${availableItems.length} available`}
          </span>
        </div>

        <div className="transfer-list-search">
          <SearchIcon className="transfer-list-search-icon" size={14} />
          <input
            aria-label="Filter available products"
            className="transfer-list-search-input"
            disabled={disabled}
            id={searchIdLeft}
            onChange={(e) => setLeftSearch(e.target.value)}
            placeholder="Filter available…"
            type="text"
            value={leftSearch}
          />
          {leftSearch ? (
            <button
              aria-label="Clear filter"
              className="transfer-list-search-clear"
              onClick={() => setLeftSearch("")}
              type="button"
            >
              <CloseIcon size={12} />
            </button>
          ) : null}
        </div>

        <div className="transfer-list-body" role="list">
          {loading ? (
            <div className="transfer-list-loading">
              <div className="transfer-skeleton" />
              <div className="transfer-skeleton" />
              <div className="transfer-skeleton" />
            </div>
          ) : filteredAvailable.length > 0 ? (
            filteredAvailable.map((item) => {
              const isChecked = checked.has(item.id);
              return (
                <div
                  className={`transfer-list-item${isChecked ? " transfer-list-item--checked" : ""}`}
                  key={item.id}
                  onClick={() => toggleItemCheck(item.id)}
                  onDoubleClick={() => quickTransferToSelected(item.id)}
                  role="listitem"
                  title="Click to check, double-click to add"
                >
                  <input
                    aria-label={`Select ${item.name}`}
                    checked={isChecked}
                    className="transfer-checkbox"
                    disabled={disabled}
                    onChange={() => toggleItemCheck(item.id)}
                    onClick={(e) => e.stopPropagation()}
                    type="checkbox"
                  />
                  <div className="transfer-item-content">
                    <span className="transfer-item-name">{item.name}</span>
                    {item.code ? (
                      <code className="transfer-item-code">{item.code}</code>
                    ) : null}
                    {item.retired ? (
                      <span className="transfer-item-retired">Retired</span>
                    ) : null}
                  </div>
                  <button
                    aria-label={`Add ${item.name} to plan`}
                    className="transfer-item-quick-btn transfer-item-quick-btn--add"
                    disabled={disabled}
                    onClick={(e) => {
                      e.stopPropagation();
                      quickTransferToSelected(item.id);
                    }}
                    title="Add to selected products"
                    type="button"
                  >
                    <PlusIcon size={13} />
                  </button>
                </div>
              );
            })
          ) : (
            <div className="transfer-list-empty">
              <span className="transfer-list-empty-title">{leftEmptyText}</span>
              <span className="transfer-list-empty-sub">{leftEmptySubtext}</span>
            </div>
          )}
        </div>
      </div>

      {/* CENTER ACTIONS */}
      <div className="transfer-list-controls" role="group" aria-label="Transfer controls">
        <button
          aria-label="Add all available products to plan"
          className="transfer-btn"
          disabled={disabled || filteredAvailable.length === 0}
          onClick={handleMoveAllRight}
          title="Move all to selected"
          type="button"
        >
          <ChevronsRightIcon size={16} />
        </button>
        <button
          aria-label="Add checked products to plan"
          className={`transfer-btn${checkedLeft.length > 0 ? " transfer-btn--primary" : ""}`}
          disabled={disabled || checkedLeft.length === 0}
          onClick={handleMoveRight}
          title="Move checked to selected"
          type="button"
        >
          <ChevronRightIcon size={16} />
        </button>
        <button
          aria-label="Remove checked products from plan"
          className={`transfer-btn${checkedRight.length > 0 ? " transfer-btn--primary" : ""}`}
          disabled={disabled || checkedRight.length === 0}
          onClick={handleMoveLeft}
          title="Remove checked from selected"
          type="button"
        >
          <ChevronLeftIcon size={16} />
        </button>
        <button
          aria-label="Remove all products from plan"
          className="transfer-btn"
          disabled={disabled || filteredSelected.length === 0}
          onClick={handleMoveAllLeft}
          title="Remove all from selected"
          type="button"
        >
          <ChevronsLeftIcon size={16} />
        </button>
      </div>

      {/* RIGHT LIST: Selected */}
      <div className="transfer-list-card" role="region" aria-label={rightTitle}>
        <div className="transfer-list-header">
          <label className="transfer-list-header-label">
            <IndeterminateCheckbox
              checked={
                filteredSelected.length > 0 &&
                checkedRight.length === filteredSelected.length
              }
              disabled={disabled || filteredSelected.length === 0}
              indeterminate={
                checkedRight.length > 0 &&
                checkedRight.length < filteredSelected.length
              }
              onChange={toggleAllRight}
              title="Select all plan products"
            />
            <span className="transfer-list-title">{rightTitle}</span>
          </label>
          <span className="transfer-list-badge transfer-list-badge--active">
            {checkedRight.length > 0
              ? `${checkedRight.length}/${filteredSelected.length} checked`
              : `${selectedItems.length} selected`}
          </span>
        </div>

        <div className="transfer-list-search">
          <SearchIcon className="transfer-list-search-icon" size={14} />
          <input
            aria-label="Filter selected products"
            className="transfer-list-search-input"
            disabled={disabled}
            id={searchIdRight}
            onChange={(e) => setRightSearch(e.target.value)}
            placeholder="Filter selected…"
            type="text"
            value={rightSearch}
          />
          {rightSearch ? (
            <button
              aria-label="Clear filter"
              className="transfer-list-search-clear"
              onClick={() => setRightSearch("")}
              type="button"
            >
              <CloseIcon size={12} />
            </button>
          ) : null}
        </div>

        <div className="transfer-list-body" role="list">
          {loading ? (
            <div className="transfer-list-loading">
              <div className="transfer-skeleton" />
            </div>
          ) : filteredSelected.length > 0 ? (
            filteredSelected.map((item) => {
              const isChecked = checked.has(item.id);
              return (
                <div
                  className={`transfer-list-item${isChecked ? " transfer-list-item--checked" : ""}`}
                  key={item.id}
                  onClick={() => toggleItemCheck(item.id)}
                  onDoubleClick={() => quickTransferToAvailable(item.id)}
                  role="listitem"
                  title="Click to check, double-click to remove"
                >
                  <input
                    aria-label={`Deselect ${item.name}`}
                    checked={isChecked}
                    className="transfer-checkbox"
                    disabled={disabled}
                    onChange={() => toggleItemCheck(item.id)}
                    onClick={(e) => e.stopPropagation()}
                    type="checkbox"
                  />
                  <div className="transfer-item-content">
                    <span className="transfer-item-name">{item.name}</span>
                    {item.code ? (
                      <code className="transfer-item-code">{item.code}</code>
                    ) : null}
                    {item.retired ? (
                      <span className="transfer-item-retired">Retired</span>
                    ) : null}
                  </div>
                  <button
                    aria-label={`Remove ${item.name} from plan`}
                    className="transfer-item-quick-btn transfer-item-quick-btn--remove"
                    disabled={disabled}
                    onClick={(e) => {
                      e.stopPropagation();
                      quickTransferToAvailable(item.id);
                    }}
                    title="Remove from selected products"
                    type="button"
                  >
                    <CloseIcon size={12} />
                  </button>
                </div>
              );
            })
          ) : (
            <div className="transfer-list-empty">
              <span className="transfer-list-empty-title">{rightEmptyText}</span>
              <span className="transfer-list-empty-sub">{rightEmptySubtext}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
