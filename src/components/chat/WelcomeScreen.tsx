import { motion } from 'framer-motion';
import { Sparkles, Zap, Globe, Shield, Rocket } from 'lucide-react';

interface WelcomeScreenProps {
  modelName?: string;
  onSuggestionClick: (suggestion: string) => void;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    }
  }
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: {
      duration: 0.6,
      ease: [0.23, 1, 0.32, 1]
    }
  }
} as const;

export default function WelcomeScreen({ onSuggestionClick ,
  modelName = "AI"
}: WelcomeScreenProps) {
  return (
    <section 
      className="flex-1 flex items-center justify-center p-4 sm:p-6 md:p-8 min-h-[calc(100dvh-12rem)]"
      aria-label="Welcome to ${modelName}"
    >
      <motion.div 
        className="max-w-2xl w-full text-center"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Hero Section */}
        <motion.header variants={itemVariants} className="mb-8 sm:mb-10">
          {/* Stunning animated logo */}
          <motion.div 
            className="relative inline-flex items-center justify-center w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 mb-6"
          >
            {/* Multiple glow rings */}
            <motion.div
              className="absolute inset-0 rounded-3xl"
              style={{
                background: 'conic-gradient(from var(--angle), hsl(var(--primary) / 0.3), hsl(200 80% 50% / 0.3), hsl(280 70% 50% / 0.3), hsl(var(--primary) / 0.3))',
              }}
              animate={{
                '--angle': ['0deg', '360deg'],
                scale: [1, 1.1, 1],
              } as any}
              transition={{
                '--angle': { duration: 4, repeat: Infinity, ease: 'linear' },
                scale: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
              }}
            />
            
            <motion.div
              className="absolute inset-2 rounded-2xl bg-gradient-to-br from-primary/30 to-primary/10 blur-xl"
              animate={{
                opacity: [0.5, 0.8, 0.5],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
            
            {/* Main icon container */}
            <motion.div 
              className="relative w-full h-full rounded-3xl liquid-icon flex items-center justify-center backdrop-blur-xl overflow-hidden"
              whileHover={{ scale: 1.05, rotate: 5 }}
              transition={{ type: "spring", stiffness: 300 }}
              style={{
                boxShadow: '0 0 60px hsla(172, 66%, 50%, 0.25), inset 0 0 40px hsla(172, 66%, 50%, 0.1)'
              }}
            >
              {/* Inner rotating gradient */}
              <motion.div
                className="absolute inset-0"
                style={{
                  background: 'conic-gradient(from var(--angle), transparent, hsl(var(--primary) / 0.2), transparent)',
                }}
                animate={{ '--angle': ['0deg', '360deg'] } as any}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
              />
              <Sparkles className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 text-primary relative z-10" />
            </motion.div>
          </motion.div>
          
          <motion.h1 
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-display font-bold mb-4 sm:mb-6"
            variants={itemVariants}
          >
            <span className="gradient-text">{modelName}</span>
          </motion.h1>
          
          <motion.p 
            className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-md mx-auto leading-relaxed px-2"
            variants={itemVariants}
          >
            Your intelligent companion — powered by multi-model AI
          </motion.p>
        </motion.header>

        {/* Feature badges - Compact and elegant */}
        <motion.div 
          className="flex flex-wrap justify-center gap-2 sm:gap-3 mb-8 px-2"
          variants={itemVariants}
        >
          {[
            { icon: Zap, label: "Lightning Fast", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
            { icon: Globe, label: "Real-time Search", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
            { icon: Shield, label: "Secure & Private", color: "text-indigo-400", bg: "bg-indigo-500/10", border: "border-indigo-500/20" },
            { icon: Rocket, label: "Always Learning", color: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/20" },
          ].map((badge, index) => (
            <motion.div
              key={badge.label}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full ${badge.bg} border ${badge.border} backdrop-blur-sm shadow-sm liquid-surface`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5 + index * 0.05 }}
              whileHover={{ scale: 1.05, y: -2, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
            >
              <badge.icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${badge.color}`} />
              <span className="text-xs sm:text-sm text-foreground/80 font-medium">{badge.label}</span>
            </motion.div>
          ))}
        </motion.div>

        {/* Suggestion Cards */}
        <motion.div 
          className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-w-xl mx-auto px-4"
          variants={itemVariants}
        >
          {[
            { title: "Explain Quantum Physics", prompt: "Explain quantum computing in simple terms with a real-life analogy.", icon: "🧬", color: "from-teal-500/10 to-emerald-500/5", border: "hover:border-teal-500/30" },
            { title: "Generate Artwork", prompt: "Generate a futuristic neon cyberpunk city street at midnight, high resolution, detailed lighting", icon: "🎨", color: "from-pink-500/10 to-purple-500/5", border: "hover:border-pink-500/30" },
            { title: "Compare AI Models", prompt: "What are the core differences between GPT-4, Claude, and Gemini?", icon: "🧠", color: "from-blue-500/10 to-indigo-500/5", border: "hover:border-blue-500/30" },
            { title: "Write a Story", prompt: "Write a suspenseful sci-fi short story about a time traveller visiting the year 2099.", icon: "✏️", color: "from-amber-500/10 to-orange-500/5", border: "hover:border-amber-500/30" },
          ].map((item) => (
            <motion.button
              key={item.title}
              onClick={() => onSuggestionClick(item.prompt)}
              className={`flex flex-col items-start p-4 rounded-2xl ${item.border} text-left transition-all duration-300 backdrop-blur-md group relative overflow-hidden liquid-suggestion`}
              whileHover={{ y: -4, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className={`absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000`} />
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-lg">{item.icon}</span>
                <h3 className="font-semibold text-sm text-foreground/90 group-hover:text-primary transition-colors">{item.title}</h3>
              </div>
              <p className="text-xs text-muted-foreground/80 line-clamp-2 leading-relaxed">{item.prompt}</p>
            </motion.button>
          ))}
        </motion.div>

        {/* Call to action - Focus on input */}
        <motion.div
          className="mt-10"
          variants={itemVariants}
        >
          <motion.div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/20 backdrop-blur-sm liquid-surface"
            animate={{
              boxShadow: ['0 0 20px hsla(172, 66%, 50%, 0.05)', '0 0 40px hsla(172, 66%, 50%, 0.15)', '0 0 20px hsla(172, 66%, 50%, 0.05)'],
            }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <motion.div
              className="w-2 h-2 rounded-full bg-primary"
              animate={{ scale: [1, 1.3, 1], opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
            <span className="text-xs sm:text-sm text-primary font-semibold">Multi-model AI · online</span>
          </motion.div>
        </motion.div>
      </motion.div>
    </section>
  );
}
