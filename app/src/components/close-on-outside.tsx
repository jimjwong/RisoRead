"use client";

import { useEffect } from "react";

/**
 * Closes a disclosure when you go and do something else.
 *
 * "New folder" and "Add book" are actions, not panels. A native <details> stays
 * open until the summary is pressed a second time, so an abandoned one sits
 * above the shelf for the rest of the visit — which is the furniture those
 * controls were collapsed to avoid in the first place.
 *
 * Delegated and attribute-driven, so the markup stays server-rendered and
 * nothing here is load-bearing: with no client JavaScript the disclosures work
 * exactly as they always did, and the only thing lost is the tidying up.
 */
export function CloseOnOutsideClick() {
  useEffect(() => {
    const closable = () =>
      Array.from(document.querySelectorAll<HTMLDetailsElement>("details[data-autoclose][open]"));

    const close = (except: Element | null) => {
      for (const el of closable()) {
        if (except && el.contains(except)) continue;
        // Work in progress is not an abandoned panel. Closing an upload
        // mid-flight hides the only evidence it is still going, and the next
        // thing someone does is start it again.
        if (el.querySelector('[data-busy="true"]')) continue;
        el.removeAttribute("open");
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      close(event.target instanceof Element ? event.target : null);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(null);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return null;
}
