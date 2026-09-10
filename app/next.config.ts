import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Native modules the bundler must leave alone.
   *
   * @napi-rs/canvas ships a platform-specific .node binary, which Turbopack
   * cannot place in an ESM chunk — the build fails outright with "non-
   * ecmascript placeable asset". It is only ever loaded on the server, to
   * rasterise the first page of a PDF for its cover, so requiring it at
   * runtime rather than bundling it is both necessary and correct.
   */
  serverExternalPackages: ["@napi-rs/canvas"],

  experimental: {
    serverActions: {
      /**
       * Server Actions accept 1 MB of body by default, which is fine for a
       * form and useless for a paper: the median PDF here is a few megabytes
       * and a batch upload is tens. Without this, uploading anything real
       * failed with a 413 that never reached the action, so no amount of
       * testing the identification logic would have caught it.
       *
       * 120 MB covers a batch of ordinary papers comfortably. The action
       * enforces its own per-file and per-batch limits on top, and rejects
       * anything that is not a PDF before reading it, so this ceiling is the
       * outer bound rather than the policy.
       */
      bodySizeLimit: "120mb",
    },
  },
};

export default nextConfig;
