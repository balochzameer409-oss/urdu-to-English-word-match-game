import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { BookOpen, RefreshCw, Trophy, Star, Moon, Sun, HelpCircle, Heart, XCircle, Coins, Timer } from 'lucide-react';
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
const COINS_KEY = 'islamic_puzzle_coins';
const ROUND_KEY = 'islamic_puzzle_round';

export default function App() {
  const [state, setState] = useState<GameState>({
    cards: [],
    selectedCard: null,
    matchedPairIds: [],
    history: [],
    isLoading: true,
    isWon: false,
    isLost: false,
    hintPairId: null,
    shakingCardIds: [],
    mistakes: 0,
    helpsUsed: 0,
    totalCoins: 0,
    timeLeft: 120,
    currentRound: 1,
  });

  const [score, setScore] = useState(0);
  const masterVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

  // Load history, coins, and round from local storage
  useEffect(() => {
    const savedHistory = localStorage.getItem(STORAGE_KEY);
    const savedCoins = localStorage.getItem(COINS_KEY);
    const savedRound = localStorage.getItem(ROUND_KEY);
    
    setState(prev => ({ 
      ...prev, 
      history: savedHistory ? JSON.parse(savedHistory) : [],
      totalCoins: savedCoins ? parseInt(savedCoins, 10) : 0,
      currentRound: savedRound ? parseInt(savedRound, 10) : 1
    }));
    
    // Pass false to not increment round on first load
    startNewGame(false);
  }, []);

  const startNewGame = useCallback(async (isNextRound: boolean = false) => {
    setState(prev => {
      const nextRound = isNextRound ? prev.currentRound + 1 : prev.currentRound;
      // Persist next round if it changed
      if (isNextRound) {
        localStorage.setItem(ROUND_KEY, nextRound.toString());
      }
      
      return { 
        ...prev, 
        isLoading: true, 
        isWon: false, 
        isLost: false,
        matchedPairIds: [], 
        selectedCard: null, 
        hintPairId: null, 
        shakingCardIds: [],
        mistakes: 0,
        helpsUsed: 0,
        timeLeft: 120,
        currentRound: nextRound
      };
    });
    
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

  // Timer logic
  useEffect(() => {
    if (state.isLoading || state.isWon || state.isLost) return;

    const timer = setInterval(() => {
      setState(prev => {
        if (prev.timeLeft <= 1) {
          clearInterval(timer);
          sounds.playGameOver();
          return { ...prev, timeLeft: 0, isLost: true };
        }
        return { ...prev, timeLeft: prev.timeLeft - 1 };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [state.isLoading, state.isWon, state.isLost]);

  const handleCardClick = (card: GameCard) => {
    if (state.matchedPairIds.includes(card.pairId) || state.hintPairId || state.shakingCardIds.includes(card.id) || state.isLost || state.isWon) return;
    
    // Speak the text
    speakText(card.text, card.type === 'urdu' ? 'ur' : 'en');

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
          sounds.playCoin(); 
          const baseScore = score + 10;
          const timeBonus = state.timeLeft * 2;
          const finalScore = baseScore + timeBonus;
          const newTotalCoins = state.totalCoins + finalScore;
          localStorage.setItem(COINS_KEY, newTotalCoins.toString());
          
          setState(prev => ({ 
            ...prev, 
            isWon: true,
            totalCoins: newTotalCoins
          }));
          
          confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#D4AF37', '#006400', '#FDF5E6']
          });
        }
      } else {
        // No match - Trigger vibration/shake
        sounds.playWrong();
        const firstCardId = state.selectedCard.id;
        const secondCardId = card.id;
        
        const newMistakes = state.mistakes + 1;
        const shouldLose = newMistakes >= 3;

        setState(prev => ({ 
          ...prev, 
          shakingCardIds: [firstCardId, secondCardId],
          selectedCard: null,
          mistakes: newMistakes,
          isLost: shouldLose
        }));

        if (shouldLose) {
          sounds.playGameOver();
        }

        // Stop shaking after animation duration
        setTimeout(() => {
          setState(prev => ({ ...prev, shakingCardIds: [] }));
        }, 500);
      }
    }
  };

  const speakText = (text: string, lang: string) => {
    if (!('speechSynthesis' in window)) return;
    
    // Stop current speech instantly
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9; 
    
    if (masterVoiceRef.current) {
      utterance.voice = masterVoiceRef.current;
      utterance.lang = masterVoiceRef.current.lang;
    } else {
      // Fallback if master voice not found yet
      utterance.lang = lang === 'ur' ? 'ur-PK' : 'en-US';
    }
    
    window.speechSynthesis.speak(utterance);
  };

  // Optimize voice loading - Find the best "Multilingual" Master Voice
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;

    const findMasterVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length === 0) return;

      // Logic: Prefer Google Urdu or Hindi voices as they are highly multilingual
      const bestVoice = voices.find(v => v.lang === 'ur-PK') || 
                        voices.find(v => v.lang === 'hi-IN') ||
                        voices.find(v => v.name.includes('Google') && (v.lang.startsWith('ur') || v.lang.startsWith('hi'))) ||
                        voices.find(v => v.lang.startsWith('ur')) ||
                        voices.find(v => v.lang.startsWith('hi'));

      if (bestVoice) {
        masterVoiceRef.current = bestVoice;
      } else {
        // Absolute fallback to any English voice which usually handles common words
        masterVoiceRef.current = voices.find(v => v.lang.startsWith('en')) || null;
      }

      // Warm up the engine
      if (masterVoiceRef.current) {
        const warmUp = new SpeechSynthesisUtterance('');
        warmUp.volume = 0;
        window.speechSynthesis.speak(warmUp);
      }
    };

    findMasterVoice();
    window.speechSynthesis.onvoiceschanged = findMasterVoice;
    
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const handleAutoMatch = () => {
    if (state.hintPairId || state.isLost || state.isWon || state.helpsUsed >= 3) return;

    // Logic: If a card is already selected, help with THAT pair.
    // Otherwise, help with the first unmatched pair.
    let pairId: string | undefined;
    
    if (state.selectedCard) {
      pairId = state.selectedCard.pairId;
    } else {
      const unmatchedPair = state.cards.find(c => !state.matchedPairIds.includes(c.pairId));
      pairId = unmatchedPair?.pairId;
    }
    
    if (pairId) {
      const pairCards = state.cards.filter(c => c.pairId === pairId);
      
      const newHelpsUsed = state.helpsUsed + 1;
      const shouldLose = newHelpsUsed >= 3;

      // Highlight them first
      setState(prev => ({ ...prev, hintPairId: pairId || null, helpsUsed: newHelpsUsed }));
      
      // Speak both words
      const enWord = pairCards.find(c => c.type === 'english')?.text || '';
      const urWord = pairCards.find(c => c.type === 'urdu')?.text || '';
      
      speakText(enWord, 'en');
      setTimeout(() => speakText(urWord, 'ur'), 1000);

      // Wait 2.5 seconds before matching and removing
      setTimeout(() => {
        sounds.playMatch();
        const newMatchedIds = [...state.matchedPairIds, pairId!];
        
        // Final check: if user uses 3rd help, they lose UNLESS this was the final pair
        const isActuallyLost = shouldLose && newMatchedIds.length < 10;

        setState(prev => ({
          ...prev,
          matchedPairIds: newMatchedIds,
          selectedCard: null,
          hintPairId: null,
          isLost: isActuallyLost
        }));
        
        if (isActuallyLost) {
          sounds.playGameOver();
        }

        const gainedScore = 5;
        setScore(prev => prev + gainedScore);

        if (newMatchedIds.length === 10 && !isActuallyLost) {
          sounds.playWin();
          sounds.playCoin();
          const baseScore = score + gainedScore;
          const timeBonus = state.timeLeft * 2;
          const finalTotalScore = baseScore + timeBonus;
          const newTotalCoins = state.totalCoins + finalTotalScore;
          localStorage.setItem(COINS_KEY, newTotalCoins.toString());

          setState(prev => ({ 
            ...prev, 
            isWon: true,
            totalCoins: newTotalCoins
          }));

          confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#D4AF37', '#006400', '#FDF5E6']
          });
        }
      }, 2500);
    }
  };

  const buyHealthOnly = () => {
    if (state.totalCoins >= 15) {
      const newTotalCoins = state.totalCoins - 15;
      localStorage.setItem(COINS_KEY, newTotalCoins.toString());
      setState(prev => {
        // Only clear isLost if we have time left
        const isStillLost = prev.timeLeft <= 0;
        return {
          ...prev,
          totalCoins: newTotalCoins,
          isLost: isStillLost,
          mistakes: 0,
          helpsUsed: 0,
        };
      });
      sounds.playBuy(); 
    }
  };

  const buyTimeOnly = () => {
    if (state.totalCoins >= 15) {
      const newTotalCoins = state.totalCoins - 15;
      localStorage.setItem(COINS_KEY, newTotalCoins.toString());
      setState(prev => {
        // Only clear isLost if we have mistakes left
        const isStillLost = prev.mistakes >= 3 || prev.helpsUsed >= 3;
        return {
          ...prev,
          totalCoins: newTotalCoins,
          isLost: isStillLost,
          timeLeft: 60,
        };
      });
      sounds.playBuy(); 
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex flex-col items-center p-2 md:p-8">
      {/* Background Pattern */}
      <div className="absolute inset-0 islamic-pattern pointer-events-none" />

      {/* Header */}
      <motion.header 
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="relative z-10 text-center mb-4"
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
        <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
          <div className="flex items-center gap-2 bg-white/50 backdrop-blur-sm px-4 py-1 rounded-full border border-islamic-gold/30 shadow-sm">
            <span className="text-sm font-semibold text-islamic-green">Round: {state.currentRound}</span>
          </div>

          <div className="flex items-center gap-2 bg-white/50 backdrop-blur-sm px-4 py-1 rounded-full border border-islamic-gold/30 shadow-sm">
            <span className="text-sm font-semibold text-islamic-green">Score: {score}</span>
          </div>

          <div className="flex items-center gap-2 bg-amber-500/10 backdrop-blur-sm px-4 py-1 rounded-full border border-amber-500/30 shadow-sm">
            <Coins className="w-4 h-4 text-amber-600 fill-amber-600" />
            <span className="text-sm font-bold text-amber-700">{state.totalCoins}</span>
          </div>

          <div className={`flex items-center gap-2 px-4 py-1 rounded-full border shadow-sm transition-all duration-300 ${state.timeLeft <= 20 ? 'bg-red-500/20 border-red-500/40 animate-pulse' : 'bg-blue-500/10 border-blue-500/30'}`}>
            <Timer className={`w-4 h-4 ${state.timeLeft <= 20 ? 'text-red-600' : 'text-blue-600'}`} />
            <span className={`text-sm font-bold ${state.timeLeft <= 20 ? 'text-red-700' : 'text-blue-700'}`}>
              {Math.floor(state.timeLeft / 60)}:{(state.timeLeft % 60).toString().padStart(2, '0')}
            </span>
          </div>

          <div className="flex items-center gap-1 bg-red-50/50 backdrop-blur-sm px-3 py-1 rounded-full border border-red-200 shadow-sm">
            {[...Array(3)].map((_, i) => (
              <Heart 
                key={i} 
                className={`w-4 h-4 ${i < (3 - state.mistakes) ? 'text-red-500 fill-red-500' : 'text-red-200'}`} 
              />
            ))}
          </div>

          <div className="flex items-center gap-1 bg-yellow-50/50 backdrop-blur-sm px-3 py-1 rounded-full border border-yellow-200 shadow-sm">
            {[...Array(3)].map((_, i) => (
              <Star 
                key={i} 
                className={`w-4 h-4 ${i < (3 - state.helpsUsed) ? 'text-yellow-500 fill-yellow-500' : 'text-yellow-200'}`} 
              />
            ))}
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
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleAutoMatch}
            disabled={state.isLoading || state.matchedPairIds.length === 10}
            className="border-islamic-green/30 text-islamic-green hover:bg-islamic-green/5 italic"
          >
            <HelpCircle className="w-4 h-4 mr-2" />
            I need help / مجھے نہیں پتہ
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
          <div className="grid grid-cols-4 sm:grid-cols-4 md:grid-cols-5 gap-2 md:gap-4">
            <AnimatePresence>
              {state.cards.map((card) => {
                const isMatched = state.matchedPairIds.includes(card.pairId);
                const isSelected = state.selectedCard?.id === card.id;
                const isHint = state.hintPairId === card.pairId;
                const isShaking = state.shakingCardIds.includes(card.id);

                if (isMatched) return null;

                return (
                  <motion.div
                    key={card.id}
                    layout
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ 
                      scale: isHint ? [1, 1.1, 1] : 1,
                      opacity: 1,
                      x: isShaking ? [0, -10, 10, -10, 10, -5, 5, 0] : 0,
                    }}
                    transition={{
                      scale: isHint ? { repeat: Infinity, duration: 1 } : { duration: 0.2 },
                      x: isShaking ? { duration: 0.4 } : { duration: 0.2 }
                    }}
                    exit={{ scale: 0.5, opacity: 0 }}
                    whileHover={!isShaking ? { scale: 1.05 } : {}}
                    whileTap={!isShaking ? { scale: 0.95 } : {}}
                  >
                    <Card
                      onClick={() => handleCardClick(card)}
                      className={`
                        h-14 md:h-20 flex items-center justify-center p-1 md:p-2 cursor-pointer transition-all duration-300
                        border-2 text-center select-none
                        ${isShaking
                          ? 'border-red-500 bg-red-50 shadow-md shadow-red-200'
                          : isHint 
                            ? 'border-islamic-gold bg-islamic-gold/40 shadow-xl shadow-islamic-gold/40 animate-pulse' 
                            : isSelected 
                              ? 'border-islamic-gold bg-islamic-gold/20 shadow-lg shadow-islamic-gold/20' 
                              : 'border-islamic-green/20 bg-white hover:border-islamic-gold/50 shadow-sm'}
                      `}
                    >
                      <span className={`
                        text-sm md:text-base font-bold
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
              onClick={() => startNewGame(true)}
              className="bg-islamic-green hover:bg-islamic-green/90 text-white px-8 py-6 text-lg rounded-full"
            >
              Next Round / اگلا راؤنڈ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Loser Modal */}
      <Dialog open={state.isLost} onOpenChange={(open) => !open && startNewGame()}>
        <DialogContent className="sm:max-w-md bg-red-50 border-red-200">
          <DialogHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <XCircle className="w-10 h-10 text-red-500" />
            </div>
            <DialogTitle className="text-2xl font-bold text-red-700 arabic-text">
              افسوس! آپ ہار گئے
            </DialogTitle>
            <DialogDescription className="text-red-900/70 text-lg">
              Oh no! You've used up your lives, help or time.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="p-4 bg-white/80 rounded-xl border border-red-100 shadow-sm w-full text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Coins className="w-5 h-5 text-amber-600 fill-amber-600" />
                <span className="text-2xl font-bold text-amber-700">{state.totalCoins} Coins</span>
              </div>
              <p className="text-xs text-red-800/60 uppercase tracking-wider font-semibold">Your Bank</p>
            </div>
            
            <div className="grid grid-cols-2 gap-3 w-full">
              <Button 
                onClick={buyHealthOnly}
                disabled={state.totalCoins < 15}
                className={`flex flex-col items-center gap-1 py-10 rounded-xl shadow-lg transition-all ${state.totalCoins >= 15 ? 'bg-red-500 hover:bg-red-600 shadow-red-100' : 'bg-gray-200 text-gray-500 shadow-none'}`}
              >
                <Heart className={`w-5 h-5 ${state.totalCoins >= 15 ? 'fill-white' : ''}`} />
                <span className="font-bold text-xs">Buy Health</span>
                <span className="text-[10px] opacity-80 italic">15 Coins</span>
              </Button>

              <Button 
                onClick={buyTimeOnly}
                disabled={state.totalCoins < 15}
                className={`flex flex-col items-center gap-1 py-10 rounded-xl shadow-lg transition-all ${state.totalCoins >= 15 ? 'bg-blue-500 hover:bg-blue-600 shadow-blue-100' : 'bg-gray-200 text-gray-500 shadow-none'}`}
              >
                <Timer className="w-5 h-5" />
                <span className="font-bold text-xs">Buy Time</span>
                <span className="text-[10px] opacity-80 italic">15 Coins</span>
              </Button>
            </div>

            {state.totalCoins < 15 && (
              <p className="text-red-800/60 text-[10px] italic">Need at least 15 coins to continue</p>
            )}
          </div>
          <DialogFooter className="sm:justify-center flex flex-col gap-2">
            <Button 
              onClick={() => startNewGame(false)}
              variant="outline"
              className="w-full border-red-200 text-red-700 hover:bg-red-100 py-6 text-lg rounded-xl"
            >
              Restart Round / دوبارہ آزمائیں
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
