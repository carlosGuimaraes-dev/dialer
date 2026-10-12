import { useEffect, useRef } from "react";
import { useMusicPlayer } from "@/domains/music/player";

/**
 * Live bars of the song that is playing, drawn from the player's analyser.
 * When the music stops the bars settle to a flat line.
 */
export function Waveform({ height = 32, bars = 40 }: { height?: number; bars?: number }) {
  const { analyser, playing } = useMusicPlayer();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const data = new Uint8Array(analyser?.frequencyBinCount ?? 64);
    const levels = new Float32Array(bars);
    let frame = 0;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      if (analyser && playing) analyser.getByteFrequencyData(data);
      // The top of the spectrum is near silent in music, so spread bars over the lower 70%.
      const usable = Math.floor(data.length * 0.7);
      const gap = 2;
      const barWidth = Math.max(1, (width - gap * (bars - 1)) / bars);
      ctx.fillStyle = getComputedStyle(canvas).color;
      let moving = false;
      for (let i = 0; i < bars; i++) {
        const target = analyser && playing ? data[Math.floor((i / bars) * usable)] / 255 : 0;
        levels[i] += (target - levels[i]) * 0.35;
        if (levels[i] > 0.01) moving = true;
        const h = Math.max(2, levels[i] * height);
        ctx.fillRect(i * (barWidth + gap), (height - h) / 2, barWidth, h);
      }
      if (playing || moving) frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [analyser, playing, bars, height]);

  return <canvas ref={canvasRef} style={{ height }} className="w-full block text-[var(--ods-brand-500)]" aria-hidden="true" />;
}
