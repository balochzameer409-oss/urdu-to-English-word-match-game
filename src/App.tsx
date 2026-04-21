import * as React from 'react';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence, useSpring, useTransform } from 'motion/react';
import confetti from 'canvas-confetti';
import { BookOpen, RefreshCw, Trophy, Star, Moon, Sun, HelpCircle, Heart, XCircle, Coins, Timer, Clock, Wallet, MoreVertical, Palette, Lock, CheckCircle2 } from 'lucide-react';
import { generateWordPairs } from './lib/gemini';
import { WordPair, GameCard, GameState, AppTheme } from './types';
import { THEMES, STORAGE_KEYS } from './constants';
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

const SafeInt = (val: any, fallback = 0) => {
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? fallback : parsed;
};

const SmoothNumber = ({ value, className, style }: { value: number, className?: string, style?: React.HTMLAttributes<HTMLSpanElement>['style'] }) => {
  const spring = useSpring(value, {
    stiffness: 300, 
    damping: 30,
    restDelta: 0.05
  });

  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  const displayValue = useTransform(spring, (latest) => Math.round(latest));

  return <motion.span className={className} style={style}>{displayValue}</motion.span>;
};

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
    pendingReward: 0,
    unlockedThemeIds: ['emerald'],
    currentThemeId: 'emerald',
    flyingCoins: [],
  });

  const [score, setScore] = useState(0);
  const [isBuying, setIsBuying] = useState(false);
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [isBankHitting, setIsBankHitting] = useState(false);
  const coinTargetRef = useRef<HTMLDivElement>(null);
  const modalCoinTargetRef = useRef<HTMLDivElement>(null);
  const rewardSourceRef = useRef<HTMLDivElement>(null);
  const masterVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

  // Load history, coins, and themes from local storage
  useEffect(() => {
    const savedHistory = localStorage.getItem(STORAGE_KEYS.HISTORY);
    const savedCoins = localStorage.getItem(STORAGE_KEYS.COINS);
    const savedRound = localStorage.getItem(STORAGE_KEYS.ROUND);
    const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME);
    const savedUnlocked = localStorage.getItem(STORAGE_KEYS.UNLOCKED_THEMES);
    
    setState(prev => ({ 
      ...prev, 
      history: savedHistory ? JSON.parse(savedHistory) : [],
      totalCoins: SafeInt(savedCoins, 0),
      currentRound: SafeInt(savedRound, 1),
      currentThemeId: savedTheme || 'emerald',
      unlockedThemeIds: savedUnlocked ? JSON.parse(savedUnlocked) : ['emerald']
    }));
    
    // Pass false to not increment round on first load
    startNewGame(false);
  }, []);

  const currentTheme = useMemo(() => 
    THEMES.find(t => t.id === state.currentThemeId) || THEMES[0]
  , [state.currentThemeId]);

  const collectRewardAutomatically = useCallback((amount: number) => {
    if (amount <= 0) return;

    // Wait slightly for modal to stabilize
    setTimeout(() => {
      const sourceRect = rewardSourceRef.current?.getBoundingClientRect();
      const destRect = modalCoinTargetRef.current?.getBoundingClientRect();

      const startX = sourceRect ? sourceRect.left + sourceRect.width / 2 : window.innerWidth / 2;
      const startY = sourceRect ? sourceRect.top + sourceRect.height / 2 : window.innerHeight / 2;
      
      const targetX = destRect ? destRect.left + 20 : (window.innerWidth - 60);
      const targetY = destRect ? destRect.top + 20 : 50;

      const coinCount = 10;
      const portion = Math.floor(amount / coinCount);
      const remainder = amount % coinCount;

      const newFlyingCoins = Array.from({ length: coinCount }).map((_, i) => ({
        id: Date.now() + i,
        x: startX,
        y: startY,
        targetX,
        targetY,
        offsetX: (Math.random() - 0.5) * 40,
        offsetY: (Math.random() - 0.5) * 40
      }));

      // Show coins flying
      setState(prev => ({ ...prev, flyingCoins: newFlyingCoins }));

      // Each coin lands and transfers from pending to total
      newFlyingCoins.forEach((_, index) => {
        const landingDelay = index * 120; // Slightly slower staggered entry

        setTimeout(() => {
          setIsBankHitting(true);
          setTimeout(() => setIsBankHitting(false), 100);
          
          setState(prev => {
            const isLast = index === newFlyingCoins.length - 1;
            const coinValue = portion + (isLast ? remainder : 0);
            
            const newTotal = prev.totalCoins + coinValue;
            const newPending = Math.max(0, prev.pendingReward - coinValue);
            
            if (isLast) {
              localStorage.setItem(COINS_KEY, newTotal.toString());
            }

            return {
              ...prev,
              totalCoins: newTotal,
              pendingReward: newPending,
              flyingCoins: prev.flyingCoins.filter(c => c.id !== newFlyingCoins[index].id)
            };
          });
          sounds.playSelect(); 
        }, landingDelay + 1100); // 1.1s travel duration (slower)
      });
    }, 50);
  }, []);

  const handleThemeSelect = (theme: AppTheme) => {
    const isUnlocked = state.unlockedThemeIds.includes(theme.id);
    
    if (isUnlocked) {
      localStorage.setItem(STORAGE_KEYS.THEME, theme.id);
      setState(prev => ({ ...prev, currentThemeId: theme.id }));
      sounds.playSelect();
    } else {
      // Try to purchase
      if (state.totalCoins >= theme.price) {
        sounds.playBuy();
        const newTotal = state.totalCoins - theme.price;
        const newUnlocked = [...state.unlockedThemeIds, theme.id];
        
        localStorage.setItem(STORAGE_KEYS.COINS, newTotal.toString());
        localStorage.setItem(STORAGE_KEYS.UNLOCKED_THEMES, JSON.stringify(newUnlocked));
        localStorage.setItem(STORAGE_KEYS.THEME, theme.id);
        
        setState(prev => ({ 
          ...prev, 
          totalCoins: newTotal, 
          unlockedThemeIds: newUnlocked,
          currentThemeId: theme.id
        }));
      } else {
        sounds.playWrong();
      }
    }
  };

  const startNewGame = useCallback(async (isNextRound: any = false) => {
    const shouldIncrement = isNextRound === true;
    
    // Simply close and reset the board
    setState(prev => ({ ...prev, isWon: false }));
    initGame(shouldIncrement);
  }, []);

  const initGame = async (shouldIncrement: boolean) => {
    const nextRound = shouldIncrement ? state.currentRound + 1 : state.currentRound;
    
    // Persist next round if it changed
    if (shouldIncrement) {
      localStorage.setItem(ROUND_KEY, nextRound.toString());
    }

    setState(prev => ({ 
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
      currentRound: nextRound,
      pendingReward: 0
    }));
    
    const currentHistory = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const pairs = await generateWordPairs(currentHistory, nextRound);
    
    const newHistory = [...currentHistory, ...pairs].slice(-100);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));

    const gameCards: GameCard[] = [];
    pairs.forEach((pair, index) => {
      const pairId = `pair-${index}`;
      gameCards.push({ id: `${pairId}-en`, text: pair.english, type: 'english', pairId });
      gameCards.push({ id: `${pairId}-ur`, text: pair.urdu, type: 'urdu', pairId });
    });

    setState(prev => ({
      ...prev,
      isLoading: false,
      cards: gameCards.sort(() => Math.random() - 0.5),
      history: newHistory
    }));
    setScore(0);
  };

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
          const currentTotalScore = score + 10;
          const timeBonus = state.timeLeft * 2;
          const totalEarned = currentTotalScore + timeBonus;
          
          setState(prev => ({ 
            ...prev, 
            isWon: true,
            pendingReward: totalEarned
          }));
          
          // Use a shorter delay to start collection so the user sees it immediately
          setTimeout(() => {
            collectRewardAutomatically(totalEarned);
          }, 800); 

          confetti({
            particleCount: 200,
            spread: 80,
            origin: { y: 0.5 },
            colors: ['#D4AF37', '#006400', '#FDF5E6', '#FFD700']
          });
        } else {
          // Success burst for a single match
          confetti({
            particleCount: 30,
            spread: 40,
            origin: { x: 0.5, y: 0.5 },
            colors: ['#D4AF37', '#006400'],
            gravity: 1.5,
            ticks: 50
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
        }, 400);
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
          const currentTotalScore = score + gainedScore;
          const timeBonus = state.timeLeft * 2;
          const totalEarned = currentTotalScore + timeBonus;

          setState(prev => ({ 
            ...prev, 
            isWon: true,
            pendingReward: totalEarned
          }));

          // Trigger automatic collection after modal is fully open
          setTimeout(() => {
            collectRewardAutomatically(totalEarned);
          }, 800); 

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
    if (state.totalCoins >= 30 && !isBuying && (state.mistakes >= 3 || state.helpsUsed >= 3)) {
      setIsBuying(true);
      sounds.playBuy();
      const finalCoins = state.totalCoins - 30;
      
      localStorage.setItem(COINS_KEY, finalCoins.toString());
      setState(prev => ({
        ...prev,
        totalCoins: finalCoins,
        isLost: prev.timeLeft <= 0,
        mistakes: 0,
        helpsUsed: 0,
      }));
      
      setTimeout(() => setIsBuying(false), 500);
    }
  };

  const buyTimeOnly = () => {
    if (state.totalCoins >= 30 && !isBuying && state.timeLeft <= 0) {
      setIsBuying(true);
      sounds.playBuy();
      const finalCoins = state.totalCoins - 30;
      
      localStorage.setItem(COINS_KEY, finalCoins.toString());
      setState(prev => ({
        ...prev,
        totalCoins: finalCoins,
        isLost: prev.mistakes >= 3 || prev.helpsUsed >= 3,
        timeLeft: 60,
      }));
      
      setTimeout(() => setIsBuying(false), 500);
    }
  };

  return (
    <div 
      className="min-h-screen relative overflow-hidden flex flex-col items-center p-2 md:p-8 transition-colors duration-700"
      style={{ 
        backgroundColor: currentTheme.colors.background,
        backgroundImage: state.currentThemeId === 'onyx' 
          ? `radial-gradient(circle at 50% 50%, #222222 0%, ${currentTheme.colors.background} 100%)` 
          : 'none'
      }}
    >
      {/* Background Pattern and Liquid Effect */}
      <div 
        className="absolute inset-0 geometric-pattern pointer-events-none opacity-5 transition-opacity duration-700" 
        style={{ color: state.currentThemeId === 'onyx' ? '#D4AF37' : currentTheme.colors.primary }} 
      />
      {state.currentThemeId === 'onyx' && (
        <>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(212,175,55,0.2)_0%,transparent_50%)] pointer-events-none" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(212,175,55,0.1)_0%,transparent_50%)] pointer-events-none" />
          <div className="absolute inset-0 shadow-[inset_0_0_150px_rgba(0,0,0,0.8)] pointer-events-none" />
        </>
      )}
      <div 
        className="absolute inset-0 animate-pulse pointer-events-none opacity-30" 
        style={{ background: `linear-gradient(to bottom right, ${currentTheme.colors.background}, ${currentTheme.colors.secondary}20, ${currentTheme.colors.background})` }}
      />

      {/* Header */}
      <motion.header 
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 20 }}
        className="relative z-10 text-center mb-4 w-full px-4"
      >
        <AnimatePresence mode="wait">
          {state.isLoading ? (
            <motion.div 
              key="welcome"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="flex items-center justify-center gap-2 mb-2"
            >
              <Moon className="w-6 h-6" style={{ color: currentTheme.colors.secondary, fill: currentTheme.colors.secondary }} />
              <h1 className="text-3xl md:text-4xl font-bold" style={{ color: state.currentThemeId === 'onyx' ? currentTheme.colors.secondary : currentTheme.colors.primary }}>
                Welcome to Words Game
              </h1>
              <Star className="w-6 h-6" style={{ color: currentTheme.colors.secondary, fill: currentTheme.colors.secondary }} />
            </motion.div>
          ) : (
            <motion.div
              key="stats"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-wrap items-center justify-center gap-2 md:gap-4 mt-2"
            >
              <div 
                className="flex items-center gap-2 px-3 py-1 rounded-full border shadow-sm backdrop-blur-sm"
                style={{ 
                  backgroundColor: state.currentThemeId === 'onyx' ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.5)',
                  borderColor: `${currentTheme.colors.primary}30`
                }}
              >
                <span className="text-xs md:text-sm font-semibold" style={{ color: state.currentThemeId === 'onyx' ? currentTheme.colors.secondary : currentTheme.colors.primary }}>Round: {state.currentRound}</span>
              </div>

              <div 
                className="flex items-center gap-2 px-3 py-1 rounded-full border shadow-sm backdrop-blur-sm"
                style={{ 
                  backgroundColor: state.currentThemeId === 'onyx' ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.5)',
                  borderColor: `${currentTheme.colors.primary}30`
                }}
              >
                <span className="text-xs md:text-sm font-semibold" style={{ color: state.currentThemeId === 'onyx' ? currentTheme.colors.secondary : currentTheme.colors.primary }}>Score: </span>
                <SmoothNumber value={score} className="text-xs md:text-sm font-bold" style={{ color: state.currentThemeId === 'onyx' ? currentTheme.colors.secondary : currentTheme.colors.primary }} />
              </div>

              <div 
                className="flex items-center gap-2 px-3 py-1 rounded-full border shadow-sm transition-all duration-150 backdrop-blur-sm" 
                ref={coinTargetRef}
                style={{ 
                  backgroundColor: isBankHitting ? currentTheme.colors.secondary : (state.currentThemeId === 'onyx' ? 'rgba(255,255,255,0.05)' : `${currentTheme.colors.secondary}10`),
                  borderColor: isBankHitting ? currentTheme.colors.primary : (state.currentThemeId === 'onyx' ? `${currentTheme.colors.secondary}40` : `${currentTheme.colors.secondary}30`)
                }}
              >
                <Wallet className={`w-4 h-4 transition-transform ${isBankHitting ? '-rotate-12 scale-125' : 'scale-100'}`} style={{ color: state.currentThemeId === 'onyx' ? currentTheme.colors.secondary : currentTheme.colors.primary }} />
                <SmoothNumber value={state.totalCoins} className={`text-xs md:text-sm font-bold transition-colors ${isBankHitting ? 'text-white' : ''}`} style={{ color: isBankHitting ? 'white' : (state.currentThemeId === 'onyx' ? currentTheme.colors.secondary : currentTheme.colors.primary) }} />
              </div>

              <div 
                className={`flex items-center gap-2 px-3 py-1 rounded-full border shadow-sm transition-all duration-300 backdrop-blur-sm ${state.timeLeft <= 20 ? 'animate-pulse' : ''}`}
                style={{ 
                  backgroundColor: state.timeLeft <= 20 ? 'rgba(239,68,68,0.2)' : (state.currentThemeId === 'onyx' ? 'rgba(255,255,255,0.05)' : 'rgba(59,130,246,0.1)'),
                  borderColor: state.timeLeft <= 20 ? 'rgba(239,68,68,0.4)' : (state.currentThemeId === 'onyx' ? `${currentTheme.colors.secondary}40` : 'rgba(59,130,246,0.3)')
                }}
              >
                <Timer className={`w-4 h-4 ${state.timeLeft <= 20 ? 'text-red-600' : ''}`} style={{ color: state.timeLeft <= 20 ? undefined : (state.currentThemeId === 'onyx' ? currentTheme.colors.secondary : '#2563eb') }} />
                <span 
                  className="text-xs md:text-sm font-bold" 
                  style={{ color: state.timeLeft <= 20 ? '#dc2626' : (state.currentThemeId === 'onyx' ? currentTheme.colors.secondary : '#1d4ed8') }}
                >
                  {Math.floor(state.timeLeft / 60)}:{(state.timeLeft % 60).toString().padStart(2, '0')}
                </span>
              </div>

              <div 
                className="flex items-center gap-1 backdrop-blur-sm px-2 py-1 rounded-full border shadow-sm"
                style={{ 
                  backgroundColor: state.currentThemeId === 'onyx' ? 'rgba(255,255,255,0.05)' : 'rgba(254,242,242,0.5)', 
                  borderColor: state.currentThemeId === 'onyx' ? 'rgba(239,68,68,0.3)' : 'rgba(254,202,202,1)' 
                }}
              >
                {[...Array(3)].map((_, i) => (
                  <Heart 
                    key={i} 
                    className={`w-3 h-3 md:w-4 h-4 ${i < (3 - state.mistakes) ? 'text-red-500 fill-red-500' : (state.currentThemeId === 'onyx' ? 'text-red-900/40' : 'text-red-200')}`} 
                  />
                ))}
              </div>

              <div 
                className="flex items-center gap-1 backdrop-blur-sm px-2 py-1 rounded-full border shadow-sm"
                style={{ 
                  backgroundColor: state.currentThemeId === 'onyx' ? 'rgba(255,255,255,0.05)' : 'rgba(254,252,232,0.5)', 
                  borderColor: state.currentThemeId === 'onyx' ? 'rgba(234,179,8,0.3)' : 'rgba(254,240,138,1)' 
                }}
              >
                {[...Array(3)].map((_, i) => (
                  <Star 
                    key={i} 
                    className={`w-3 h-3 md:w-4 h-4 ${i < (3 - state.helpsUsed) ? 'text-yellow-500 fill-yellow-500' : (state.currentThemeId === 'onyx' ? 'text-yellow-900/40' : 'text-yellow-200')}`} 
                  />
                ))}
              </div>
              
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => startNewGame(false)}
                disabled={state.isLoading}
                className="h-8 text-xs hover:bg-opacity-10 backdrop-blur-sm"
                style={{ 
                  color: state.currentThemeId === 'onyx' ? currentTheme.colors.secondary : currentTheme.colors.primary, 
                  borderColor: state.currentThemeId === 'onyx' ? `${currentTheme.colors.secondary}50` : `${currentTheme.colors.primary}50`,
                  backgroundColor: state.currentThemeId === 'onyx' ? 'rgba(255,255,255,0.05)' : `${currentTheme.colors.primary}05`
                }}
              >
                <RefreshCw className={`w-3 h-3 mr-1 ${state.isLoading ? 'animate-spin' : ''}`} />
                New Game
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleAutoMatch}
                disabled={state.isLoading || state.matchedPairIds.length === 10}
                className="h-8 italic text-xs hover:bg-opacity-10 backdrop-blur-sm"
                style={{ 
                  color: state.currentThemeId === 'onyx' ? currentTheme.colors.secondary : currentTheme.colors.primary, 
                  borderColor: state.currentThemeId === 'onyx' ? `${currentTheme.colors.secondary}40` : `${currentTheme.colors.primary}40`,
                  backgroundColor: state.currentThemeId === 'onyx' ? 'rgba(255,255,255,0.05)' : `${currentTheme.colors.primary}05`
                }}
              >
                <HelpCircle className="w-3 h-3 mr-1" />
                Help
              </Button>

              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => setIsThemeOpen(true)}
                className="h-8 w-8 rounded-full hover:bg-opacity-10 backdrop-blur-sm"
                style={{ 
                  color: state.currentThemeId === 'onyx' ? currentTheme.colors.secondary : currentTheme.colors.secondary, 
                  borderColor: state.currentThemeId === 'onyx' ? `${currentTheme.colors.secondary}80` : currentTheme.colors.secondary,
                  backgroundColor: state.currentThemeId === 'onyx' ? 'rgba(255,255,255,0.05)' : 'transparent'
                }}
              >
                <Palette className="w-4 h-4" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
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
                    initial={{ scale: 0, opacity: 0, rotateY: 90 }}
                    animate={{ 
                      scale: isHint ? [1, 1.05, 1] : 1,
                      opacity: 1,
                      rotateY: 0,
                      x: isShaking ? [0, -6, 6, -6, 6, -3, 3, 0] : 0,
                      rotate: isShaking ? [0, -1, 1, -1, 1, 0] : 0,
                    }}
                    transition={{
                      scale: isHint ? { repeat: Infinity, duration: 1 } : { duration: 0.15, ease: 'easeOut' },
                      rotateY: { duration: 0.2, ease: 'easeOut' },
                      x: isShaking ? { duration: 0.4, ease: 'linear' } : { duration: 0.1 },
                      rotate: isShaking ? { duration: 0.4, ease: 'linear' } : { duration: 0.1 }
                    }}
                    exit={{ scale: 0, opacity: 0, rotate: 10, filter: 'blur(5px)' }}
                    whileHover={!isShaking ? { scale: 1.03, y: -2 } : {}}
                    whileTap={!isShaking ? { scale: 0.97 } : {}}
                  >
                    <Card
                      onClick={() => handleCardClick(card)}
                      style={{ 
                        borderColor: isShaking ? '#ef4444' : isHint ? currentTheme.colors.secondary : isSelected ? currentTheme.colors.secondary : `${currentTheme.colors.primary}40`,
                        backgroundColor: isShaking ? '#fef2f2' : isHint ? `${currentTheme.colors.secondary}80` : isSelected ? (state.currentThemeId === 'onyx' ? '#2d2d2d' : `${currentTheme.colors.secondary}30`) : (state.currentThemeId === 'onyx' ? '#1e1e1e' : '#ffffff'),
                        boxShadow: state.currentThemeId === 'onyx' 
                          ? (isSelected ? `0 10px 20px -5px ${currentTheme.colors.secondary}40, inset 0 0 10px ${currentTheme.colors.secondary}20` : `0 4px 0 0 #000, 0 8px 15px -10px rgba(0,0,0,0.5)`)
                          : (isSelected ? `0 0 15px ${currentTheme.colors.secondary}40` : `0 2px 4px rgba(0,0,0,0.05)`),
                        transform: state.currentThemeId === 'onyx' && isSelected ? 'translateY(-2px)' : 'none'
                      }}
                      className={`
                        h-20 md:h-24 flex items-center justify-center p-2 md:p-3 cursor-pointer transition-all duration-300
                        border-[3px] text-center select-none overflow-hidden
                        ${isHint ? 'shadow-xl animate-pulse' : ''}
                        ${state.currentThemeId === 'onyx' ? 'premium-shine shadow-[0_10px_20px_rgba(0,0,0,0.4)]' : ''}
                        rounded-xl
                      `}
                    >
                      <span 
                        className={`
                          ${card.text.length > 20 ? 'text-[10px] md:text-xs' : card.text.length > 10 ? 'text-xs md:text-sm' : 'text-sm md:text-base'}
                          font-black leading-tight break-words drop-shadow-sm
                        `}
                        style={{ color: card.type === 'urdu' ? (state.currentThemeId === 'onyx' ? currentTheme.colors.secondary : currentTheme.colors.primary) : (state.currentThemeId === 'onyx' ? '#ffffff' : currentTheme.colors.text) }}
                      >
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
        <DialogContent className="sm:max-w-md bg-islamic-cream border-islamic-gold overflow-hidden">
          {/* Bank Branch Display in Modal */}
          <motion.div 
            initial={{ y: -20, opacity: 0 }}
            animate={{ 
              y: 0, 
              opacity: 1,
              scale: isBankHitting ? [1, 1.3, 1] : 1
            }}
            className="absolute top-4 right-4 flex items-center gap-2 px-4 py-2 rounded-full border shadow-lg z-50 transition-all duration-150"
            style={{ 
              backgroundColor: isBankHitting ? currentTheme.colors.secondary : `${currentTheme.colors.secondary}10`,
              borderColor: isBankHitting ? currentTheme.colors.primary : `${currentTheme.colors.secondary}30`
            }}
            ref={modalCoinTargetRef}
          >
            <Wallet className={`w-5 h-5 transition-transform duration-100 ${isBankHitting ? '-rotate-12 scale-125' : 'rotate-0 scale-100'}`} style={{ color: currentTheme.colors.primary }} />
            <SmoothNumber value={state.totalCoins} className={`text-sm font-black transition-colors ${isBankHitting ? 'text-amber-900' : 'text-amber-700'}`} style={{ color: currentTheme.colors.text }} />
            <span className="text-[10px] font-bold uppercase ml-1" style={{ color: currentTheme.colors.primary }}>Bank</span>
          </motion.div>
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center"
          >
            <div className="mx-auto w-16 h-16 bg-islamic-gold/20 rounded-full flex items-center justify-center mb-4 relative">
              <Trophy className="w-10 h-10 text-islamic-gold" />
              <motion.div 
                animate={{ scale: [1, 1.5, 1], opacity: [0, 1, 0] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="absolute inset-0 bg-islamic-gold rounded-full"
              />
            </div>
            <DialogTitle className="text-3xl font-extrabold arabic-text mb-2" style={{ color: state.currentThemeId === 'onyx' ? currentTheme.colors.secondary : currentTheme.colors.primary }}>
              ماشاءاللہ! آپ جیت گئے
            </DialogTitle>
            <DialogDescription className="text-lg font-medium opacity-80" style={{ color: currentTheme.colors.text }}>
              Round {state.currentRound} Complete!
            </DialogDescription>
          </motion.div>

          <div className="flex flex-col gap-2 py-4">
            <motion.div 
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="flex items-center justify-between p-3 bg-white/60 rounded-xl border"
              style={{ borderColor: `${currentTheme.colors.primary}20` }}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: `${currentTheme.colors.accent}20` }}>
                  <Star className="w-4 h-4" style={{ color: currentTheme.colors.primary, fill: currentTheme.colors.primary }} />
                </div>
                <span className="font-bold text-sm" style={{ color: currentTheme.colors.text }}>Match Score</span>
              </div>
              <span className="text-lg font-black" style={{ color: currentTheme.colors.primary }}>+{score}</span>
            </motion.div>

            <motion.div 
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="flex items-center justify-between p-3 bg-white/60 rounded-xl border"
              style={{ borderColor: `${currentTheme.colors.primary}20` }}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: `${currentTheme.colors.secondary}20` }}>
                  <Clock className="w-4 h-4" style={{ color: currentTheme.colors.secondary }} />
                </div>
                <span className="font-bold text-sm" style={{ color: currentTheme.colors.text }}>Time Bonus</span>
              </div>
              <span className="text-lg font-black" style={{ color: currentTheme.colors.secondary }}>+{state.timeLeft * 2}</span>
            </motion.div>

            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.25, type: 'spring', stiffness: 300 }}
              className="flex items-center justify-between p-4 rounded-xl border-2 shadow-inner"
              style={{ backgroundColor: `${currentTheme.colors.secondary}10`, borderColor: `${currentTheme.colors.secondary}30` }}
              ref={rewardSourceRef}
            >
              <div className="flex items-center gap-3">
                <Coins className="w-6 h-6 animate-bounce" style={{ color: currentTheme.colors.secondary, fill: currentTheme.colors.secondary }} />
                <span className="text-lg font-black" style={{ color: currentTheme.colors.primary }}>Total Reward</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-2xl font-black" style={{ color: currentTheme.colors.secondary }}>+<SmoothNumber value={state.pendingReward} /></span>
                <span className="text-[8px] font-bold uppercase tracking-tighter" style={{ color: currentTheme.colors.secondary }}>Gold Coins</span>
              </div>
            </motion.div>
          </div>

          <DialogFooter className="sm:justify-center">
            <Button 
              onClick={() => startNewGame(true)}
              className="w-full text-white px-8 py-8 text-xl font-bold rounded-2xl shadow-xl group border-2"
              style={{ 
                backgroundColor: state.currentThemeId === 'onyx' ? currentTheme.colors.secondary : currentTheme.colors.primary,
                borderColor: state.currentThemeId === 'onyx' ? '#ffffff40' : 'transparent',
                color: state.currentThemeId === 'onyx' ? '#000000' : '#ffffff'
              }}
            >
              Next Round / اگلا راؤنڈ
              <RefreshCw className="w-5 h-5 ml-2 group-hover:rotate-180 transition-transform duration-500" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Theme Selector Modal */}
      <Dialog open={isThemeOpen} onOpenChange={setIsThemeOpen}>
          <DialogContent 
            className="sm:max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
            style={{ backgroundColor: currentTheme.colors.background, borderColor: currentTheme.colors.secondary }}
          >
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2" style={{ color: currentTheme.colors.primary }}>
              <Palette className="w-6 h-6" />
              Store / دکان
            </DialogTitle>
            <DialogDescription style={{ color: currentTheme.colors.text }}>
              Unlock beautiful themes for your game! / اپنی گیم کے لیے خوبصورت رنگوں کا انتخاب کریں۔
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-4 overflow-y-auto pr-2 pb-6 flex-1 theme-store-scrollbar">
            {THEMES.map((theme) => {
              const isUnlocked = state.unlockedThemeIds.includes(theme.id);
              const isSelected = state.currentThemeId === theme.id;
              
              return (
                <motion.div
                  key={theme.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleThemeSelect(theme)}
                  className={`relative p-1 rounded-2xl border-2 transition-all cursor-pointer overflow-hidden group ${
                    isSelected ? 'border-primary ring-2 ring-primary ring-offset-2' : isUnlocked ? 'border-transparent hover:border-gray-300' : 'border-gray-200 grayscale hover:grayscale-0'
                  }`}
                  style={{ borderColor: isSelected ? theme.colors.primary : 'transparent' }}
                >
                  <div 
                    className="h-28 w-full rounded-xl flex flex-col items-center justify-center gap-1 shadow-inner relative"
                    style={{ backgroundColor: theme.colors.background }}
                  >
                    {/* Small Color Boxes Preview */}
                    <div className="flex gap-1 mb-2">
                       <div className="w-4 h-4 rounded-full border border-white" style={{ backgroundColor: theme.colors.primary }} />
                       <div className="w-4 h-4 rounded-full border border-white" style={{ backgroundColor: theme.colors.secondary }} />
                    </div>

                    <span className="font-bold text-sm" style={{ color: theme.colors.text }}>{theme.name}</span>
                    <span className="text-xs arabic-text opacity-70" style={{ color: theme.colors.text }}>{theme.nameUrdu}</span>

                    {/* Status Overlays */}
                    {!isUnlocked && (
                      <div className="absolute inset-0 bg-black/60 backdrop-blur-[3px] flex flex-col items-center justify-center text-white border-4 border-white/10 group-hover:bg-black/50 transition-colors">
                        <motion.div
                          animate={{ scale: [1, 1.1, 1] }}
                          transition={{ repeat: Infinity, duration: 2 }}
                        >
                          <Lock className="w-8 h-8 mb-2 drop-shadow-lg" />
                        </motion.div>
                        <span className="text-xs font-black tracking-widest uppercase">{theme.price} Coins</span>
                        <span className="text-[10px] opacity-60 font-bold">2KG HEAVY LOCK</span>
                      </div>
                    )}

                    {isSelected && (
                      <div className="absolute top-2 right-2">
                        <CheckCircle2 className="w-5 h-5 text-green-500 fill-white" />
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>

          <DialogFooter className="sm:justify-center">
             <div className="flex items-center gap-2 bg-amber-500/10 px-4 py-2 rounded-full border border-amber-500/30">
                <Coins className="w-4 h-4 text-amber-600 fill-amber-600" />
                <span className="text-sm font-bold text-amber-700">Balance: {state.totalCoins}</span>
             </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={state.isLost} onOpenChange={(open) => !open && startNewGame()}>
        <DialogContent 
          className="sm:max-w-md overflow-hidden"
          style={{ backgroundColor: currentTheme.colors.background, borderColor: currentTheme.colors.secondary }}
        >
          {/* Bank Branch Display in Modal */}
          <div 
            className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1 rounded-full border shadow-sm z-50 transition-all"
            style={{ 
              backgroundColor: isBankHitting ? currentTheme.colors.secondary : `${currentTheme.colors.secondary}10`,
              borderColor: isBankHitting ? currentTheme.colors.primary : `${currentTheme.colors.secondary}30`
            }}
          >
            <Wallet className="w-4 h-4" style={{ color: currentTheme.colors.primary }} />
            <SmoothNumber value={state.totalCoins} className="text-xs font-bold" style={{ color: currentTheme.colors.text }} />
            <span className="text-[10px] font-bold uppercase ml-1" style={{ color: currentTheme.colors.primary }}>Bank</span>
          </div>

          <motion.div
            initial={{ scale: 0.8, y: 50, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={{ type: 'spring', damping: 15 }}
          >
            <DialogHeader className="text-center">
              <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <XCircle className="w-10 h-10 text-red-500" />
              </div>
              <DialogTitle className="text-2xl font-bold arabic-text" style={{ color: currentTheme.colors.primary }}>
                افسوس! آپ ہار گئے
              </DialogTitle>
              <DialogDescription className="text-lg opacity-70" style={{ color: currentTheme.colors.text }}>
                Oh no! You've used up your lives, help or time.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-3 py-4">
              <div 
                className="p-3 bg-white/80 rounded-xl border shadow-sm w-full text-center"
                style={{ borderColor: `${currentTheme.colors.primary}20` }}
              >
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Coins className="w-5 h-5" style={{ color: currentTheme.colors.secondary, fill: currentTheme.colors.secondary }} />
                  <SmoothNumber value={state.totalCoins} className="text-xl font-bold" style={{ color: currentTheme.colors.text }} />
                  <span className="text-xl font-bold" style={{ color: currentTheme.colors.text }}> Coins</span>
                </div>
                <p className="text-[10px] uppercase tracking-wider font-semibold opacity-60" style={{ color: currentTheme.colors.primary }}>Your Bank</p>
              </div>
              
              <div className={`grid ${ (state.timeLeft <= 0 && (state.mistakes >= 3 || state.helpsUsed >= 3)) ? 'grid-cols-2' : 'grid-cols-1'} gap-3 w-full`}>
                {(state.mistakes >= 3 || state.helpsUsed >= 3) && (
                  <Button 
                    onClick={buyHealthOnly}
                    disabled={state.totalCoins < 30 || isBuying}
                    className={`flex flex-col items-center gap-1 py-6 rounded-xl shadow-lg transition-all ${state.totalCoins >= 30 && !isBuying ? '' : 'bg-gray-200 text-gray-500 shadow-none'}`}
                    style={{ 
                      backgroundColor: state.totalCoins >= 30 && !isBuying ? (state.currentThemeId === 'onyx' ? currentTheme.colors.secondary : currentTheme.colors.primary) : undefined,
                      color: state.totalCoins >= 30 && !isBuying ? (state.currentThemeId === 'onyx' ? '#000000' : '#ffffff') : undefined
                    }}
                  >
                    <Heart className={`w-4 h-4 ${state.totalCoins >= 30 && !isBuying ? (state.currentThemeId === 'onyx' ? 'fill-black' : 'fill-white') : ''}`} />
                    <span className="font-bold text-[10px] uppercase tracking-tight">Restore Health</span>
                    <span className="text-[8px] opacity-80 italic">30 Coins</span>
                  </Button>
                )}

                {state.timeLeft <= 0 && (
                  <Button 
                    onClick={buyTimeOnly}
                    disabled={state.totalCoins < 30 || isBuying}
                    className={`flex flex-col items-center gap-1 py-6 rounded-xl shadow-lg transition-all ${state.totalCoins >= 30 && !isBuying ? '' : 'bg-gray-200 text-gray-500 shadow-none'}`}
                    style={{ 
                      backgroundColor: state.totalCoins >= 30 && !isBuying ? (state.currentThemeId === 'onyx' ? currentTheme.colors.secondary : currentTheme.colors.secondary) : undefined,
                      color: state.totalCoins >= 30 && !isBuying ? (state.currentThemeId === 'onyx' ? '#000000' : '#ffffff') : undefined
                    }}
                  >
                    <Timer className="w-4 h-4" />
                    <span className="font-bold text-[10px] uppercase tracking-tight">Add Extra Time</span>
                    <span className="text-[8px] opacity-80 italic">30 Coins</span>
                  </Button>
                )}
              </div>

              {state.totalCoins < 30 && (
                <p className="text-[10px] italic opacity-60" style={{ color: currentTheme.colors.primary }}>Need at least 30 coins to continue</p>
              )}
            </div>
            <DialogFooter className="sm:justify-center flex flex-col gap-2">
              <Button 
                onClick={() => startNewGame(false)}
                variant="outline"
                className="w-full py-6 text-lg rounded-xl transition-all active:scale-95 border-2"
                style={{ 
                  borderColor: state.currentThemeId === 'onyx' ? currentTheme.colors.secondary : `${currentTheme.colors.primary}40`, 
                  color: state.currentThemeId === 'onyx' ? currentTheme.colors.secondary : currentTheme.colors.primary 
                }}
              >
                Restart Round / دوبارہ آزمائیں
              </Button>
            </DialogFooter>
          </motion.div>
        </DialogContent>
      </Dialog>

      {/* Flying Coins Layer */}
      <AnimatePresence>
        {state.flyingCoins.map((coin, idx) => (
          <motion.div
            key={coin.id}
            initial={{ 
              x: coin.x, 
              y: coin.y, 
              scale: 0, 
              opacity: 0,
              rotate: 0
            }}
            animate={{ 
              x: [
                coin.x, 
                coin.x + (coin.offsetX || 0), 
                coin.targetX || 0
              ],
              y: [
                coin.y, 
                coin.y + (coin.offsetY || 0), 
                coin.targetY || 0
              ],
              scale: [0, 2.5, 1.2, 0],
              opacity: [0, 1, 1, 0],
              rotate: [0, 180, 540, 1080]
            }}
            transition={{ 
              duration: 1.1, 
              ease: "circOut",
              times: [0, 0.15, 0.7, 1] 
            }}
            className="fixed z-[9999] pointer-events-none"
          >
            <div className="relative">
              <Coins className="w-8 h-8 text-amber-500 fill-amber-500 drop-shadow-[0_0_15px_rgba(245,158,11,0.9)]" />
              <motion.div 
                animate={{ opacity: [1, 0], scale: [1, 2.5] }}
                transition={{ duration: 0.4 }}
                className="absolute inset-0 bg-amber-400 rounded-full blur-2xl"
              />
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Footer Decoration */}
      <footer className="mt-auto pt-12 pb-4 text-center opacity-40 flex items-center gap-4">
        <Sun className="w-4 h-4" />
        <span className="text-xs uppercase tracking-widest font-semibold">Islamic Learning Puzzle</span>
        <Sun className="w-4 h-4" />
      </footer>
    </div>
  );
}
