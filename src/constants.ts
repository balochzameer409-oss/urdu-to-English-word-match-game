import { AppTheme } from "./types";

export const THEMES: AppTheme[] = [
  {
    id: 'emerald',
    name: 'Emerald Mosque',
    nameUrdu: 'زمردی مسجد',
    price: 0,
    colors: {
      primary: '#006400', // islamic-green
      secondary: '#D4AF37', // islamic-gold
      background: '#FDF5E6', // islamic-cream
      card: '#FFFFFF',
      text: '#1A2F1A',
      accent: '#FFD700'
    }
  },
  {
    id: 'royal',
    name: 'Royal Sultan',
    nameUrdu: 'شاہی سلطان',
    price: 800,
    colors: {
      primary: '#4B0082', // Indigo/Royal Purple
      secondary: '#FFD700', // Gold
      background: '#F3E5F5', // Light Purple Tint
      card: '#FFFFFF',
      text: '#2D004D',
      accent: '#BA55D3'
    }
  },
  {
    id: 'sunset',
    name: 'Desert Sunset',
    nameUrdu: 'صحرائی شام',
    price: 1500,
    colors: {
      primary: '#E65100', // Deep Orange
      secondary: '#FFB300', // Amber
      background: '#FFF3E0', // Very Light Orange
      card: '#FFFFFF',
      text: '#4E342E',
      accent: '#FF7043'
    }
  },
  {
    id: 'night',
    name: 'Midnight Stars',
    nameUrdu: 'ستاروں بھری رات',
    price: 1700,
    colors: {
      primary: '#0D47A1', // Royal Blue
      secondary: '#81D4FA', // Light Blue
      background: '#E1F5FE', // Very Light Blue
      card: '#FFFFFF',
      text: '#01579B',
      accent: '#29B6F6'
    }
  },
  {
    id: 'onyx',
    name: 'Imperial Onyx',
    nameUrdu: 'شاہی عقیق',
    price: 3000,
    colors: {
      primary: '#1A1A1A', // Deep Onyx
      secondary: '#D4AF37', // Gold
      background: '#121212', // Near Black
      card: '#222222',
      text: '#E5E5E5',
      accent: '#FFD700'
    }
  }
];

export const STORAGE_KEYS = {
  HISTORY: 'islamic_puzzle_history',
  COINS: 'islamic_puzzle_coins',
  ROUND: 'islamic_puzzle_round',
  THEME: 'islamic_puzzle_current_theme',
  UNLOCKED_THEMES: 'islamic_puzzle_unlocked_themes'
};
