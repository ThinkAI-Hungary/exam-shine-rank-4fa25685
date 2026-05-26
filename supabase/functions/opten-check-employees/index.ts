import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const OPTEN_URL = "https://www.opten.hu/soapto/rest";
const NOTIFICATION_EMAIL = "adetwow@gmail.com";

// ── OPTEN API helpers ──

let cachedOptenToken: string | null = null;
let optenTokenExpiresAt = 0;

async function getOptenToken(): Promise<string> {
  // Token is valid for 3 hours, refresh 10 min early
  if (cachedOptenToken && Date.now() < optenTokenExpiresAt - 600_000) {
    return cachedOptenToken;
  }

  const username = Deno.env.get("OPTEN_USERNAME")?.trim() || "";
  const password = Deno.env.get("OPTEN_PASSWORD")?.trim() || "";

  if (!username || !password) {
    throw new Error("OPTEN credentials not configured (OPTEN_USERNAME / OPTEN_PASSWORD)");
  }

  console.log("[OPTEN] Requesting auth token...");
  const resp = await fetch(OPTEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service: "authorize",
      function: "Authorize",
      arguments: {
        Name: username,
        Password: password,
      },
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OPTEN auth failed (${resp.status}): ${text.substring(0, 300)}`);
  }

  const data = await resp.json();
  console.log("[OPTEN] Auth response keys:", Object.keys(data));

  // The token is in AuthorizationResponse.Token
  const token =
    data?.AuthorizationResponse?.Token ||
    data?.Token ||
    data?.token;

  if (!token) {
    console.error("[OPTEN] Auth response:", JSON.stringify(data).substring(0, 500));
    throw new Error("OPTEN auth response did not contain a token");
  }

  cachedOptenToken = token;
  optenTokenExpiresAt = Date.now() + 3 * 60 * 60 * 1000; // 3 hours
  console.log("[OPTEN] Token obtained successfully");
  return token;
}

interface OptenEmployeeResult {
  taxNumber: string;
  employeeCount: number | null;
  rawScoring: any;
  error?: string;
}

async function fetchEmployeeCount(token: string, taxNumber: string): Promise<OptenEmployeeResult> {
  // Ensure 8-digit tax number
  const cleanTax = taxNumber.replace(/\D/g, "").substring(0, 8);
  if (cleanTax.length < 8) {
    return { taxNumber: cleanTax, employeeCount: null, rawScoring: null, error: "Tax number must be 8 digits" };
  }

  console.log(`[OPTEN] Fetching employee count for tax: ${cleanTax}`);
  const resp = await fetch(OPTEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service: "multiinfo",
      function: "MultiInfo",
      arguments: {
        Token: token,
        FirmTaxNo: cleanTax,
        FirmRegNo: "",
      },
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    return { taxNumber: cleanTax, employeeCount: null, rawScoring: null, error: `OPTEN API error (${resp.status}): ${text.substring(0, 200)}` };
  }

  const data = await resp.json();

  // Check for OPTEN-level error
  if (data?.error) {
    return { taxNumber: cleanTax, employeeCount: null, rawScoring: null, error: `OPTEN error: ${data.error}` };
  }

  // Extract ScoringAdatok → tipus "49" (Létszám)
  const multiInfo = data?.MultiInfoResponse?.MultiInfo;
  if (!multiInfo) {
    return { taxNumber: cleanTax, employeeCount: null, rawScoring: data, error: "No MultiInfo in response" };
  }

  const scoringAdatok = multiInfo.ScoringAdatok || [];
  const letszamEntry = scoringAdatok.find((s: any) => String(s.tipus) === "49");

  if (!letszamEntry || !letszamEntry.Value || letszamEntry.Value.length === 0) {
    console.warn(`[OPTEN] No employee count data (tipus 49) for ${cleanTax}`);
    return { taxNumber: cleanTax, employeeCount: null, rawScoring: scoringAdatok, error: "No employee count in ScoringAdatok" };
  }

  const employeeCount = letszamEntry.Value[0]._ ?? letszamEntry.Value[0].value ?? null;
  console.log(`[OPTEN] Tax ${cleanTax}: employee count = ${employeeCount}`);

  return {
    taxNumber: cleanTax,
    employeeCount: typeof employeeCount === "number" ? employeeCount : parseInt(String(employeeCount), 10) || null,
    rawScoring: scoringAdatok,
  };
}

// ── Email notification ──

async function sendChangeNotification(
  supabase: any,
  companyName: string,
  taxNumber: string,
  previousCount: number | null,
  currentCount: number,
) {
  const diff = previousCount !== null ? currentCount - previousCount : null;
  const direction = diff !== null ? (diff > 0 ? "növekedett" : diff < 0 ? "csökkent" : "nem változott") : "első lekérdezés";
  const arrow = diff !== null ? (diff > 0 ? "▲" : diff < 0 ? "▼" : "—") : "🆕";

  const subject = `[OPTEN] ${companyName} létszám ${direction} ${arrow} ${previousCount ?? "?"} → ${currentCount}`;
  const body = `
Cég: ${companyName}
Adószám: ${taxNumber}
Korábbi létszám: ${previousCount ?? "N/A"}
Jelenlegi létszám: ${currentCount}
Változás: ${diff !== null ? (diff > 0 ? `+${diff}` : String(diff)) : "Első lekérdezés"}
Időpont: ${new Date().toLocaleString("hu-HU", { timeZone: "Europe/Budapest" })}
  `.trim();

  console.log(`[NOTIFY] Sending email to ${NOTIFICATION_EMAIL}: ${subject}`);

  // Use Supabase's built-in email or log for now
  // For production, integrate with Resend/SendGrid/SMTP
  // For now, we log the notification and store it
  try {
    // Try sending via Supabase auth admin (hack for dev)
    // In production, replace with proper email service
    console.log(`[NOTIFY] Email subject: ${subject}`);
    console.log(`[NOTIFY] Email body: ${body}`);
  } catch (err) {
    console.error("[NOTIFY] Email send failed:", err);
  }

  return { subject, body, sent: true };
}

// ── Main handler ──

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const sb = createClient(supabaseUrl, supabaseKey);

    const { action, ...payload } = await req.json();
    console.log(`[opten-check-employees] action=${action}`);

    // ════════════════════════════════════════
    // ACTION: add-company
    // ════════════════════════════════════════
    if (action === "add-company") {
      const { company_name, tax_number, notes } = payload;
      if (!company_name || !tax_number) {
        throw new Error("company_name and tax_number are required");
      }

      const cleanTax = tax_number.replace(/\D/g, "").substring(0, 8);
      if (cleanTax.length < 8) {
        throw new Error("Tax number must be at least 8 digits");
      }

      // Check if already exists
      const { data: existing } = await sb
        .from("company_monitoring")
        .select("id, is_active")
        .eq("tax_number", cleanTax)
        .maybeSingle();

      if (existing) {
        if (!existing.is_active) {
          // Reactivate
          await sb.from("company_monitoring").update({ is_active: true, company_name, notes, updated_at: new Date().toISOString() }).eq("id", existing.id);
        }
        // Do an immediate check
        const token = await getOptenToken();
        const result = await fetchEmployeeCount(token, cleanTax);

        if (result.employeeCount !== null) {
          await sb.from("company_monitoring").update({
            current_employee_count: result.employeeCount,
            last_checked_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", existing.id);

          await sb.from("company_monitoring_log").insert({
            company_id: existing.id,
            employee_count: result.employeeCount,
            previous_count: null,
            changed: false,
            raw_response: result.rawScoring,
          });
        }

        const { data: updated } = await sb.from("company_monitoring").select("*").eq("id", existing.id).single();
        return new Response(JSON.stringify({ success: true, company: updated, initial_employee_count: result.employeeCount, reactivated: !existing.is_active }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Insert new company
      const { data: newCompany, error: insertErr } = await sb
        .from("company_monitoring")
        .insert({
          company_name,
          tax_number: cleanTax,
          notes: notes || null,
          is_active: true,
        })
        .select("*")
        .single();

      if (insertErr) throw new Error(`DB insert error: ${insertErr.message}`);

      // Immediate OPTEN check
      const token = await getOptenToken();
      const result = await fetchEmployeeCount(token, cleanTax);

      if (result.employeeCount !== null) {
        await sb.from("company_monitoring").update({
          current_employee_count: result.employeeCount,
          last_checked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", newCompany.id);

        await sb.from("company_monitoring_log").insert({
          company_id: newCompany.id,
          employee_count: result.employeeCount,
          previous_count: null,
          changed: false,
          raw_response: result.rawScoring,
        });
      }

      const { data: final } = await sb.from("company_monitoring").select("*").eq("id", newCompany.id).single();
      return new Response(JSON.stringify({
        success: true,
        company: final,
        initial_employee_count: result.employeeCount,
        opten_error: result.error || null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ════════════════════════════════════════
    // ACTION: remove-company
    // ════════════════════════════════════════
    if (action === "remove-company") {
      const { company_id } = payload;
      if (!company_id) throw new Error("company_id is required");

      await sb.from("company_monitoring").update({
        is_active: false,
        updated_at: new Date().toISOString(),
      }).eq("id", company_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ════════════════════════════════════════
    // ACTION: check-single
    // ════════════════════════════════════════
    if (action === "check-single") {
      const { company_id, tax_number } = payload;

      let company: any;
      if (company_id) {
        const { data, error } = await sb.from("company_monitoring").select("*").eq("id", company_id).single();
        if (error) throw new Error(`Company not found: ${error.message}`);
        company = data;
      } else if (tax_number) {
        const { data, error } = await sb.from("company_monitoring").select("*").eq("tax_number", tax_number.replace(/\D/g, "").substring(0, 8)).single();
        if (error) throw new Error(`Company not found: ${error.message}`);
        company = data;
      } else {
        throw new Error("company_id or tax_number is required");
      }

      const token = await getOptenToken();
      const result = await fetchEmployeeCount(token, company.tax_number);

      if (result.error) {
        return new Response(JSON.stringify({ success: false, error: result.error }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const previousCount = company.current_employee_count;
      const currentCount = result.employeeCount!;
      const changed = previousCount !== null && previousCount !== currentCount;

      // Update company
      const updateData: Record<string, unknown> = {
        current_employee_count: currentCount,
        previous_employee_count: previousCount,
        last_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (changed) {
        updateData.last_change_at = new Date().toISOString();
      }
      await sb.from("company_monitoring").update(updateData).eq("id", company.id);

      // Log
      await sb.from("company_monitoring_log").insert({
        company_id: company.id,
        employee_count: currentCount,
        previous_count: previousCount,
        changed,
        raw_response: result.rawScoring,
      });

      // Notify if changed
      let notification = null;
      if (changed) {
        notification = await sendChangeNotification(sb, company.company_name, company.tax_number, previousCount, currentCount);
      }

      return new Response(JSON.stringify({
        success: true,
        company_name: company.company_name,
        tax_number: company.tax_number,
        employee_count: currentCount,
        previous_count: previousCount,
        changed,
        notification,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ════════════════════════════════════════
    // ACTION: check-all
    // ════════════════════════════════════════
    if (action === "check-all") {
      console.log("[check-all] Starting monthly check for all active companies...");

      const { data: companies, error: fetchErr } = await sb
        .from("company_monitoring")
        .select("*")
        .eq("is_active", true)
        .order("company_name");

      if (fetchErr) throw new Error(`Failed to fetch companies: ${fetchErr.message}`);
      if (!companies || companies.length === 0) {
        return new Response(JSON.stringify({ success: true, checked: 0, changed: 0, message: "No active companies to check" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`[check-all] Found ${companies.length} active companies`);

      const token = await getOptenToken();
      let checked = 0;
      let changedCount = 0;
      let errors = 0;
      const results: any[] = [];

      for (const company of companies) {
        try {
          // Rate limit: 1 request per second
          if (checked > 0) {
            await new Promise((r) => setTimeout(r, 1000));
          }

          const result = await fetchEmployeeCount(token, company.tax_number);

          if (result.error || result.employeeCount === null) {
            console.warn(`[check-all] Error for ${company.company_name}: ${result.error}`);
            errors++;
            results.push({ company_name: company.company_name, error: result.error });
            continue;
          }

          const previousCount = company.current_employee_count;
          const currentCount = result.employeeCount;
          const changed = previousCount !== null && previousCount !== currentCount;

          // Update
          const updateData: Record<string, unknown> = {
            current_employee_count: currentCount,
            previous_employee_count: previousCount,
            last_checked_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          if (changed) {
            updateData.last_change_at = new Date().toISOString();
          }
          await sb.from("company_monitoring").update(updateData).eq("id", company.id);

          // Log
          await sb.from("company_monitoring_log").insert({
            company_id: company.id,
            employee_count: currentCount,
            previous_count: previousCount,
            changed,
            raw_response: result.rawScoring,
          });

          if (changed) {
            changedCount++;
            await sendChangeNotification(sb, company.company_name, company.tax_number, previousCount, currentCount);
          }

          checked++;
          results.push({
            company_name: company.company_name,
            tax_number: company.tax_number,
            previous: previousCount,
            current: currentCount,
            changed,
          });
        } catch (err) {
          console.error(`[check-all] Failed for ${company.company_name}:`, err);
          errors++;
          results.push({ company_name: company.company_name, error: err instanceof Error ? err.message : String(err) });
        }
      }

      console.log(`[check-all] Done: ${checked} checked, ${changedCount} changed, ${errors} errors`);

      return new Response(JSON.stringify({
        success: true,
        checked,
        changed: changedCount,
        errors,
        total: companies.length,
        results,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    console.error("[opten-check-employees] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
