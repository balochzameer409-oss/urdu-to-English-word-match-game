import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { BookOpen, RefreshCw, Trophy, Star, Moon, Sun } from 'lucide-react';
import { generateWordPairs } from './lib/gemini';
import { WordPair, GameCard, GameState } from './types';
import { sounds } from './lib/sounds';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

const STORAGE_KEY = 'islamic_puzzle_history';

export default function App() {
  const [state, setState] = useState<GameState>({
    cards: [],
    selectedCard: null,
    matchedPairIds: [],
    history: [],
    isLoading: true,
    isWon: false,
  });

  const [score, setScore] = useState(0);

  // Load history from local storage
  useEffect(() => {
    const savedHistory = localStorage.getItem(STORAGE_KEY);
    if (savedHistory) {
      setState(prev => ({ ...prev, history: JSON.parse(savedHistory) }));
    }
    startNewGame();
  }, []);

  const startNewGame = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, isWon: false, matchedPairIds: [], selectedCard: null }));
    
    // Get current history to avoid repeats
    const currentHistory = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const pairs = await generateWordPairs(currentHistory);
    
    // Update history in local storage (keep last 100 words to avoid bloat)
    const newHistory = [...currentHistory, ...pairs].slice(-100);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));

    // Create 20 cards (10 English, 10 Urdu)
    const gameCards: GameCard[] = [];
    pairs.forEach((pair, index) => {
      const pairId = `pair-${index}`;
      gameCards.push({
        id: `${pairId}-en`,
        text: pair.english,
        type: 'english',
        pairId,
      });
      gameCards.push({
        id: `${pairId}-ur`,
        text: pair.urdu,
        type: 'urdu',
        pairId,
      });
    });

    // Shuffle cards
    const shuffledCards = gameCards.sort(() => Math.random() - 0.5);

    setState(prev => ({
      ...prev,
      cards: shuffledCards,
      history: newHistory,
      isLoading: false,
    }));
    setScore(0);
  }, []);

  const handleCardClick = (card: GameCard) => {
    if (state.matchedPairIds.includes(card.pairId)) return;
    if (state.selectedCard?.id === card.id) {
      setState(prev => ({ ...prev, selectedCard: null }));
      return;
    }

    if (!state.selectedCard) {
      sounds.playSelect();
      setState(prev => ({ ...prev, selectedCard: card }));
    } else {
      // Check for match
      if (state.selectedCard.pairId === card.pairId && state.selectedCard.type !== card.type) {
        // Match!
        sounds.playMatch();
        const newMatchedIds = [...state.matchedPairIds, card.pairId];
        setState(prev => ({
          ...prev,
          matchedPairIds: newMatchedIds,
          selectedCard: null,
        }));
        setScore(prev => prev + 10);

        if (newMatchedIds.length === 10) {
          sounds.playWin();
          setState(prev => ({ ...prev, isWon: true }));
          confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#D4AF37', '#006400', '#FDF5E6']
          });
        }
      } else {
        // No match - highlight the new card instead
        sounds.playWrong();
        setState(prev => ({ ...prev, selectedCard: card }));
      }
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex flex-col items-center p-4 md:p-8">
      {/* Background Pattern */}
      <div className="absolute inset-0 islamic-pattern pointer-events-none" />

      {/* Header */}
      <motion.header 
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="relative z-10 text-center mb-8"
      >
        <div className="flex items-center justify-center gap-2 mb-2">
          <Moon className="text-islamic-gold fill-islamic-gold w-6 h-6" />
          <h1 className="text-3xl md:text-4xl font-bold text-islamic-green">
            Welcome to Words Game
          </h1>
          <Star className="text-islamic-gold fill-islamic-gold w-6 h-6" />
        </div>
        <p className="text-islamic-dark opacity-80 font-medium">
          Learn English
        </p>
        <div className="mt-4 flex items-center justify-center gap-4">
          <div className="bg-white/50 backdrop-blur-sm px-4 py-1 rounded-full border border-islamic-gold/30 shadow-sm">
            <span className="text-sm font-semibold text-islamic-green">Score: {score}</span>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={startNewGame}
            disabled={state.isLoading}
            className="border-islamic-gold text-islamic-green hover:bg-islamic-gold/10"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${state.isLoading ? 'animate-spin' : ''}`} />
            New Game
          </Button>
        </div>
      </motion.header>

      {/* Game Grid */}
      <main className="relative z-10 w-full max-w-4xl mx-auto">
        {state.isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="w-12 h-12 border-4 border-islamic-gold border-t-transparent rounded-full animate-spin" />
            <p className="text-islamic-green font-medium arabic-text">الفاظ تیار ہو رہے ہیں...</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3 md:gap-4">
            <AnimatePresence>
              {state.cards.map((card) => {
                const isMatched = state.matchedPairIds.includes(card.pairId);
                const isSelected = state.selectedCard?.id === card.id;

                if (isMatched) return null;

                return (
                  <motion.div
                    key={card.id}
                    layout
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.5, opacity: 0 }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Card
                      onClick={() => handleCardClick(card)}
                      className={`
                        h-24 md:h-32 flex items-center justify-center p-2 cursor-pointer transition-all duration-300
                        border-2 text-center select-none
                        ${isSelected 
                          ? 'border-islamic-gold bg-islamic-gold/20 shadow-lg shadow-islamic-gold/20' 
                          : 'border-islamic-green/20 bg-white hover:border-islamic-gold/50 shadow-sm'}
                      `}
                    >
                      <span className={`
                        text-lg md:text-xl font-bold
                        ${card.type === 'urdu' ? 'arabic-text text-islamic-green' : 'text-islamic-dark'}
                      `}>
                        {card.text}
                      </span>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </main>

      {/* Win Modal */}
      <Dialog open={state.isWon} onOpenChange={(open) => !open && setState(prev => ({ ...prev, isWon: false }))}>
        <DialogContent className="sm:max-w-md bg-islamic-cream border-islamic-gold">
          <DialogHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-islamic-gold/20 rounded-full flex items-center justify-center mb-4">
              <Trophy className="w-10 h-10 text-islamic-gold" />
            </div>
            <DialogTitle className="text-2xl font-bold text-islamic-green arabic-text">
              ماشاءاللہ! آپ جیت گئے
            </DialogTitle>
            <DialogDescription className="text-islamic-dark text-lg">
              SubhanAllah! You matched all the words correctly.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="text-4xl font-bold text-islamic-gold">
              {score} Points
            </div>
            <p className="text-sm text-center text-islamic-dark/60">
              Your English is getting stronger every day!
            </p>
          </div>
          <DialogFooter className="sm:justify-center">
            <Button 
              onClick={startNewGame}
              className="bg-islamic-green hover:bg-islamic-green/90 text-white px-8 py-6 text-lg rounded-full"
            >
              Play Again
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Footer Decoration */}
      <footer className="mt-auto pt-12 pb-4 text-center opacity-40 flex items-center gap-4">
        <Sun className="w-4 h-4" />
        <span className="text-xs uppercase tracking-widest font-semibold">Islamic Learning Puzzle</span>
        <Sun className="w-4 h-4" />
      </footer>
    </div>
  );
}
