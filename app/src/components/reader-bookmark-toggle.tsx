"use client";

import { useEffect, useOptimistic, useState } from "react";
import { Bookmark } from "lucide-react";
import { toggleBookmark } from "@/app/books/actions";

type BookmarkPosition = { id: string; location: number };

/** A one-tap bookmark that follows chapters swapped into the offline reader. */
export function ReaderBookmarkToggle({
  bookId,
  initialLocation,
  bookmarks,
  focus,
}: {
  bookId: string;
  initialLocation: number;
  bookmarks: BookmarkPosition[];
  focus: boolean;
}) {
  const [location, setLocation] = useState(initialLocation);
  const bookmarked = bookmarks.some((bookmark) => bookmark.location === location);
  const [optimisticBookmarked, setOptimisticBookmarked] = useOptimistic(bookmarked);

  useEffect(() => {
    const onChapterChange = (event: Event) => {
      const next = (event as CustomEvent<{ at?: number }>).detail?.at;
      if (Number.isInteger(next)) setLocation(next as number);
    };
    window.addEventListener("risoread:chapterchange", onChapterChange);
    return () => window.removeEventListener("risoread:chapterchange", onChapterChange);
  }, []);

  async function action(formData: FormData) {
    setOptimisticBookmarked(!bookmarked);
    await toggleBookmark(formData);
  }

  return (
    <form action={action}>
      <input type="hidden" name="book_id" value={bookId} />
      <input type="hidden" name="location" value={location} />
      <input type="hidden" name="focus" value={focus ? "1" : ""} />
      <button
        type="submit"
        aria-label={optimisticBookmarked ? "Remove bookmark" : "Bookmark this chapter"}
        aria-pressed={optimisticBookmarked}
        title={optimisticBookmarked ? "Remove bookmark" : "Bookmark this chapter"}
        className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md text-[var(--fg-muted)] hover:bg-[var(--surface-2)]"
        style={optimisticBookmarked ? { color: "var(--accent)" } : undefined}
      >
        <Bookmark
          size={16}
          aria-hidden
          fill={optimisticBookmarked ? "currentColor" : "none"}
        />
      </button>
    </form>
  );
}
