import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const email = user.email;
    if (!email) {
      throw new Error("User email not found");
    }

    console.log(`Attempting auto-link for user ${user.id} with email ${email}`);

    // Check if LearnWorlds user exists with this email
    const { data: lwUser, error: lwError } = await supabase
      .from('users')
      .select('user_id, email, username')
      .eq('email', email)
      .single();

    if (lwError || !lwUser) {
      console.log(`No LearnWorlds account found for email ${email}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          linked: false,
          message: "No LearnWorlds account found with this email" 
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    // Update profile with LearnWorlds link
    const { data: profile, error: updateError } = await supabase
      .from('profiles')
      .update({
        learnworlds_user_id: lwUser.user_id,
        learnworlds_email: lwUser.email,
        linked_at: new Date().toISOString(),
        link_verified: true,
        link_method: 'auto',
      })
      .eq('id', user.id)
      .select()
      .single();

    if (updateError) {
      console.error("Error auto-linking profile:", updateError);
      throw updateError;
    }

    console.log(`Successfully auto-linked user ${user.id} to LearnWorlds user ${lwUser.user_id}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        linked: true,
        profile,
        learnworlds_username: lwUser.username,
        message: "Account automatically linked to LearnWorlds" 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error: any) {
    console.error("Error in auto-link-on-signup:", error);
    return new Response(
      JSON.stringify({ success: false, linked: false, error: error.message }),
      { 
        status: error.message === "Unauthorized" ? 401 : 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
