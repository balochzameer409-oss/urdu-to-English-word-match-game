import { GoogleGenAI, Type } from "@google/genai";
import { WordPair } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function generateWordPairs(history: WordPair[]): Promise<WordPair[]> {
  const historyString = history.map(p => `${p.english} (${p.urdu})`).join(", ");
  
  const prompt = `Generate 10 pairs of English and Urdu words for Islamic children to learn English. 
  The words should be simple, educational, and related to daily life or Islamic concepts (e.g., Mosque, Prayer, Book, Water, Fruit, etc.).
  
  CRITICAL: Do NOT include any of these previously used words: [${historyString}].
  
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
    // Fallback data in case of API failure
    return [
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
  }
}
