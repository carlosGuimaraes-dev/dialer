import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/domains/api/client";
import { describeError } from "@/domains/feedback/describeError";
import { Button } from "@/domains/ui/button";
import { inputClass } from "@/domains/ui/input";
import { AudioLines, Music, Pause, Play, Plus, Search, SkipBack, SkipForward, Trash2 } from "@/domains/ui/icons";
import { useMusicPlayer, type MusicTrack } from "@/domains/music/player";
import { Waveform } from "./waveform";

const clock = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function Artwork({ track, size = "w-10 h-10" }: { track: MusicTrack | null; size?: string }) {
  return track?.imageUrl ? (
    <img src={track.imageUrl} alt="" className={`${size} shrink-0 rounded-md object-cover bg-[var(--ods-bg-tertiary)]`} />
  ) : (
    <span className={`${size} shrink-0 rounded-md bg-[var(--ods-bg-tertiary)] text-[var(--ods-text-tertiary)] flex items-center justify-center`}>
      <Music className="w-3.5 h-3.5" />
    </span>
  );
}

/** Play / pause / skip, and the song's progress. */
export function NowPlaying({ compact = false }: { compact?: boolean }) {
  const m = useMusicPlayer();
  if (!m.current) return null;
  const length = m.duration || (m.current.durationMs ?? 0) / 1000;
  return (
    <div className={compact ? "px-3 py-2 border-t border-[var(--ods-border)]" : "p-3 border-b border-[var(--ods-border)]"}>
      <div className="flex items-center gap-2.5">
        <Artwork track={m.current} size={compact ? "w-8 h-8" : "w-12 h-12"} />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium truncate">{m.current.title}</div>
          <div className="text-[12px] text-[var(--ods-text-tertiary)] truncate">
            {m.pausedForCall ? "Paused while you talk, plays again after the call" : m.loading ? "Loading..." : m.current.artist}
          </div>
        </div>
        {!compact && <Button variant="ghost" size="sm" icon={SkipBack} onClick={m.previous} aria-label="Previous song" title="Previous song" />}
        <Button
          variant="ghost"
          size="sm"
          icon={m.playing ? Pause : Play}
          onClick={m.toggle}
          disabled={m.loading}
          aria-label={m.playing ? "Pause music" : "Play music"}
          title={m.playing ? "Pause" : "Play"}
        />
        <Button variant="ghost" size="sm" icon={SkipForward} onClick={m.next} aria-label="Next song" title="Next song" />
      </div>
      <div className={compact ? "mt-1.5" : "mt-2"}>
        <Waveform height={compact ? 18 : 36} bars={compact ? 48 : 40} />
      </div>
      {!compact && (
        <>
          <div className="mt-2 flex items-center gap-2 text-[12px] tabular-nums text-[var(--ods-text-tertiary)]">
            <span>{clock(m.position)}</span>
            <input
              type="range"
              min={0}
              max={Math.max(1, Math.floor(length))}
              value={Math.floor(m.position)}
              onChange={(e) => m.seek(Number(e.target.value))}
              aria-label="Position in the song"
              className="flex-1 accent-[var(--ods-brand-500)]"
            />
            <span>{clock(length)}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[var(--ods-text-tertiary)]">
            <AudioLines className="w-3.5 h-3.5" />
            <input
              type="range"
              min={0}
              max={100}
              value={m.volume}
              onChange={(e) => m.setVolume(Number(e.target.value))}
              aria-label="Music volume"
              className="flex-1 accent-[var(--ods-brand-500)]"
            />
            <span className="w-8 text-right text-[12px] tabular-nums">{m.volume}%</span>
          </div>
        </>
      )}
      {m.error && <p className="mt-1.5 text-[12px] text-red-600">{m.error}</p>}
    </div>
  );
}

function TrackRow({ track, active, actions }: { track: MusicTrack; active: boolean; actions: React.ReactNode }) {
  const m = useMusicPlayer();
  return (
    <div className="group flex items-center gap-2.5 px-3 py-1.5 hover:bg-[var(--ods-hover)]">
      <button onClick={() => m.play(track)} className="flex-1 min-w-0 flex items-center gap-2.5 text-left" title="Play now">
        <Artwork track={track} size="w-8 h-8" />
        <span className="min-w-0">
          <span className={`block text-[13px] truncate ${active ? "font-semibold text-[var(--ods-brand-600)]" : "font-medium"}`} aria-current={active ? "true" : undefined}>
            {track.title}
          </span>
          <span className="block text-[12px] text-[var(--ods-text-tertiary)] truncate">
            {track.artist}
            {track.durationMs ? ` · ${clock(track.durationMs / 1000)}` : ""}
          </span>
        </span>
      </button>
      {actions}
    </div>
  );
}

/**
 * The dock's Music tab: search SoundCloud, play or queue a song, and keep the
 * queue between sessions. Music pauses by itself while a call is on.
 */
export function MusicTab() {
  const m = useMusicPlayer();
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 400);
    return () => clearTimeout(t);
  }, [q]);
  const search = useQuery({
    queryKey: ["music-search", term],
    queryFn: () => api.music.search(term),
    enabled: term.length > 1,
    staleTime: 5 * 60_000,
  });
  const results = search.data?.tracks ?? [];

  return (
    <div className="flex flex-col">
      <NowPlaying />
      <div className="p-3 pb-1">
        <label className="relative block">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ods-text-tertiary)]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search SoundCloud" aria-label="Search SoundCloud" className={`${inputClass} pl-8`} />
        </label>
      </div>
      {term.length > 1 ? (
        <div className="py-1">
          <div className="px-3 py-1 text-[12px] font-semibold text-[var(--ods-text-secondary)]">Results</div>
          {search.isLoading && <p className="px-3 py-2 text-[13px] text-[var(--ods-text-tertiary)]">Searching...</p>}
          {search.error && <p className="px-3 py-2 text-[13px] text-red-600">{(search.error as Error).message || describeError(search.error).detail}</p>}
          {!search.isLoading && !search.error && !results.length && <p className="px-3 py-2 text-[13px] text-[var(--ods-text-tertiary)]">Nothing found for "{term}".</p>}
          {results.map((t) => {
            const queued = m.queue.some((x) => x.id === t.id);
            return (
              <TrackRow
                key={t.id}
                track={t}
                active={m.current?.id === t.id}
                actions={
                  <Button variant="ghost" size="sm" icon={Plus} disabled={queued} onClick={() => m.enqueue(t)} aria-label={queued ? "In the queue" : "Add to queue"} title={queued ? "In the queue" : "Add to queue"} />
                }
              />
            );
          })}
        </div>
      ) : null}
      <div className="py-1">
        <div className="px-3 py-1 text-[12px] font-semibold text-[var(--ods-text-secondary)]">Queue{m.queue.length ? ` (${m.queue.length})` : ""}</div>
        {!m.queue.length && <p className="px-3 py-2 text-[13px] text-[var(--ods-text-tertiary)]">Search for a song or artist, then press + to queue it or click it to play.</p>}
        {m.queue.map((t) => (
          <TrackRow
            key={t.id}
            track={t}
            active={m.current?.id === t.id}
            actions={
              <Button
                variant="ghost"
                size="sm"
                icon={Trash2}
                onClick={() => m.remove(t.id)}
                aria-label="Remove from queue"
                title="Remove from queue"
                className="opacity-0 group-hover:opacity-100 focus:opacity-100"
              />
            }
          />
        ))}
      </div>
    </div>
  );
}
