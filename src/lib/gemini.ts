import { GoogleGenAI, Type } from "@google/genai";
import { WordPair } from "../types";

// Lazy initialization to prevent crash if API key is missing during build or initial load
let aiInstance: GoogleGenAI | null = null;

function getAI() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    
    if (!apiKey || apiKey.length < 10) {
      console.warn("AI Warning: No valid API Key found. Using fallback local words.");
      return null;
    }

    // Mask for secure logging in console
    const masked = `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`;
    console.log(`AI Status: API Key linked successfully (${masked})! Initializing Gemini AI...`);
    
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

export async function generateWordPairs(history: WordPair[], round: number): Promise<WordPair[]> {
  const historyString = history.map(p => `${p.english} (${p.urdu})`).join(", ");
  
  const fallbackPacks: WordPair[][] = [
    [
      { english: "Book", urdu: "کتاب" },
      { english: "Pen", urdu: "قلم" },
      { english: "Water", urdu: "پانی" },
      { english: "Mosque", urdu: "مسجد" },
      { english: "Prayer", urdu: "نماز" },
      { english: "Sun", urdu: "سورج" },
      { english: "Moon", urdu: "چاند" },
      { english: "Star", urdu: "ستارہ" },
      { english: "Flower", urdu: "پھول" },
      { english: "Fruit", urdu: "پھل" },
    ],
    [
      { english: "Good Morning", urdu: "صبح بخیر" },
      { english: "How are you?", urdu: "آپ کیسے ہیں؟" },
      { english: "Welcome", urdu: "خوش آمدید" },
      { english: "Thank you", urdu: "شکریہ" },
      { english: "Excuse me", urdu: "معذرت" },
      { english: "Nice to meet you", urdu: "آپ سے مل کر خوشی ہوئی" },
      { english: "Take care", urdu: "اپنا خیال رکھیں" },
      { english: "God bless you", urdu: "اللہ آپ کو خوش رکھے" },
      { english: "I am hungry", urdu: "مجھے بھوک لگی ہے" },
      { english: "Where is the mosque?", urdu: "مسجد کہاں ہے؟" },
    ]
  ];

  // Pick a random pack
  const fallbackData = fallbackPacks[round > 3 ? 1 : 0];

  const ai = getAI();
  if (!ai) return fallbackData;

  let difficultyPrompt = "";
  if (round <= 3) {
    difficultyPrompt = "Focus on SIMPLE SINGLE WORDS (nouns, animals, basic objects).";
  } else if (round <= 6) {
    difficultyPrompt = "Focus on COMMON SHORT PHRASES and GREETINGS (e.g., Hello, How are you, Thank you, Good night).";
  } else {
    difficultyPrompt = "Focus on FULL CONVERSATIONAL SENTENCES and DIALOGUE useful for daily life (e.g., 'I am going to the market', 'Peace be upon you', 'What is your name?').";
  }

  const prompt = `Generate exactly 10 UNIQUE and NEW pairs of English and Urdu content for a learning game. 
  Current Round: ${round}.
  Target Difficulty: ${difficultyPrompt}
  
  Theme: Focus on daily common conversational English (Hello, Hi, greetings, polite manners, basic needs).
  
  CRITICAL: You MUST NOT use any of the following items that were already used in previous rounds: [${historyString}].
  
  Return exactly 10 pairs in JSON format.
  Each pair must have "english" and "urdu" keys.
  Example: [{"english": "Peace be upon you", "urdu": "السلام علیکم"}]`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              english: { type: Type.STRING },
              urdu: { type: Type.STRING },
              category: { type: Type.STRING },
            },
            required: ["english", "urdu"],
          },
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");
    
    const pairs: WordPair[] = JSON.parse(text);
    return pairs;
  } catch (error: any) {
    if (error?.status === 'RESOURCE_EXHAUSTED' || error?.message?.includes('429')) {
      console.warn("AI Status: Quota reached (429). Using pre-defined expert word pack.");
    } else {
      console.error("AI Status: API Error.", error);
    }
    return fallbackData;
  }
}
