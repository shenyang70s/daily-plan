const paths = {
  today: 'M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  inbox: 'M4 4h16l2 11v5H2v-5L4 4zm-2 11h6l2 3h4l2-3h6',
  tasks: 'm3 6 2 2 4-4M12 6h9M3 13h3m6 0h9M3 20h3m6 0h9',
  calendar: 'M4 5h16v16H4V5zm4-3v6m8-6v6M4 11h16',
  submissions: 'M5 3h10l4 4v14H5V3zm10 0v5h4M8 12h8m-8 4h6',
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
