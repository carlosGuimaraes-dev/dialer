import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type Hls from "hls.js";
import { api } from "@/domains/api/client";
import { usePersistedState } from "@/domains/app/persistedState";
import { useDialer } from "@/domains/dialer/provider";

/** A SoundCloud track, as /api/music/search returns it. */
export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  imageUrl: string | null;
  durationMs: number | null;
  streamId: string;
  trackAuthorization: string | null;
}

interface MusicPlayerValue {
  queue: MusicTrack[];
  current: MusicTrack | null;
  playing: boolean;
  loading: boolean;
  /** Paused because a call connected; it plays again when the call is over. */
  pausedForCall: boolean;
  /** Live frequency data of what is playing, for the waveform; null until the first play. */
  analyser: AnalyserNode | null;
  error: string | null;
  position: number;
  duration: number;
  volume: number;
  setVolume: (volume: number) => void;
  play: (track: MusicTrack) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  enqueue: (track: MusicTrack) => void;
  remove: (id: string) => void;
}

const MusicPlayerContext = createContext<MusicPlayerValue | null>(null);

export function useMusicPlayer(): MusicPlayerValue {
  const ctx = useContext(MusicPlayerContext);
  if (!ctx) throw new Error("useMusicPlayer must be used inside MusicPlayerProvider");
  return ctx;
}

/**
 * A call silences the music only once someone answers: it keeps playing
 * while the dialer connects and rings, and comes back when the call ends.
 */
const CONNECTED_STATES = new Set(["active", "on_hold"]);

/**
 * Background music for the dock, after the CbamReady power dialer's player:
 * SoundCloud streams resolved on demand, played in one hidden <audio>
 * (hls.js when SoundCloud only offers HLS), paused once a call connects and
 * resumed when it ends. The queue and volume live in this browser.
 * The audio runs through a Web Audio analyser so the dock can draw it.
 */
export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  const { state: callState } = useDialer();
  const [queue, setQueue] = usePersistedState<MusicTrack[]>("music-queue", []);
  const [currentId, setCurrentId] = usePersistedState<string | null>("music-current", null);
  const [volume, setVolume] = usePersistedState<number>("music-volume", 40);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pausedForCall, setPausedForCall] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const requestRef = useRef(0);
  /** The track whose stream is loaded in the <audio>, so resume does not reload it. */
  const loadedRef = useRef<string | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  /** Route the <audio> through an analyser once; browsers allow it only after a click. */
  const ensureAnalyser = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audioCtxRef.current) {
      void audioCtxRef.current.resume();
      return;
    }
    try {
      const ctx = new AudioContext();
      const node = ctx.createAnalyser();
      node.fftSize = 128;
      node.smoothingTimeConstant = 0.8;
      ctx.createMediaElementSource(audio).connect(node);
      node.connect(ctx.destination);
      audioCtxRef.current = ctx;
      setAnalyser(node);
    } catch {
      // No Web Audio: the music still plays, just without a waveform.
    }
  }, []);

  const current = useMemo(() => queue.find((t) => t.id === currentId) ?? null, [queue, currentId]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = Math.max(0, Math.min(1, volume / 100));
  }, [volume]);

  useEffect(() => () => hlsRef.current?.destroy(), []);

  const stop = useCallback(() => {
    requestRef.current++;
    hlsRef.current?.destroy();
    hlsRef.current = null;
    loadedRef.current = null;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    setPlaying(false);
    setLoading(false);
    setPosition(0);
    setDuration(0);
  }, []);

  const play = useCallback(
    async (track: MusicTrack) => {
      const audio = audioRef.current;
      if (!audio) return;
      const request = ++requestRef.current;
      setQueue((q) => (q.some((t) => t.id === track.id) ? q : [...q, track]));
      setCurrentId(track.id);
      setError(null);
      setPausedForCall(false);
      setLoading(true);
      ensureAnalyser();
      hlsRef.current?.destroy();
      hlsRef.current = null;
      try {
        // SoundCloud stream URLs expire within minutes, so each play asks for a fresh one.
        const { url, hls } = await api.music.stream(track.streamId, track.trackAuthorization);
        if (request !== requestRef.current) return;
        if (hls && !audio.canPlayType("application/vnd.apple.mpegurl")) {
          const { default: HlsJs } = await import("hls.js");
          if (request !== requestRef.current) return;
          const player = new HlsJs();
          hlsRef.current = player;
          player.loadSource(url);
          player.attachMedia(audio);
        } else {
          audio.src = url;
        }
        loadedRef.current = track.id;
        await audio.play();
        if (request !== requestRef.current) return;
        setPlaying(true);
      } catch (err: any) {
        if (request !== requestRef.current) return;
        setPlaying(false);
        setError(err?.message ?? "This track would not play. Try another.");
      } finally {
        if (request === requestRef.current) setLoading(false);
      }
    },
    [setQueue, setCurrentId, ensureAnalyser],
  );

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    setPausedForCall(false);
    ensureAnalyser();
    if (loadedRef.current === current.id && audio.currentTime > 0) {
      audio.play().then(() => setPlaying(true), () => void play(current));
    } else {
      void play(current);
    }
  }, [current, playing, play, ensureAnalyser]);

  const step = useCallback(
    (by: 1 | -1) => {
      if (!queue.length) return;
      const at = queue.findIndex((t) => t.id === currentId);
      const target = queue[(at + by + queue.length) % queue.length];
      if (target) void play(target);
    },
    [queue, currentId, play],
  );

  const remove = useCallback(
    (id: string) => {
      if (id === currentId) {
        stop();
        setCurrentId(null);
      }
      setQueue((q) => q.filter((t) => t.id !== id));
    },
    [currentId, stop, setQueue, setCurrentId],
  );

  const enqueue = useCallback((track: MusicTrack) => setQueue((q) => (q.some((t) => t.id === track.id) ? q : [...q, track])), [setQueue]);

  // Calls come first: pause when one starts, pick the song back up after.
  // Only the moment a call starts or ends acts, so pressing play mid-call still works.
  const inCall = CONNECTED_STATES.has(callState);
  const wasInCall = useRef(inCall);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || wasInCall.current === inCall) return;
    wasInCall.current = inCall;
    if (inCall && !audio.paused) {
      audio.pause();
      setPlaying(false);
      setPausedForCall(true);
    } else if (!inCall && pausedForCall) {
      setPausedForCall(false);
      audio.play().then(() => setPlaying(true), () => setError("Press play to pick the music back up."));
    }
  }, [inCall, pausedForCall]);

  const value = useMemo<MusicPlayerValue>(
    () => ({
      queue,
      current,
      playing,
      loading,
      pausedForCall,
      analyser,
      error,
      position,
      duration,
      volume,
      setVolume,
      play: (t) => void play(t),
      toggle,
      next: () => step(1),
      previous: () => step(-1),
      seek: (s) => {
        if (audioRef.current) audioRef.current.currentTime = Math.max(0, s);
      },
      enqueue,
      remove,
    }),
    [queue, current, playing, loading, pausedForCall, analyser, error, position, duration, volume, setVolume, play, toggle, step, enqueue, remove],
  );

  return (
    <MusicPlayerContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        className="hidden"
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime || 0)}
        onLoadedMetadata={(e) => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
        onEnded={() => (queue.length > 1 ? step(1) : setPlaying(false))}
        onError={() => {
          if (loadedRef.current) setError("The stream stopped. Press play to load it again.");
          loadedRef.current = null;
          setPlaying(false);
        }}
      />
    </MusicPlayerContext.Provider>
  );
}
