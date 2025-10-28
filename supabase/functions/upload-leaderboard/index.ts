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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: csvData } = await req.json() as { data: LeaderboardData[] };

    console.log(`Processing ${csvData.length} leaderboard entries from CSV`);

    // Validate data
    if (!Array.isArray(csvData) || csvData.length === 0) {
      throw new Error('Invalid CSV data: expected non-empty array');
    }

    // Validate required fields
    for (const entry of csvData) {
      if (!entry.username || typeof entry.total_score !== 'number') {
        throw new Error(`Invalid entry: ${JSON.stringify(entry)}`);
      }
    }

    // Sort by total_score descending and assign ranks
    const sortedData = [...csvData].sort((a, b) => b.total_score - a.total_score);
    
    const rankedData = sortedData.map((entry, index) => ({
      user_id: entry.username.toLowerCase().replace(/\s+/g, '_'), // Generate user_id from username
      username: entry.username,
      email: entry.email || null,
      total_score: entry.total_score || 0,
      exam_count: entry.exam_count || 0,
      average_score: entry.average_score || 0,
      rank: index + 1,
      last_activity: new Date().toISOString(),
    }));

    // Clear existing cache and insert new data
    console.log('Clearing existing leaderboard cache...');
    const { error: deleteError } = await supabase
      .from('leaderboard_cache')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows

    if (deleteError) {
      console.error('Error clearing cache:', deleteError);
      throw deleteError;
    }

    console.log('Inserting new leaderboard data...');
    const { error: insertError } = await supabase
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
