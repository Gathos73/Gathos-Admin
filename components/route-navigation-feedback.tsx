"use client";

import type { FocusEvent, MouseEvent, PointerEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type NavigationDetail = { href: string; label?: string; fromPath?: string };

export function RouteNavigationFeedback({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const prefetched = useRef(new Set<string>());
  const [pending, setPending] = useState<NavigationDetail | null>(null);

  const activePending = pending?.fromPath === pathname ? pending : null;

  const begin = (detail: NavigationDetail) => {
    const target = new URL(detail.href, window.location.href);
    if (target.origin !== window.location.origin) return;
    if (`${target.pathname}${target.search}` === `${window.location.pathname}${window.location.search}`) return;
    setPending({ href: `${target.pathname}${target.search}`, label: detail.label, fromPath: pathname });
  };

  const targetDetail = (target: EventTarget | null): NavigationDetail | null => {
    if (!(target instanceof Element)) return null;
    const element = target.closest<HTMLElement>("a[href], [data-navigation-href]");
    if (!element) return null;
    const href = element instanceof HTMLAnchorElement
      ? element.href
      : element.dataset.navigationHref;
    if (!href) return null;
    return {
      href,
      label: element.getAttribute("aria-label")
        || element.dataset.navigationLabel
        || element.textContent?.trim(),
    };
  };

  const prefetch = (target: EventTarget | null) => {
    const detail = targetDetail(target);
    if (!detail) return;
    const destination = new URL(detail.href, window.location.href);
    const href = `${destination.pathname}${destination.search}`;
    if (destination.origin === window.location.origin && !prefetched.current.has(href)) {
      prefetched.current.add(href);
      router.prefetch(href);
    }
  };

  useEffect(() => {
    if (!pending) return;
    const timeout = window.setTimeout(() => setPending(null), 30_000);
    return () => window.clearTimeout(timeout);
  }, [pending]);

  return (
    <div
      className={className}
      onClickCapture={(event: MouseEvent<HTMLDivElement>) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const detail = targetDetail(event.target);
        if (detail) begin(detail);
      }}
      onFocusCapture={(event: FocusEvent<HTMLDivElement>) => prefetch(event.target)}
      onPointerOverCapture={(event: PointerEvent<HTMLDivElement>) => prefetch(event.target)}
    >
      <div
        aria-live="polite"
        className={`route-navigation-feedback${activePending ? " is-visible" : ""}`}
        role="status"
      >
        <span aria-hidden="true" className="route-navigation-bar" />
        {activePending ? (
          <span className="route-navigation-message">
            <span aria-hidden="true" className="route-navigation-spinner" />
            Opening {activePending.label || "page"}…
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
