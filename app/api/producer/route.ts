import { GoogleGenAI, Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

// Initialize the GoogleGenAI instance with appropriate headers
const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    })
  : null;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type } = body;

    if (!type) {
      return NextResponse.json({ error: "Missing action type parameter." }, { status: 400 });
    }

    if (!ai) {
      // Graceful fallback when API key is not active in dev/test setups
      return NextResponse.json(getFallbackData(type, body));
    }

    switch (type) {
      case "analyze":
        return await handleVocalAnalysis(body);
      case "orchestrate":
        return await handleOpenClawOrchestrate(body);
      case "generate-backing":
        return await handleGenerateBacking(body);
      case "convert-hum":
        return await handleConvertHum(body);
      default:
        return NextResponse.json({ error: "Unknown action type." }, { status: 400 });
    }
  } catch (error: any) {
    console.error("API error in AI Session Producer:", error);
    return NextResponse.json(
      { error: error?.message || "An error occurred on the session producer backend." },
      { status: 500 }
    );
  }
}

async function handleVocalAnalysis(body: any) {
  const { fileName, prompt = "" } = body;

  const userPrompt = `
    Analyze the vocal recording "${fileName || "Vocal_Take_#1.wav"}".
    Provide high-precision acoustic and musicological analysis suitable for a recording session:
    - Detected Key (e.g. "G Major", "E Minor", "A Major")
    - Estimated BPM (typically between 60 and 140 for country/acoustic sessions)
    - Full list of chord suggestions for each bar or section (e.g., Intro: G, C, G... Verse: G, D, Em, C...)
    - Vocal performance emotion profile (e.g., "Warm, Melancholic, Intimate, Rising tension")
    - Dynamic song sections detection (Intro, Verse 1, Chorus, Verse 2, Chorus, Solo, Outro) with bar numbers
    - Arrangement improvement suggestions (e.g., "Add double acoustic guitars to widen the chorus, high-pass at 80Hz to clean room rumble").
    
    Additional user directions if any: "${prompt}".
  `;

  const response = await ai!.models.generateContent({
    model: "gemini-3.5-flash",
    contents: userPrompt,
    config: {
      responseMimeType: "application/json",
      systemInstruction: "You are an elite multi-Grammy-winning Nashville Music Producer and Audio Analyst. Analyze raw acoustic feeds with stunning precision and aesthetic music vocabulary.",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          bpm: { type: Type.INTEGER, description: "A calculated beats per minute" },
          key: { type: Type.STRING, description: "The musical key signature" },
          emotion: { type: Type.STRING, description: "Emotion and feel of the vocal take" },
          arrangementSuggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
          sections: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING, description: "Section name like Intro, Verse, Chorus, Outro" },
                startBar: { type: Type.INTEGER },
                endBar: { type: Type.INTEGER },
                chords: { type: Type.STRING, description: "Chords played during this section" }
              },
              required: ["name", "startBar", "endBar", "chords"]
            }
          }
        },
        required: ["bpm", "key", "emotion", "arrangementSuggestions", "sections"]
      }
    }
  });

  return NextResponse.json(JSON.parse(response.text || "{}"));
}

