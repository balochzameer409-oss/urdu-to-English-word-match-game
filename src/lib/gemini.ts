import { GoogleGenAI, Type } from "@google/genai";
import { WordPair } from "../types";

// Lazy initialization to prevent crash if API key is missing during build or initial load
let aiInstance: GoogleGenAI | null = null;

function getAI() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
      console.warn("GEMINI_API_KEY is missing. Please set it in your environment variables.");
      return null;
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

export async function generateWordPairs(history: WordPair[]): Promise<WordPair[]> {
  const historyString = history.map(p => `${p.english} (${p.urdu})`).join(", ");
  
  const fallbackData: WordPair[] = [
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
  ];

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
  } catch (error) {
    console.error("Error generating word pairs:", error);
    return fallbackData;
  }
}
