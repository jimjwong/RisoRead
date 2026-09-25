/**
 * Deployment readiness check.
 *
 * This deliberately avoids the database and object storage: Railway should
 * only replace the previous container once the new Next.js process can serve
 * requests. External-service failures belong in monitoring, not deployment
 * activation, or a transient outage could prevent an otherwise valid rollback.
 */
export function GET() {
  return Response.json(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
