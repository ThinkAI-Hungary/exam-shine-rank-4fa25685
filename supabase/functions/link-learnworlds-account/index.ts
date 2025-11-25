import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LinkAccountRequest {
  learnworlds_user_id?: string;
  email?: string;
  method: 'auto' | 'self' | 'admin';
  target_user_id?: string; // For admin manual linking
}

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

    const { learnworlds_user_id, email, method, target_user_id }: LinkAccountRequest = await req.json();

    // Determine which user to update
    let userId = user.id;
    
    // If admin is linking another user, check admin status and use target_user_id
    if (method === 'admin' && target_user_id) {
      const { data: hasAdminRole } = await supabase
        .rpc('has_role', { _user_id: user.id, _role: 'admin' });
      
      if (!hasAdminRole) {
        throw new Error("Unauthorized: Admin role required");
      }
      
      userId = target_user_id;
    }

    // Verify LearnWorlds user exists by checking if email or user_id exists in users table
    let learnworldsUserId = learnworlds_user_id;
    let learnworldsEmail = email;

    if (email && !learnworlds_user_id) {
      // Look up LearnWorlds user by email
      const { data: lwUser, error: lwError } = await supabase
        .from('users')
        .select('user_id, email')
        .eq('email', email)
        .single();

      if (lwError || !lwUser) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "No LearnWorlds account found with this email" 
          }),
          { 
            status: 404, 
            headers: { ...corsHeaders, "Content-Type": "application/json" } 
          }
        );
      }

      learnworldsUserId = lwUser.user_id;
      learnworldsEmail = lwUser.email;
    }

    if (!learnworldsUserId) {
      throw new Error("LearnWorlds user ID is required");
    }

    // Update profile with LearnWorlds link
    const { data: profile, error: updateError } = await supabase
      .from('profiles')
      .update({
        learnworlds_user_id: learnworldsUserId,
        learnworlds_email: learnworldsEmail,
        linked_at: new Date().toISOString(),
        link_verified: true,
        link_method: method,
      })
      .eq('id', userId)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating profile:", updateError);
      throw updateError;
    }

    console.log(`Successfully linked user ${userId} to LearnWorlds user ${learnworldsUserId} via ${method}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        profile,
        message: "Account successfully linked to LearnWorlds" 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error: any) {
    console.error("Error in link-learnworlds-account:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        status: error.message === "Unauthorized" ? 401 : 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
