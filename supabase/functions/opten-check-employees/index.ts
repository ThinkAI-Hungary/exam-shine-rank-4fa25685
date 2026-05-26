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

interface OptenCompanyResult {
  taxNumber: string;
  employeeCount: number | null;
  companyStatus: string | null;
  foundationDate: string | null;
  mainActivity: string | null;
  registeredCapital: string | null;
  companyForm: string | null;
  rawScoring: any;
  rawExtend: any;
  error?: string;
}

async function fetchCompanyData(token: string, taxNumber: string): Promise<OptenCompanyResult> {
  const cleanTax = taxNumber.replace(/\D/g, "").substring(0, 8);
  if (cleanTax.length < 8) {
    return { taxNumber: cleanTax, employeeCount: null, companyStatus: null, foundationDate: null, mainActivity: null, registeredCapital: null, companyForm: null, rawScoring: null, rawExtend: null, error: "Tax number must be 8 digits" };
  }

  console.log(`[OPTEN] Fetching company data for tax: ${cleanTax}`);
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
    return { taxNumber: cleanTax, employeeCount: null, companyStatus: null, foundationDate: null, mainActivity: null, registeredCapital: null, companyForm: null, rawScoring: null, rawExtend: null, error: `OPTEN API error (${resp.status}): ${text.substring(0, 200)}` };
  }

  const data = await resp.json();

  if (data?.error) {
    return { taxNumber: cleanTax, employeeCount: null, companyStatus: null, foundationDate: null, mainActivity: null, registeredCapital: null, companyForm: null, rawScoring: null, rawExtend: null, error: `OPTEN error: ${data.error}` };
  }

  const multiInfo = data?.MultiInfoResponse?.MultiInfo;
  if (!multiInfo) {
    return { taxNumber: cleanTax, employeeCount: null, companyStatus: null, foundationDate: null, mainActivity: null, registeredCapital: null, companyForm: null, rawScoring: data, rawExtend: null, error: "No MultiInfo in response" };
  }

  // Extract employee count from ScoringAdatok (tipus 49)
  const scoringAdatok = multiInfo.ScoringAdatok || [];
  const letszamEntry = scoringAdatok.find((s: any) => String(s.tipus) === "49");
  let employeeCount: number | null = null;
  if (letszamEntry?.Value?.length > 0) {
    const raw = letszamEntry.Value[0]._ ?? letszamEntry.Value[0].value ?? null;
    employeeCount = typeof raw === "number" ? raw : parseInt(String(raw), 10) || null;
  }

  // Extract extra company info from AlapAdatok, ExtendData, and R1_Altalanos
  const alap = multiInfo.AlapAdatok || {};
  const extend = multiInfo.ExtendData || {};
  const r1 = multiInfo.R1_Altalanos || {};

  const companyStatus = r1.statusz || alap.statusz || extend.statusz || null;
  const foundationDate = r1.alapitas_datuma || alap.alapitas || extend.alapitas_datuma || null;
  const mainActivity = r1.fo_tevekenyseg || alap.tevekenyseg || extend.fo_tevekenyseg || null;
  const registeredCapital = r1.jegyzett_toke || alap.toke || extend.jegyzett_toke || null;
  const companyForm = r1.cegforma || alap.cegforma || extend.cegforma || null;

  console.log(`[OPTEN] Tax ${cleanTax}: employees=${employeeCount}, status=${companyStatus}, form=${companyForm}`);

  return {
    taxNumber: cleanTax,
    employeeCount,
    companyStatus,
    foundationDate,
    mainActivity,
    registeredCapital,
    companyForm,
    rawScoring: scoringAdatok,
    rawExtend: { alap, extend, r1 },
  };
}

// ── Email notification (Resend API) ──