async function handleOpenClawOrchestrate(body: any) {
  const { userCommand, projectState } = body;

  const systemPrompt = `
    Analyze the user's natural language studio direction: "${userCommand}".
    
    The current active track layout is:
    ${JSON.stringify(projectState?.tracks || [])}

    Now, coordinate a virtual meeting in the Nashville control room between our OpenClaw Agents to discuss how to implement the changes.
    The expert session agents are:
    1. "Producer Agent" (The moderator, keeping the song's Nashville charm and overarching aesthetic)
    2. "Drummer Agent" (Provides dynamic perspective, cross-sticks, brushes, side-stick shuffles, train beats)
    3. "Bass Agent" (Roots the tune, walking root-fifth country bass lines or heavy swamp-rock lines)
    4. "Pedal Steel / Fiddle Agent" (Creates emotional slide bends, crying steel swells, Nashville phrasing)
    5. "Mix Engineer Agent" (Manages gains, pans, high-passes, analog compressions, Lexicon plate reverbs)

    Generate:
    - A highly authentic session discussion of 4-6 conversational beats where they debate, align, and finalize the edits.
    - A list of structured digital audio workstation (DAW) editing actions to apply.
    - An authoritative direct summarization explaining the session upgrades.

    Your response must fit the strict JSON schema. Valid DAW edit actions are:
    "volume" (value 0.0 to 1.0), "pan" (value -1.0 to 1.0), "mute" (value true/false), "solo" (value true/false), "regenerate" (regenerates stems or MIDI with new settings), "split", "replace".
  `;

  const response = await ai!.models.generateContent({
    model: "gemini-3.5-flash",
    contents: systemPrompt,
    config: {
      responseMimeType: "application/json",
      systemInstruction: "You are the orchestrator of OpenClaw Session Room. Ensure highly engaging country-music dialogue full of pedal-steel lore, classic mixing desks (SSL/Neve), and clear engineering commands.",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          explanation: { type: Type.STRING, description: "Producer's explanation of actions taken" },
          discussion: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                agent: { type: Type.STRING, description: "Agent name: Producer, Drummer, Bassist, Steelist, Mixer" },
                message: { type: Type.STRING, description: "The agent's country studio comment or recommendation" }
              },
              required: ["agent", "message"]
            }
          },
          actions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                trackId: { type: Type.STRING, description: "e.g., vocals, drums, bass, pedal-steel, fiddle, guitar" },
                action: { type: Type.STRING, description: "volume, pan, mute, solo, regenerate" },
                value: { type: Type.STRING, description: "New value or description of details" }
              },
              required: ["trackId", "action", "value"]
            }
          }
        },
        required: ["explanation", "discussion", "actions"]
      }
    }
  });

  return NextResponse.json(JSON.parse(response.text || "{}"));
}

async function handleGenerateBacking(body: any) {
  const { genre, mood, key, bpm, instruments } = body;

  const prompt = `
    Synthesize details for a production-ready Nashville-grade backing band:
    - Genre: ${genre || "Country Ballad"}
    - Mood: ${mood || "Melancholy Sweeping"}
    - Key: ${key || "G Major"}
    - BPM: ${bpm || 78}
    - Instruments Requested: ${instruments?.join(", ") || "drums, bass, pedal steel"}

    Generate structured backing track configurations. For each selected instrument, create:
    - A custom synthesized melody layout (notes, beats, frequencies, phrasing rules) suited for our Web Audio API synthetic audio generator.
    - Specific music instructions (dynamics, accents, Nashville slides for steel).
  `;

  const response = await ai!.models.generateContent({
    model: "gemini-3.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      systemInstruction: "You are a professional session multi-instrumentalist. Produce highly authentic MIDI configurations and play instructions that map precisely to synthesize expressive acoustic instruments.",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          tracksInfo: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                trackId: { type: Type.STRING, description: "e.g., drums, bass, pedal-steel, guitar, piano" },
                instrumentName: { type: Type.STRING },
                description: { type: Type.STRING, description: "Performative feel details" },
                gains: { type: Type.NUMBER, description: "Recommended volume multiplier" },
                notes: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      note: { type: Type.STRING, description: "Musical note like G2, D2, C2, B2" },
                      time: { type: Type.NUMBER, description: "Trigger beat index (0 to 16/32)" },
                      duration: { type: Type.NUMBER, description: "Gate length in beats" },
                      accents: { type: Type.STRING, description: "Accent details (ghost-note, hammer-on, slide-swell)" }
                    },
                    required: ["note", "time", "duration"]
                  }
                }
              },
              required: ["trackId", "instrumentName", "description", "gains", "notes"]
            }
          }
        },
        required: ["tracksInfo"]
      }
    }
  });

  return NextResponse.json(JSON.parse(response.text || "{}"));
}

