import { toast } from "sonner";

const CONFETTI_TOKENS = ["--status-passed", "--status-retest", "--status-failed", "--primary"];

/** Resolves CSS colour tokens (oklch etc.) to hex, which is all canvas-confetti understands. */
function tokenColors(): string[] {
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  const styles = getComputedStyle(document.documentElement);
  return CONFETTI_TOKENS.flatMap((token) => {
    const value = styles.getPropertyValue(token).trim();
    if (!value) return [];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return [`#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`];
  });
}

/** Small reward when the last story of an epic passes: a confetti burst and a toast with `message`. */
export function celebrate(message: string): void {
  toast.success(message);
  void import("canvas-confetti")
    .then(({ default: confetti }) => {
      const colors = tokenColors();
      void confetti({
        particleCount: 120,
        spread: 80,
        startVelocity: 40,
        origin: { y: 0.7 },
        zIndex: 100,
        disableForReducedMotion: true,
        ...(colors.length > 0 ? { colors } : {}),
      });
    })
    .catch(() => {
      // Confetti is decoration; the toast already said it.
    });
}
