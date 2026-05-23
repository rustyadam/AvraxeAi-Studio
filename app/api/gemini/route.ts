import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

// Dynamic init of the SDK to avoid crashes if API key is missing
let aiClient: GoogleGenAI | null = null;

function getAiClient() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

export async function POST(req: NextRequest) {
  try {
    const { prompt, vibe, key, bpm } = await req.json();
    
    const client = getAiClient();
    
    const systemInstruction = 
      "You are an elite, multi-platinum Nashville Studio Music Producer and master arranger. " +
      "Provide professional, highly detailed studio session guides, arrangement notes, chord chart " +
      "modifications (referencing standard chords and the Nashville Number System), specific mic setup recommendations, " +
      "lyrical draft prompts or snippets, and production tips for a country/folk/roots session. " +
      "Keep formatting beautiful, clean, and highly readable using markdown, utilizing bullet points and tables.";

    const fullPrompt = `The session is in the vibe of "${vibe || "Modern Country"}".
The active song Key is "${key || "G"}".
The active BPM is "${bpm || 110}".
User Additional Prompt: "${prompt || "Give me some classic acoustic guitar fingerpicking patterns and mix ideas."}"

Provide:
1. **Nashville Session Arrangement Structure**: How the acoustic guitar, fiddle, bass, and drums should sequence.
2. **Nashville Number System (NNS) Progression**: A recommended progression for the Chorus/Verse in Nashville Numbers.
3. **Studio Recording Setup**: Specific mic selections and preamp suggestions for getting that warm, analog Nashville acoustic sound.
4. **Co-Writer's Lyrical Snippet**: A quick, 4-line lyric block fitting this style.
5. **Pro Mixing Advice**: EQ and compression techniques for our tracks.`;

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: fullPrompt,
      config: {
        systemInstruction,
        temperature: 0.8,
      }
    });

    return NextResponse.json({ text: response.text });
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to generate contents" },
      { status: 500 }
    );
  }
}