async function handleConvertHum(body: any) {
  const { quantize, complexity, targetInstrument, humanize } = body;

  const prompt = `
    Analyze a custom vocal humming stream being converted to a realistic performance.
    Target Instrument: ${targetInstrument || "pedal-steel"}
    Quantize Snapping: ${quantize || "1/8"}
    Complexity Knob: ${complexity || "Medium"}
    Humanization: ${humanize || "0.15"} (subtle micro-timing variance)

    Generate a highly realistic, expressive country-phrased note structure with slides:
    - For pedal-steel: Include "slideAt" (beat trigger) and "slideSwell" parameters.
    - For fiddle: Include dynamic vibrato frequency.
  `;

  const response = await ai!.models.generateContent({
    model: "gemini-3.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      systemInstruction: "You are a digital audio converter analyzing vocal/hum acoustics and extracting expressively phrased MIDI patterns.",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          midiNotes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                pitch: { type: Type.STRING },
                beat: { type: Type.NUMBER },
                duration: { type: Type.NUMBER },
                velocity: { type: Type.NUMBER },
                slideTarget: { type: Type.STRING, description: "Optional note pitch to slide into" },
                vibratoDepth: { type: Type.NUMBER, description: "0.0 to 1.0 depth" }
              },
              required: ["pitch", "beat", "duration", "velocity"]
            }
          },
          reassuranceMsg: { type: Type.STRING, description: "Friendly Nashville phrasing compliment" }
        },
        required: ["midiNotes", "reassuranceMsg"]
      }
    }
  });

  return NextResponse.json(JSON.parse(response.text || "{}"));
}

