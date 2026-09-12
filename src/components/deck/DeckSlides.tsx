/** Shape of everything the projected composition needs, resolved server-side. */
export type DeckData = {
  name: string;
  stance: string;
  role: string;
  live: { label: string; href: string; since: string }[];
  s: Record<string, string>;
  facts: { value: string; label: string; note: string }[];
  systems: { title: string; note: string; stack: string; href: string }[];
  timeline: { year: string; title: string; note: string }[];
  range: { heading: string; items: string; lead: boolean }[];
  plates: { value: string; note: string }[];
  art: { id: string; title: string; artist: string; date: string; url: string }[];
  captions: string[];
  projects: { title: string; note: string; stack: string; scope: string; href: string }[];
  experience: { period: string; role: string; org: string; summary: string }[];
  principles: string[];
  email: string;
  github: string;
};
