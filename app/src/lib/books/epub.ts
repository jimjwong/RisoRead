import { unzipSync, strFromU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";
import sanitizeHtml from "sanitize-html";

/**
 * Reading an EPUB.
 *
 * An EPUB is a zip holding XHTML, an OPF package document that lists the
 * reading order, and whatever assets the chapters reference. That is enough to
 * render server-side, chapter by chapter, which is why this app does not ship
 * a client-side reader library: the whole application works without client
 * JavaScript, and a reader that needs hydration to show text is a blank page
 * when it fails.
 *
 * Everything here treats the file as hostile. An EPUB is an arbitrary zip from
 * an arbitrary source: its XHTML can carry scripts and event handlers, and its
 * internal paths can try to escape the archive. Both are handled explicitly
 * below rather than assumed away.
 */

export type EpubMetadata = {
  title: string | null;
  authors: string[];
  language: string | null;
  publisher: string | null;
  publishedYear: number | null;
  isbn: string | null;
  description: string | null;
  subjects: string[];
};

export type SpineItem = {
  /** Path inside the archive, already resolved against the OPF's directory. */
  href: string;
  mediaType: string;
  /** Chapter title from the navigation document, when there is one. */
  label: string | null;
};

export type Epub = {
  metadata: EpubMetadata;
  spine: SpineItem[];
  coverHref: string | null;
};

export class EpubError extends Error {}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  // A single <item> and a list of them must not parse to different shapes, or
  // every consumer needs an Array.isArray check that will be forgotten once.
  isArray: (name) => ["item", "itemref", "navPoint", "reference"].includes(name),
});

/**
 * Resolve a path stated inside the archive, relative to a base directory.
 *
 * The traversal guard is the point. A crafted EPUB can reference
 * `../../../etc/passwd`, and while a zip entry lookup would simply miss, the
 * same resolved path is used to serve assets over HTTP. Anything that climbs
 * out of the archive root is refused rather than normalised into something
 * that happens to be harmless today.
 */
export function resolvePath(base: string, href: string): string | null {
  const clean = href.split("#")[0].split("?")[0].trim();
  if (!clean) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(clean)) return null; // absolute URL, not ours

  const baseParts = base ? base.split("/").filter(Boolean) : [];
  const parts = clean.startsWith("/")
    ? clean.split("/").filter(Boolean)
    : [...baseParts, ...clean.split("/")];

  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (out.length === 0) return null; // climbing out of the archive
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.length > 0 ? out.join("/") : null;
}

function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

/** First value from a possibly-repeated Dublin Core element. */
function dcText(value: unknown): string | null {
  if (value == null) return null;
  if (Array.isArray(value)) return dcText(value[0]);
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "object") {
    const v = (value as Record<string, unknown>)["#text"];
    return typeof v === "string" ? v.trim() || null : null;
  }
  return String(value).trim() || null;
}

function dcList(value: unknown): string[] {
  if (value == null) return [];
  const items = Array.isArray(value) ? value : [value];
  return items.map(dcText).filter((v): v is string => v !== null);
}

export function parseEpub(bytes: Uint8Array): Epub {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new EpubError("That file is not a readable EPUB archive.");
  }

  const read = (path: string): string | null => {
    const entry = files[path];
    return entry ? strFromU8(entry) : null;
  };

  // The container points at the package document. Its location is the one
  // thing an EPUB guarantees.
  const container = read("META-INF/container.xml");
  if (!container) throw new EpubError("This EPUB has no META-INF/container.xml.");

  const containerDoc = parser.parse(container);
  const rootfile = containerDoc?.container?.rootfiles?.rootfile;
  const opfPath = (Array.isArray(rootfile) ? rootfile[0] : rootfile)?.["@full-path"];
  if (typeof opfPath !== "string") throw new EpubError("This EPUB does not say where its package document is.");

  const opfRaw = read(opfPath);
  if (!opfRaw) throw new EpubError("This EPUB's package document is missing.");

  const opf = parser.parse(opfRaw)?.package;
  if (!opf) throw new EpubError("This EPUB's package document could not be read.");

  const base = dirOf(opfPath);
  const meta = opf.metadata ?? {};

  // Manifest: id -> { href, mediaType, properties }
  const manifest = new Map<string, { href: string; mediaType: string; properties: string }>();
  for (const item of opf.manifest?.item ?? []) {
    const id = item?.["@id"];
    const href = item?.["@href"];
    if (typeof id !== "string" || typeof href !== "string") continue;
    manifest.set(id, {
      href,
      mediaType: String(item["@media-type"] ?? ""),
      properties: String(item["@properties"] ?? ""),
    });
  }

  // Reading order.
  const spine: SpineItem[] = [];
  for (const ref of opf.spine?.itemref ?? []) {
    const idref = ref?.["@idref"];
    if (typeof idref !== "string") continue;
    const item = manifest.get(idref);
    if (!item) continue;
    // linear="no" marks front matter a reader may skip; keep it, since
    // skipping it silently loses a preface.
    const resolved = resolvePath(base, item.href);
    if (!resolved) continue;
    spine.push({ href: resolved, mediaType: item.mediaType, label: null });
  }

  if (spine.length === 0) throw new EpubError("This EPUB lists no readable chapters.");

  // Cover, by either of the two conventions in use.
  let coverHref: string | null = null;
  for (const [, item] of manifest) {
    if (item.properties.includes("cover-image")) {
      coverHref = resolvePath(base, item.href);
      break;
    }
  }
  if (!coverHref) {
    const metaEntries = Array.isArray(meta.meta) ? meta.meta : meta.meta ? [meta.meta] : [];
    const coverMeta = metaEntries.find(
      (m: Record<string, unknown>) => m?.["@name"] === "cover",
    );
    const id = coverMeta?.["@content"];
    if (typeof id === "string" && manifest.has(id)) {
      coverHref = resolvePath(base, manifest.get(id)!.href);
    }
  }

  const dateText = dcText(meta["dc:date"]) ?? dcText(meta.date);
  const yearMatch = dateText?.match(/\b(1\d{3}|20\d{2}|21\d{2})\b/);

  const identifiers = dcList(meta["dc:identifier"]).concat(dcList(meta.identifier));
  const isbn = identifiers
    .map((v) => v.replace(/[^0-9Xx]/g, ""))
    .find((v) => v.length === 10 || v.length === 13);

  return {
    metadata: {
      title: dcText(meta["dc:title"]) ?? dcText(meta.title),
      authors: dcList(meta["dc:creator"]).concat(dcList(meta.creator)),
      language: dcText(meta["dc:language"]) ?? dcText(meta.language),
      publisher: dcText(meta["dc:publisher"]) ?? dcText(meta.publisher),
      publishedYear: yearMatch ? Number(yearMatch[1]) : null,
      isbn: isbn ?? null,
      description: dcText(meta["dc:description"]) ?? dcText(meta.description),
      subjects: dcList(meta["dc:subject"]).concat(dcList(meta.subject)).slice(0, 12),
    },
    spine,
    coverHref,
  };
}

