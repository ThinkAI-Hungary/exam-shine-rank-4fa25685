import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const API_BASE = "https://api.eu-w3.learnworlds.com/v2";
const LW_SCHOOL_DOMAIN = 'diego.learnworlds.com';

// ── OAuth2 Token Management ──
let cachedAccessToken: string | null = null;
let tokenExpiresAt: number = 0;

async function getAccessToken(clientId: string): Promise<string> {
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedAccessToken;
  }

  const clientSecret = Deno.env.get('LEARNWORLDS_CLIENT_SECRET')?.trim() || '';
  if (!clientSecret) {
    const staticToken = Deno.env.get('LEARNWORLDS_ACCESS_TOKEN')?.trim() || Deno.env.get('LW_ACCESS_TOKEN')?.trim() || '';
    if (!staticToken) {
      throw new Error('Missing LearnWorlds credentials: neither CLIENT_SECRET nor ACCESS_TOKEN set');
    }
    cachedAccessToken = staticToken;
    tokenExpiresAt = Date.now() + 3600_000;
    return staticToken;
  }

  console.log('Requesting new OAuth2 access token...');
  const resp = await fetch(`https://${LW_SCHOOL_DOMAIN}/admin/api/oauth2/access_token`, {
    method: 'POST',
    headers: { 'Lw-Client': clientId, 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
  });

  if (!resp.ok) {
    const errorText = await resp.text();
    throw new Error(`OAuth2 token request failed: ${resp.status} - ${errorText.substring(0, 200)}`);
  }

  const data = await resp.json();
  cachedAccessToken = data.access_token || data.tokenData?.access_token;
  const expiresIn = data.expires_in || data.tokenData?.expires_in || 3600;
  tokenExpiresAt = Date.now() + (expiresIn * 1000);

  if (!cachedAccessToken) throw new Error('OAuth2 response did not contain access_token');
  console.log(`OAuth2 token obtained, expires in ${expiresIn}s`);
  return cachedAccessToken;
}