// Solid fallback state generator for high-reliability in sandbox environments
function getFallbackData(type: string, body: any) {
  switch (type) {
    case "analyze":
      return {
        bpm: body.bpm || 82,
        key: body.key || "G Major",
        emotion: "Warm, nostalgically melancholic with genuine country raw emotional grit",
        arrangementSuggestions: [
          "Widen the stereo image in the chorus to make the acoustic guitar pop.",
          "High-pass the vocal stem at 95Hz to filter out physical headphone bleed and rumble.",
          "Insert a crying pedal-steel swell at Bar 17 to crown the transitions."
        ],
        sections: [
          { name: "Intro", startBar: 1, endBar: 4, chords: "G - C - G - D" },
          { name: "Verse 1", startBar: 5, endBar: 12, chords: "G - Em - C - D" },
          { name: "Chorus", startBar: 13, endBar: 20, chords: "C - G - D - Em - C - G - D" },
          { name: "Verse 2", startBar: 21, endBar: 28, chords: "G - Em - C - D" },
          { name: "Bridge / Outro", startBar: 29, endBar: 36, chords: "Am - C - Em - D - G" }
        ]
      };

    case "orchestrate": {
      const cmd = (body.userCommand || "").toLowerCase();
      let actions: any[] = [];
      let summary = "Acknowledged! The Nashville Session Band has balanced the tracks according to your studio notes.";

      if (cmd.includes("drums") || cmd.includes("shackle") || cmd.includes("country")) {
        actions.push({ trackId: "drums", action: "regenerate", value: "Switched to classic country cross-stick train-beat shuffles" });
      }
      if (cmd.includes("bass") || cmd.includes("down") || cmd.includes("quieter")) {
        actions.push({ trackId: "bass", action: "volume", value: "0.45" });
      }
      if (cmd.includes("pedal") || cmd.includes("steel") || cmd.includes("chorus")) {
        actions.push({ trackId: "pedal-steel", action: "regenerate", value: "Added high emotive pedal-steel crying bends sliding up to G" });
        actions.push({ trackId: "pedal-steel", action: "volume", value: "0.80" });
      }
      if (cmd.includes("vocal") || cmd.includes("vocalist")) {
        actions.push({ trackId: "vocals", action: "volume", value: "0.95" });
      }
      if (actions.length === 0) {
        actions = [
          { trackId: "vocals", action: "volume", value: "0.85" },
          { trackId: "pedal-steel", action: "pan", value: "0.35" },
          { trackId: "drums", action: "volume", value: "0.75" }
        ];
      }

      return {
        explanation: summary,
        discussion: [
          {
            agent: "Producer Agent",
            message: `Alright y'all, we have a note from the glass: "${body.userCommand || "Fine-tune the vibe"}". Let's gather "around" the desk and polish this track.`
          },
          {
            agent: "Drummer Agent",
            message: "Understood. I will pull back on the heavy tom thuds and bring in a tight snare train beat with vintage brush sweeps. Keeps the country heart beating clean."
          },
          {
            agent: "Bass Agent",
            message: "I'll ride the root-and-fifths perfectly, locking down G to D with a warm upright bass warmth. Let's make sure the low end doesn't crowd those beautiful steel slides."
          },
          {
            agent: "Pedal Steel Agent",
            message: "You got it. I'll slide up on my 4th string from F# to G using my floor pedals, creating that ultimate emotional weeping cry right at the chorus."
          },
          {
            agent: "Mix Engineer Agent",
            message: "Updating the mix bus! Pulling the bass down slightly, widening the steel track 35% in the stereo field, and feeding the main vocals into our classic plate reverb."
          }
        ],
        actions: actions
      };
    }

    case "generate-backing": {
      const key = body.key || "G Major";
      const isMinor = key.includes("Minor");
      return {
        tracksInfo: [
          {
            trackId: "guitar",
            instrumentName: "Acoustic Guitar",
            description: "Warm Nashville-tuned 12-string acoustic strumming steady country rhythms.",
            gains: 0.85,
            notes: [
              { note: isMinor ? "E3" : "G3", time: 0, duration: 4 },
              { note: isMinor ? "G3" : "B3", time: 4, duration: 4 },
              { note: isMinor ? "B3" : "D3", time: 8, duration: 4 },
              { note: isMinor ? "C3" : "C3", time: 12, duration: 4 }
            ]
          },
          {
            trackId: "bass",
            instrumentName: "Bass Guitar",
            description: "Solid, warm low-end supporting bar shifts with traditional walks.",
            gains: 0.7,
            notes: [
              { note: isMinor ? "E1" : "G1", time: 0, duration: 2 },
              { note: isMinor ? "B1" : "D1", time: 2, duration: 2 },
              { note: isMinor ? "G1" : "B1", time: 4, duration: 2 },
              { note: isMinor ? "D1" : "G1", time: 6, duration: 2 }
            ]
          },
          {
            trackId: "pedal-steel",
            instrumentName: "Pedal Steel Guitar",
            description: "Ethereal, emotional slide-bends, gliding smoothly across chord root changes.",
            gains: 0.8,
            notes: [
              { note: isMinor ? "E4" : "G4", time: 2, duration: 4 },
              { note: isMinor ? "B4" : "D4", time: 6, duration: 4 },
              { note: isMinor ? "G4" : "B4", time: 10, duration: 4 }
            ]
          },
          {
            trackId: "drums",
            instrumentName: "Drums",
            description: "Authentic country cross-stick rim groove featuring brush snare shuffles and soft kick.",
            gains: 0.6,
            notes: [
              { note: "C2", time: 0, duration: 1 },
              { note: "D2", time: 2, duration: 1 },
              { note: "C2", time: 4, duration: 1 },
              { note: "D2", time: 6, duration: 1 }
            ]
          }
        ]
      };
    }

    case "convert-hum":
      return {
        midiNotes: [
          { pitch: "G4", beat: 0, duration: 1, velocity: 110, slideTarget: "A4", vibratoDepth: 0.4 },
          { pitch: "B4", beat: 2, duration: 1.5, velocity: 95, slideTarget: "C5", vibratoDepth: 0.7 },
          { pitch: "D5", beat: 4, duration: 2, velocity: 100, slideTarget: "D5", vibratoDepth: 0.8 },
          { pitch: "G5", beat: 8, duration: 4, velocity: 120, slideTarget: "G5", vibratoDepth: 0.9 }
        ],
        reassuranceMsg: "Darn good humming! That phrasing has got a beautiful Nashville slip-note character. Ideal for a weeping pedal steel or acoustic lead line!"
      };

    default:
      return { error: "Unsupported fallback type" };
  }
}
