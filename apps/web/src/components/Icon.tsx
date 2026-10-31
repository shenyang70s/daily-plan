const paths = {
  today: 'M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  inbox: 'M4 4h16l2 11v5H2v-5L4 4zm-2 11h6l2 3h4l2-3h6',
  tasks: 'm3 6 2 2 4-4M12 6h9M3 13h3m6 0h9M3 20h3m6 0h9',
  calendar: 'M4 5h16v16H4V5zm4-3v6m8-6v6M4 11h16',
  submissions: 'M8 3h8v7a4 4 0 0 1-8 0V3zm0 2H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4m-4 2v6m-4 1h8',
  atom: 'M21 12c0 2-4 4-9 4s-9-2-9-4 4-4 9-4 9 2 9 4ZM8 4c2-1 5 2 8 6s3 8 1 10-5-2-8-6S6 5 8 4Zm8 0c2 1 1 6-2 10s-6 7-8 6-1-6 2-10 6-7 8-6Z',
  folder: 'M3 6h7l2 2h9v12H3V6Z',
  spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z',
  plus: 'M12 5v14M5 12h14',
  check: 'm5 12 4 4L19 6',
  experiment: 'M9 3h6m-5 0v7l-5 10h14l-5-10V3M8 15h8',
  paper_reading: 'M12 5v16M3 4h5l4 2 4-2h5v15h-5l-4 2-4-2H3V4Z',
  learning: 'm2 9 10-5 10 5-10 5L2 9Zm4 2v6l6 3 6-3v-6',
  research: 'M3 6h7l2 2h9v12H3V6Z',
  meeting_prep: 'M4 5h16v16H4V5zm4-3v6m8-6v6M4 11h16',
  personal: 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm-7 18v-2a7 7 0 0 1 14 0v2',
  other: 'M4 6h16M4 12h16M4 18h16',
  grid: 'M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z',
  settings: 'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-7 0v6',
  search: 'M10 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm5 12 6 6',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  menu: 'M3 6h18M3 12h18M3 18h18',
  arrow: 'M5 12h14m-5-5 5 5-5 5',
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name }: { name: IconName }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