// ── LW API helper (POST/PUT/GET with retry) ──
async function lwRequest(
  url: string,
  accessToken: string,
  clientId: string,
  method: string = "GET",
  body?: Record<string, unknown>,
  options?: { allowRetryOnTimeout?: boolean; timeoutMs?: number }
): Promise<any> {
  const maxRetries = 3;
  const baseDelay = 500;
  const timeoutMs = options?.timeoutMs ?? 60000;
  // GET is always idempotent; PUT/DELETE are idempotent in LW. POST is not, unless explicitly allowed.
  const retryOnTimeout =
    options?.allowRetryOnTimeout ?? (method === "GET" || method === "PUT" || method === "DELETE");

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const headers: Record<string, string> = {
      "Lw-Client": clientId.trim(),
      Authorization: `Bearer ${accessToken.trim()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const opts: RequestInit = { method, headers, redirect: "manual", signal: controller.signal };
    if (body && (method === "POST" || method === "PUT")) {
      opts.body = JSON.stringify(body);
    }

    let resp: Response;
    try {
      resp = await fetch(url, opts);
    } catch (e) {
      clearTimeout(timeoutId);
      if (!retryOnTimeout) {
        throw new Error(`LearnWorlds API timeout or network error: ${e}`);
      }
      if (attempt === maxRetries) throw new Error(`Network error: ${e}`);
      await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, attempt)));
      continue;
    } finally {
      clearTimeout(timeoutId);
    }

    if (resp.status === 429 && attempt < maxRetries) {
      const ra = Number(resp.headers.get("Retry-After"));
      const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : baseDelay * Math.pow(2, attempt);
      console.warn(`429 rate limited, waiting ${wait}ms`);
      await new Promise((r) => setTimeout(r, Math.min(wait, 5000)));
      continue;
    }

    if (resp.status >= 300 && resp.status < 400) {
      throw new Error(`LW API redirected (${resp.status})`);
    }

    if (!resp.ok) {
      const text = await resp.text();
      console.error(`LW API ${resp.status}: ${text.substring(0, 500)}`);
      throw new Error(`LearnWorlds API error ${resp.status}: ${text.substring(0, 200)}`);
    }

    const ct = resp.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      // Some operations return 204 No Content
      if (resp.status === 204) return { success: true };
      const body = await resp.text();
      throw new Error(`Expected JSON, got: ${body.substring(0, 200)}`);
    }

    return await resp.json();
  }
  throw new Error("Unreachable");
}

// ── Map LW user response to local DB row ──
function mapLwUserToDbRow(lwUser: any): Record<string, unknown> {
  const tags = lwUser.tags || [];
  const aruhaz = tags.filter((t: string) => t.startsWith("cf_aruhaz_"));
  const beosztas = tags.filter((t: string) => t.startsWith("cf_munkakorod"));
  const startOfEmpl =
    lwUser.fields?.cf_munkaviszonyodkezdete ||
    lwUser.fields?.cf_munkaviszonyod_kezdete ||
    lwUser.fields?.cf_munkaviszony_kezdete ||
    null;

  return {
    user_id: lwUser.id,
    username: lwUser.username || `${lwUser.eu?.first_name || ""} ${lwUser.eu?.last_name || ""}`.trim() || lwUser.email,
    email: lwUser.email || null,
    aruhaz: aruhaz.length > 0 ? aruhaz : null,
    beosztas: beosztas.length > 0 ? beosztas : null,
    start_of_empl: startOfEmpl || null,
    updated_at: new Date().toISOString(),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const clientId = Deno.env.get("LEARNWORLDS_CLIENT_ID")?.trim() || Deno.env.get("LW_CLIENT_ID")?.trim() || "";
    const accessToken = await getAccessToken(clientId);
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!clientId) {
      throw new Error("Missing LearnWorlds CLIENT_ID");
    }

    const sb = createClient(supabaseUrl, supabaseKey);
    const { action, ...payload } = await req.json();

    console.log(`[manage-user] action=${action}`);

    // ════════════════════════════════════════════
    // ACTION: create
    // ════════════════════════════════════════════
    if (action === "create") {
      const { email, username, password, tags, fields } = payload;
      if (!email) throw new Error("Email is required");

      const normalizedFields = fields && typeof fields === "object" ? { ...(fields as Record<string, unknown>) } : undefined;
      if (normalizedFields?.cf_munkaviszonyod_kezdete) {
        normalizedFields.cf_munkaviszonyodkezdete = normalizedFields.cf_munkaviszonyod_kezdete;
        delete normalizedFields.cf_munkaviszonyod_kezdete;
      }

      const lwBody: Record<string, unknown> = { email };
      if (username) lwBody.username = username;
      if (password) lwBody.password = password;
      if (tags && tags.length > 0) lwBody.tags = tags;
      // NOTE: LW v2 POST /users does NOT accept custom `fields` — they must be set via PUT after creation.

      let lwUser: any;
      try {
        lwUser = await lwRequest(`${API_BASE}/users`, accessToken, clientId, "POST", lwBody);
        console.log(`[create] LW user created: ${lwUser.id}`);
      } catch (postErr) {
        // POST may have actually succeeded on LW side but timed out before responding.
        // Try to find the user by email and continue with PUT to set fields/tags.
        console.warn(`[create] POST failed (${postErr}); attempting lookup by email`);
        const lookup = await lwRequest(
          `${API_BASE}/users?email=${encodeURIComponent(email)}`,
          accessToken,
          clientId,
          "GET"
        );
        const found = Array.isArray(lookup?.data) ? lookup.data[0] : (Array.isArray(lookup) ? lookup[0] : lookup?.users?.[0]);
        if (!found?.id) {
          throw postErr;
        }
        lwUser = found;
        console.log(`[create] Recovered LW user via lookup: ${lwUser.id}`);
      }

      // Set custom fields and ensure tags via PUT (PUT is idempotent and retries on timeout)
      const putBody: Record<string, unknown> = {};
      if (normalizedFields && Object.keys(normalizedFields).length > 0) {
        putBody.fields = normalizedFields;
      }
      if (tags && tags.length > 0) {
        putBody.tags = tags;
      }
      if (Object.keys(putBody).length > 0) {
        try {
          lwUser = await lwRequest(
            `${API_BASE}/users/${lwUser.id}`,
            accessToken,
            clientId,
            "PUT",
            putBody
          );
          console.log(`[create] Custom fields/tags set for user: ${lwUser.id}`);
        } catch (e) {
          console.error(`[create] Failed to set custom fields:`, e);
        }
      }

      // Sync to local DB
      const dbRow = mapLwUserToDbRow(lwUser);
      const { error: dbErr } = await sb.from("users").upsert(dbRow, { onConflict: "user_id" });
      if (dbErr) console.error("[create] DB upsert error:", dbErr);

      return new Response(JSON.stringify({ success: true, user: lwUser }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ════════════════════════════════════════════
    // ACTION: update
    // ════════════════════════════════════════════
    if (action === "update") {
      const { user_id, username, email, tags, fields } = payload;
      if (!user_id) throw new Error("user_id is required");

      const normalizedFields = fields && typeof fields === "object" ? { ...(fields as Record<string, unknown>) } : undefined;
      if (normalizedFields?.cf_munkaviszonyod_kezdete) {
        normalizedFields.cf_munkaviszonyodkezdete = normalizedFields.cf_munkaviszonyod_kezdete;
        delete normalizedFields.cf_munkaviszonyod_kezdete;
      }

      const lwBody: Record<string, unknown> = {};
      if (username) lwBody.username = username;
      if (email) lwBody.email = email;
      if (tags) lwBody.tags = tags;
      if (normalizedFields) lwBody.fields = normalizedFields;

      const lwUser = await lwRequest(`${API_BASE}/users/${user_id}`, accessToken, clientId, "PUT", lwBody);
      console.log(`[update] LW user updated: ${user_id}`);

      // Sync to local DB
      const dbRow = mapLwUserToDbRow(lwUser);
      const { error: dbErr } = await sb.from("users").upsert(dbRow, { onConflict: "user_id" });
      if (dbErr) console.error("[update] DB upsert error:", dbErr);

      return new Response(JSON.stringify({ success: true, user: lwUser }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ════════════════════════════════════════════
    // ACTION: suspend
    // ════════════════════════════════════════════
    if (action === "suspend") {
      const { user_id, is_suspended } = payload;
      if (!user_id) throw new Error("user_id is required");

      const lwUser = await lwRequest(
        `${API_BASE}/users/${user_id}`,
        accessToken,
        clientId,
        "PUT",
        { is_suspended: is_suspended !== false }
      );
      console.log(`[suspend] LW user ${is_suspended !== false ? "suspended" : "reactivated"}: ${user_id}`);

      return new Response(JSON.stringify({ success: true, user: lwUser }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ════════════════════════════════════════════
    // ACTION: get (fetch single user from LW)
    // ════════════════════════════════════════════
    if (action === "get") {
      const { user_id } = payload;
      if (!user_id) throw new Error("user_id is required");

      const lwUser = await lwRequest(`${API_BASE}/users/${user_id}`, accessToken, clientId, "GET");

      return new Response(JSON.stringify({ success: true, user: lwUser }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ════════════════════════════════════════════
    // ACTION: enroll (enroll user in a course)
    // ════════════════════════════════════════════
    if (action === "enroll") {
      const { user_id, course_id } = payload;
      if (!user_id || !course_id) throw new Error("user_id and course_id are required");

      const result = await lwRequest(
        `${API_BASE}/users/${user_id}/enrollment`,
        accessToken,
        clientId,
        "POST",
        {
          productId: course_id,
          productType: "course",
          price: 0,
        }
      );
      console.log(`[enroll] User ${user_id} enrolled in course ${course_id}`);

      return new Response(JSON.stringify({ success: true, enrollment: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ════════════════════════════════════════════
    // ACTION: unenroll (remove enrollment)
    // ════════════════════════════════════════════
    if (action === "unenroll") {
      const { user_id, course_id } = payload;
      if (!user_id || !course_id) throw new Error("user_id and course_id are required");

      await lwRequest(
        `${API_BASE}/users/${user_id}/enrollment`,
        accessToken,
        clientId,
        "DELETE"
      );
      console.log(`[unenroll] User ${user_id} unenrolled from course ${course_id}`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    console.error("[manage-user] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
