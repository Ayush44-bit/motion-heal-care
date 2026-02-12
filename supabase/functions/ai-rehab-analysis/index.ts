import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { mode, patientData } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let systemPrompt = "";

    if (mode === "patient") {
      systemPrompt = `You are an Explainable AI rehabilitation assistant for a stroke patient. You analyze the patient's mobility session data and doctor feedback to:

1. **Explain** the patient's current mobility status in simple, encouraging language
2. **Analyze** trends in their session scores and what they mean
3. **Suggest** specific rehabilitation exercises tailored to their mobility level
4. **Provide reasoning** for each suggestion (why this exercise helps, which muscles/joints it targets)

Structure your response with clear sections using markdown:
- **📊 Progress Analysis** - What the data shows
- **💡 Key Insights** - What's improving, what needs attention
- **🏋️ Recommended Exercises** - 3-5 specific exercises with descriptions and reasoning
- **🎯 Goals for Next Week** - Actionable targets

Keep the tone warm, supportive, and medically informative. Use simple language.`;
    } else if (mode === "doctor") {
      systemPrompt = `You are an Explainable AI clinical decision support system for a rehabilitation doctor. You analyze patient mobility data to provide:

1. **Clinical insights** with statistical reasoning
2. **Pattern detection** in mobility progression
3. **Risk indicators** (plateaus, regressions, anomalies)
4. **Treatment optimization** suggestions with evidence-based reasoning
5. **Comparative analysis** against typical recovery trajectories

Structure your response with clear sections using markdown:
- **📈 Clinical Summary** - Data-driven overview
- **🔍 Pattern Analysis** - Trends, plateaus, anomalies detected
- **⚠️ Risk Indicators** - Areas requiring attention with reasoning
- **💊 Treatment Recommendations** - Evidence-based suggestions
- **📋 Documentation Notes** - Key points for clinical records

Use professional medical terminology. Be precise and evidence-oriented.`;
    } else {
      return new Response(JSON.stringify({ error: "Invalid mode" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userMessage = `Here is the patient rehabilitation data to analyze:\n\n${JSON.stringify(patientData, null, 2)}`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits depleted. Please add funds." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(
        JSON.stringify({ error: "AI analysis failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-rehab-analysis error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
