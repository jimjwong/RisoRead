/**
 * How large a book may be.
 *
 * Kept in one place because it has to agree with `serverActions.bodySizeLimit`
 * in next.config.ts. When it did not, the action permitted 200 MB a file and
 * 400 MB a batch while the transport rejected anything over 120 MB — with a
 * 413 raised before any of this code ran, so an oversized upload did nothing
 * at all and said nothing about why.
 *
 * The per-file ceiling now sits comfortably under the transport limit, and the
 * browser upload path sends one file per request, so the batch total is no
 * longer a constraint at all when JavaScript is running.
 */
export const MAX_BOOK_BYTES = 100 * 1024 * 1024;
export const MAX_BOOK_FILES = 20;

/** Only relevant to the no-JavaScript path, where a batch is one request. */
export const MAX_BATCH_BYTES = 110 * 1024 * 1024;
