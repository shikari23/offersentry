const EVENT_PATH = "/api/events/checklist-click/ssn-guide";
const SOURCE_PATH = "/guides/should-you-give-recruiter-ssn";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname !== EVENT_PATH) {
      return new Response("Not found", {
        status: 404,
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff"
        }
      });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", {
        status: 405,
        headers: {
          "Allow": "POST",
          "Cache-Control": "no-store"
        }
      });
    }

    const origin = request.headers.get("Origin");
const referer = request.headers.get("Referer");
const fetchSite = request.headers.get("Sec-Fetch-Site");

let validSource =
  fetchSite === "same-origin" ||
  origin === url.origin;
    
    if (!validSource && referer) {
      try {
        const refererUrl = new URL(referer);

        validSource =
          refererUrl.origin === url.origin &&
          refererUrl.pathname.startsWith(SOURCE_PATH);
      } catch {
        validSource = false;
      }
    }

    if (!validSource) {
      return new Response("Forbidden", {
        status: 403,
        headers: {
          "Cache-Control": "no-store"
        }
      });
    }

    try {
      await env.DB
        .prepare(`
          INSERT INTO conversion_counts (
            event,
            source,
            destination,
            clicks,
            updated_at
          )
          VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
          ON CONFLICT(event, source, destination)
          DO UPDATE SET
            clicks = clicks + 1,
            updated_at = CURRENT_TIMESTAMP
        `)
        .bind(
          "checklist_click",
          "ssn_guide",
          "job_scam_checklist"
        )
        .run();

      return new Response(null, {
        status: 204,
        headers: {
          "Cache-Control": "no-store"
        }
      });
    } catch (error) {
      console.error(JSON.stringify({
        event: "conversion_tracking_error",
        message: error instanceof Error ? error.message : "Unknown error"
      }));

      return new Response("Tracking unavailable", {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": "60"
        }
      });
    }
  }
};
