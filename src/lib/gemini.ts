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

export async function generateWordPairs(history: WordPair[]): Promise<WordPair[]> {
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
      { english: "Apple", urdu: "سیب" },
      { english: "Birds", urdu: "پرندے" },
      { english: "Cloud", urdu: "بادل" },
      { english: "Sky", urdu: "آسمان" },
      { english: "School", urdu: "اسکول" },
      { english: "Teacher", urdu: "استاد" },
      { english: "Mother", urdu: "ماں" },
      { english: "Father", urdu: "والد" },
      { english: "Brother", urdu: "بھائی" },
      { english: "Sister", urdu: "بہن" },
    ],
    [
      { english: "Milk", urdu: "دودھ" },
      { english: "Bread", urdu: "روٹی" },
      { english: "Tree", urdu: "درخت" },
      { english: "Leaf", urdu: "پتہ" },
      { english: "River", urdu: "دریا" },
      { english: "Fish", urdu: "مچھلی" },
      { english: "Cat", urdu: "بلی" },
      { english: "Chair", urdu: "کرسی" },
      { english: "Table", urdu: "میز" },
      { english: "Window", urdu: "کھڑکی" },
    ]
  ];

  // Pick a random pack
  const fallbackData = fallbackPacks[Math.floor(Math.random() * fallbackPacks.length)];

  const ai = getAI();
  if (!ai) return fallbackData;

  const prompt = `Generate 10 UNIQUE and NEW pairs of English and Urdu words for Islamic children to learn English. 
  Focus on a diverse mix of categories: Islamic terms (e.g., Mosque, Hajj), nature (e.g., Tree, Rain), household items, animals, and simple actions.
  The words must be simple, educational, and suitable for kids.
  
  CRITICAL: You MUST NOT use any of the following words that were already used in previous rounds: [${historyString}].
  
  Return exactly 10 pairs in JSON format.
  Each pair must have "english" and "urdu" keys.
  Example: [{"english": "Book", "urdu": "کتاب"}]`;

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
