import { usePersistedState } from "@/domains/app/persistedState";
import { Globe, Music, type IconComponent } from "@/domains/ui/icons";

/** Features still being tried out. Each is off until someone turns it on in Settings > Experimental. */
export type ExperimentalFeature = "websitePreview" | "musicPlayer";

export const EXPERIMENTAL_FEATURES: { key: ExperimentalFeature; label: string; description: string; icon: IconComponent }[] = [
  {
    key: "websitePreview",
    label: "Website preview",
    description: "The Website and video panel on a seller lot's page: a preview of the offer page, its video, and texting the link.",
    icon: Globe,
  },
  {
    key: "musicPlayer",
    label: "Music player",
    description: "A Music tab in the dialer dock: search SoundCloud, queue songs and see a waveform. Music plays while a call rings and pauses when they answer.",
    icon: Music,
  },
];

/** Whether an experimental feature is on in this browser (off by default). */
export function useExperimental(feature: ExperimentalFeature): readonly [boolean, (on: boolean) => void] {
  return usePersistedState<boolean>(`experimental-${feature}`, false);
}
