import { useMemo } from "react"

const COLORS = [
  "rgba(244,114,182,0.22)",  // pink (matches subtitle)
  "rgba(251,146,195,0.20)",  // light pink
  "rgba(59,130,246,0.18)",   // blue
  "rgba(20,184,166,0.16)",   // teal
  "rgba(168,85,247,0.16)",   // purple
  "rgba(251,191,36,0.14)",   // amber
]

interface Block {
  width: number
  height: number
  x: number
  y: number
  color: string
  duration: number
  delay: number
}

function seededRandom(seed: number) {
  return () => {
    seed = (seed * 16807 + 0) % 2147483647
    return (seed - 1) / 2147483646
  }
}

export function GlitchBackdrop() {
  const blocks = useMemo(() => {
    const rand = seededRandom(42)
    const items: Block[] = []
    for (let i = 0; i < 50; i++) {
      items.push({
        width: 20 + rand() * 80,
        height: 2 + rand() * 20,
        x: rand() * 100,
        y: rand() * 100,
        color: COLORS[Math.floor(rand() * COLORS.length)],
        duration: 4 + rand() * 8,
        delay: rand() * -12,
      })
    }
    return items
  }, [])

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <style>{`
        @keyframes glitch-drift {
          0%, 100% { transform: translateX(0) scaleX(1); opacity: 0.6; }
          25% { transform: translateX(12px) scaleX(1.3); opacity: 1; }
          50% { transform: translateX(-8px) scaleX(0.8); opacity: 0.3; }
          75% { transform: translateX(5px) scaleX(1.1); opacity: 0.8; }
        }
        @keyframes glitch-scan {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(600px); }
        }
      `}</style>

      {/* Scan line */}
      <div
        className="absolute left-0 right-0 h-px bg-primary/20"
        style={{
          animation: "glitch-scan 6s linear infinite",
        }}
      />

      {/* Glitch blocks */}
      {blocks.map((b, i) => (
        <div
          key={i}
          className="absolute rounded-sm"
          style={{
            width: b.width,
            height: b.height,
            left: `${b.x}%`,
            top: `${b.y}%`,
            backgroundColor: b.color,
            animation: `glitch-drift ${b.duration}s ease-in-out ${b.delay}s infinite`,
            willChange: "transform, opacity",
          }}
        />
      ))}
    </div>
  )
}
