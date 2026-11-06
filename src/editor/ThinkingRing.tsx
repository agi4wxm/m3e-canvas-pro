import { motion, useReducedMotion } from "motion/react";
import { BEZEL, frameLengthOf, frameSizeOf, type Frame, type Palette } from "@/lib/tokens";

/** While the model works on a screen, the scheme's colors drift through its bezel. */
export function ThinkingRing({ p, frame }: { p: Palette; frame: Frame }) {
  const still = useReducedMotion();
  const w = frameSizeOf(frame).w + BEZEL * 2;
  const h = frameLengthOf(frame) + BEZEL * 2;
  const d = Math.ceil(Math.hypot(w, h)) + 80;
  const stops = [p.primary, p.tertiaryContainer, p.inversePrimary, p.secondaryContainer, p.primaryContainer, p.primary];
  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6, ease: [0.2, 0, 0, 1] }}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      <motion.div
        animate={still ? undefined : { rotate: 360 }}
        transition={{ repeat: Infinity, duration: 3.2, ease: "linear" }}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: d,
          height: d,
          marginLeft: -d / 2,
          marginTop: -d / 2,
          background: `conic-gradient(from 0deg, ${stops.join(", ")})`,
          filter: "blur(22px)",
        }}
      />
    </motion.div>
  );
}
