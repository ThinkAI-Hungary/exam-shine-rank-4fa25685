import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LeaderboardData {
  username: string;
  total_score: number;
  exam_count: number;
  average_score: number;
  email?: string;
}

// Validation constants
const MAX_USERNAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 255;
const MAX_SCORE = 10000;
const MAX_EXAM_COUNT = 1000;
const MAX_AVERAGE = 100;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateLeaderboardEntry(entry: any, index: number): string | null {
  if (!entry.username || typeof entry.username !== 'string') {
    return `Entry ${index + 1}: Missing or invalid username`;
  }
  
  if (entry.username.trim().length === 0 || entry.username.length > MAX_USERNAME_LENGTH) {
    return `Entry ${index + 1}: Username must be 1-${MAX_USERNAME_LENGTH} characters`;
  }
  
  if (typeof entry.total_score !== 'number' || entry.total_score < 0 || entry.total_score > MAX_SCORE) {
    return `Entry ${index + 1}: Total score must be between 0 and ${MAX_SCORE}`;
  }
  
  if (entry.exam_count !== undefined) {
    if (typeof entry.exam_count !== 'number' || entry.exam_count < 0 || entry.exam_count > MAX_EXAM_COUNT || !Number.isInteger(entry.exam_count)) {
      return `Entry ${index + 1}: Exam count must be an integer between 0 and ${MAX_EXAM_COUNT}`;
    }
  }
  
  if (entry.average_score !== undefined) {
    if (typeof entry.average_score !== 'number' || entry.average_score < 0 || entry.average_score > MAX_AVERAGE) {
      return `Entry ${index + 1}: Average score must be between 0 and ${MAX_AVERAGE}`;
    }
  }
  
  if (entry.email !== undefined && entry.email !== null && entry.email !== '') {
    if (typeof entry.email !== 'string' || entry.email.length > MAX_EMAIL_LENGTH) {
      return `Entry ${index + 1}: Email must be less than ${MAX_EMAIL_LENGTH} characters`;
    }
    if (!EMAIL_REGEX.test(entry.email)) {
      return `Entry ${index + 1}: Invalid email format`;
    }
  }
  
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization');
    
    // Create client with service role for admin check
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Verify user is authenticated and is an admin
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin
    const { data: roles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    if (!roles?.some(r => r.role === 'admin')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: csvData } = await req.json() as { data: LeaderboardData[] };

    console.log(`Processing ${csvData.length} leaderboard entries from CSV`);

    // Validate data structure
    if (!Array.isArray(csvData) || csvData.length === 0) {
      throw new Error('Invalid CSV data: expected non-empty array');
    }

    // Validate each entry
    const validationErrors: string[] = [];
    for (let i = 0; i < csvData.length; i++) {
      const error = validateLeaderboardEntry(csvData[i], i);
      if (error) {
        validationErrors.push(error);
      }
    }

    if (validationErrors.length > 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Validation failed',
          details: validationErrors 
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Sort by total_score descending and assign ranks
    const sortedData = [...csvData].sort((a, b) => b.total_score - a.total_score);
    
    const rankedData = sortedData.map((entry, index) => ({
      user_id: entry.username.trim().toLowerCase().replace(/\s+/g, '_'),
      username: entry.username.trim(),
      email: entry.email?.trim() || null,
      total_score: entry.total_score || 0,
      exam_count: entry.exam_count || 0,
      average_score: entry.average_score || 0,
      rank: index + 1,
      last_activity: new Date().toISOString(),
    }));

    // Clear existing cache and insert new data
    console.log('Clearing existing leaderboard cache...');
    const { error: deleteError } = await supabaseAdmin
      .from('leaderboard_cache')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (deleteError) {
      console.error('Error clearing cache:', deleteError);
      throw deleteError;
    }

    console.log('Inserting new leaderboard data...');
    const { error: insertError } = await supabaseAdmin
      .from('leaderboard_cache')
      .insert(rankedData);

    if (insertError) {
      console.error('Error inserting data:', insertError);
      throw insertError;
    }

    console.log(`Successfully updated leaderboard with ${rankedData.length} entries`);

    return new Response(
      JSON.stringify({
        success: true,
        count: rankedData.length,
        message: `Leaderboard updated with ${rankedData.length} entries`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in upload-leaderboard function:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message || 'Failed to process CSV upload' 
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