/** One entry from the archive, for serving images the chapters reference. */
export function readEntry(bytes: Uint8Array, path: string): Uint8Array | null {
  try {
    const files = unzipSync(bytes);
    return files[path] ?? null;
  } catch {
    return null;
  }
}

/**
 * A chapter, rendered safe to put on the page.
 *
 * The content is XHTML from an arbitrary file someone uploaded, so it is
 * filtered to a fixed set of tags rather than cleaned of known-bad ones: an
 * allowlist fails closed when EPUB or HTML grows something new, a denylist
 * fails open. Scripts, styles, iframes, objects and every event handler are
 * simply not on the list.
 *
 * Images are kept, because a methods textbook without its figures is not the
 * book. Their sources are rewritten to a route that serves the asset from
 * inside the archive, so the reader never needs the file itself.
 */
export function renderChapter(
  bytes: Uint8Array,
  href: string,
  opts: { assetBase: string },
): string {
  const files = unzipSync(bytes);
  const entry = files[href];
  if (!entry) return "";

  const raw = strFromU8(entry);
  const chapterDir = dirOf(href);

  return sanitizeHtml(raw, {
    allowedTags: [
      "h1", "h2", "h3", "h4", "h5", "h6",
      "p", "div", "span", "section", "article", "header", "footer",
      "blockquote", "cite", "q",
      "ul", "ol", "li", "dl", "dt", "dd",
      "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
      "a", "em", "strong", "i", "b", "u", "s", "small", "sub", "sup", "mark",
      "img", "figure", "figcaption",
      "pre", "code", "kbd", "samp", "var",
      "hr", "br", "abbr", "time", "ruby", "rt", "rp",
    ],
    allowedAttributes: {
      // target and rel are allowed because the transform below adds them; the
      // allowlist is applied after transformTags, so anything it sets and this
      // does not permit is stripped straight back off.
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "title", "width", "height"],
      "*": ["id", "lang", "dir", "colspan", "rowspan", "headers", "scope"],
    },
    // No javascript: or data: hrefs; only ordinary web links leave the page.
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https"] },
    transformTags: {
      img: (tagName, attribs) => {
        const src = attribs.src ?? "";
        // An external image is left alone; an internal one is rewritten to the
        // asset route, since the archive is not reachable from the browser.
        if (/^https?:/i.test(src)) return { tagName, attribs };

        const resolved = resolvePath(chapterDir, src);
        if (!resolved) return { tagName: "span", attribs: {} as Record<string, string> };

        return {
          tagName: "img",
          attribs: {
            src: `${opts.assetBase}?path=${encodeURIComponent(resolved)}`,
            alt: attribs.alt ?? "",
            loading: "lazy",
          },
        };
      },
      a: (tagName, attribs) => {
        const href = attribs.href ?? "";
        // Internal cross-references point at files the browser cannot fetch.
        // Dropped to plain text rather than left as a link that does nothing.
        if (!/^(https?:|mailto:)/i.test(href)) {
          return { tagName: "span", attribs: {} as Record<string, string> };
        }
        return {
          tagName: "a",
          attribs: { href, target: "_blank", rel: "noreferrer noopener" } as Record<string, string>,
        };
      },
    },
  });
}

/**
 * Resolve and render one entry from the spine, clamping like the reader page
 * always has — kept here so the reading page and the offline chapter route can
 * never resolve the same index to two different chapters.
 */
export function renderSpineItem(
  epub: Epub,
  bytes: Uint8Array,
  index: number,
  assetBase: string,
): string {
  const item = epub.spine[Math.max(0, Math.min(index, epub.spine.length - 1))];
  return renderChapter(bytes, item.href, { assetBase });
}

/** Roughly how long a chapter is, for the reader to show before opening it. */
export function chapterWords(html: string): number {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.split(" ").length : 0;
}