async function sendChangeNotification(
  _supabase: any,
  companyName: string,
  taxNumber: string,
  previousCount: number | null,
  currentCount: number,
) {
  const diff = previousCount !== null ? currentCount - previousCount : null;
  const direction = diff !== null ? (diff > 0 ? "növekedett" : diff < 0 ? "csökkent" : "nem változott") : "első lekérdezés";
  const arrow = diff !== null ? (diff > 0 ? "+" : "") : "";

  const subject = `[OPTEN] ${companyName} létszám ${direction}: ${previousCount ?? "?"} → ${currentCount}`;
  const htmlBody = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #1a1a2e;">OPTEN Létszámváltozás</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Cég</td><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">${companyName}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Adószám</td><td style="padding: 8px; border-bottom: 1px solid #eee; font-family: monospace;">${taxNumber}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Korábbi létszám</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${previousCount ?? "N/A"}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Jelenlegi létszám</td><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; font-size: 1.2em;">${currentCount}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Változás</td><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; color: ${diff !== null && diff > 0 ? '#16a34a' : diff !== null && diff < 0 ? '#dc2626' : '#666'};">${diff !== null ? `${arrow}${diff} fő` : "Első lekérdezés"}</td></tr>
        <tr><td style="padding: 8px; color: #666;">Időpont</td><td style="padding: 8px;">${new Date().toLocaleString("hu-HU", { timeZone: "Europe/Budapest" })}</td></tr>
      </table>
    </div>
  `;

  console.log(`[NOTIFY] Sending email to ${NOTIFICATION_EMAIL}: ${subject}`);

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (resendKey) {
    try {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: "OPTEN Monitor <onboarding@resend.dev>",
          to: [NOTIFICATION_EMAIL],
          subject,
          html: htmlBody,
        }),
      });
      const result = await resp.json();
      console.log(`[NOTIFY] Resend response:`, JSON.stringify(result));
      return { subject, sent: true, provider: "resend", id: result.id };
    } catch (err) {
      console.error("[NOTIFY] Resend email failed:", err);
    }
  } else {
    console.log("[NOTIFY] RESEND_API_KEY not set, logging only");
    console.log(`[NOTIFY] Subject: ${subject}`);
  }

  return { subject, sent: false, provider: "log" };
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
        const result = await fetchCompanyData(token, cleanTax);

        if (result.employeeCount !== null) {
          await sb.from("company_monitoring").update({
            current_employee_count: result.employeeCount,
            company_status: result.companyStatus,
            foundation_date: result.foundationDate,
            main_activity: result.mainActivity,
            registered_capital: result.registeredCapital,
            company_form: result.companyForm,
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
      const result = await fetchCompanyData(token, cleanTax);

      if (result.employeeCount !== null) {
        await sb.from("company_monitoring").update({
          current_employee_count: result.employeeCount,
          company_status: result.companyStatus,
          foundation_date: result.foundationDate,
          main_activity: result.mainActivity,
          registered_capital: result.registeredCapital,
          company_form: result.companyForm,
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
    // ACTION: update-company
    // ════════════════════════════════════════
    if (action === "update-company") {
      const { company_id, company_name, notes, lw_group_id } = payload;
      if (!company_id) throw new Error("company_id is required");

      const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (company_name !== undefined) updateData.company_name = company_name;
      if (notes !== undefined) updateData.notes = notes;
      if (lw_group_id !== undefined) updateData.lw_group_id = lw_group_id || null;

      const { error: updErr } = await sb.from("company_monitoring").update(updateData).eq("id", company_id);
      if (updErr) throw new Error(`Update failed: ${updErr.message}`);

      const { data: updated } = await sb.from("company_monitoring").select("*").eq("id", company_id).single();
      return new Response(JSON.stringify({ success: true, company: updated }), {
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
    // ACTION: export-csv
    // ════════════════════════════════════════
    if (action === "export-csv") {
      const { data: companies } = await sb
        .from("company_monitoring")
        .select("*")
        .eq("is_active", true)
        .order("company_name");

      const { data: logs } = await sb
        .from("company_monitoring_log")
        .select("company_id, employee_count, previous_count, changed, checked_at")
        .order("checked_at", { ascending: false });

      // Build CSV
      const header = "Cégnév;Adószám;Aktuális létszám;Előző létszám;Változás;Cégforma;Státusz;Főtevékenység;Utolsó ellenőrzés;Ellenőrzések száma";
      const rows = (companies || []).map((c: any) => {
        const companyLogs = (logs || []).filter((l: any) => l.company_id === c.id);
        const diff = c.previous_employee_count !== null && c.current_employee_count !== null
          ? c.current_employee_count - c.previous_employee_count : "";
        return [
          c.company_name,
          c.tax_number,
          c.current_employee_count ?? "",
          c.previous_employee_count ?? "",
          diff,
          c.company_form ?? "",
          c.company_status ?? "",
          c.main_activity ?? "",
          c.last_checked_at ? new Date(c.last_checked_at).toLocaleDateString("hu-HU") : "",
          companyLogs.length,
        ].join(";");
      });

      const csv = [header, ...rows].join("\n");
      return new Response(csv, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="company_monitoring_${new Date().toISOString().substring(0, 10)}.csv"`,
        },
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
      const result = await fetchCompanyData(token, company.tax_number);

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

          const result = await fetchCompanyData(token, company.tax_number);

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
