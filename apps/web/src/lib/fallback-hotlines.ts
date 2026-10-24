import type { Hotline } from "@mindease/shared";

/** Shown whenever live hotlines can't be loaded: emergency info must never disappear. */
export const FALLBACK_HOTLINES: Hotline[] = [
  {
    id: "fallback-999",
    name: "National Emergency Service",
    number: "999",
    description: "Police, fire and ambulance. Call if you or someone else is in immediate danger.",
    availability: "24/7, free",
  },
  {
    id: "fallback-mindease",
    name: "MindEase Emergency Service",
    number: "01568978234",
    description: "Talk to the MindEase crisis support team if you are struggling and need help now.",
    availability: "24/7, free",
  },
];
