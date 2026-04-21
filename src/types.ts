export interface WordPair {
  english: string;
  urdu: string;
}

export interface GameCard {
  id: string;
  text: string;
  type: 'english' | 'urdu';
  pairId: string; // The index or unique ID linking the pair
}

export interface GameState {
  cards: GameCard[];
  selectedCard: GameCard | null;
  matchedPairIds: string[];
  history: WordPair[];
  isLoading: boolean;
  isWon: boolean;
  isLost: boolean;
  hintPairId: string | null;
  shakingCardIds: string[];
  mistakes: number;
  helpsUsed: number;
  totalCoins: number;
  timeLeft: number;
  currentRound: number;
  pendingReward: number;
  unlockedThemeIds: string[];
  currentThemeId: string;
  flyingCoins: { 
    id: number; 
    x: number; 
    y: number; 
    targetX?: number; 
    targetY?: number; 
    offsetX?: number; 
    offsetY?: number; 
  }[];
}

export interface AppTheme {
  id: string;
  name: string;
  nameUrdu: string;
  price: number;
  colors: {
    primary: string;
    secondary: string;
    background: string;
    card: string;
    text: string;
    accent: string;
  };
}
