const PATHS = {
  userCheck: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M17 11l2 2 4-4',
  shieldCheck: 'M12 3l8 3v6c0 4.8-3.4 8.4-8 9-4.6-.6-8-4.2-8-9V6l8-3z M9 12l2 2 4-4',
  heartPulse: 'M20.8 8.5c0 5-8.8 10.5-8.8 10.5S3.2 13.5 3.2 8.5a4.7 4.7 0 0 1 8.8-2.3A4.7 4.7 0 0 1 20.8 8.5z M3 11h3.5l1.5-3 2 5 1.5-2.5h9',
  brainPulse: 'M9 4a4 4 0 0 0-4 4c-1.4.4-2 1.7-2 3s.7 2.7 2 3v1a4 4 0 0 0 4 4 M9 4a4 4 0 0 1 4-1 M13 3c2 0 4 1.5 4 4 1.4.4 2 1.7 2 3s-.7 2.7-2 3v1a4 4 0 0 1-4 4 M9 4v15 M2.5 11H6l1.3-2.6L9 12l1.3-2 .9 1h5.3',
  siren: 'M5 20h14 M7 20v-6a5 5 0 0 1 10 0v6 M12 4.5V2.5 M5.6 7L4.2 5.6 M18.4 7l1.4-1.4 M9.5 14.5a2.5 2.5 0 0 1 2.5-2.5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3.5 2',
  checkCircle: 'M21 12a9 9 0 1 1-5.3-8.2 M22 4L12 14.5l-3-3',
  activity: 'M22 12h-4l-3 8-6-16-3 8H2',
  lock: 'M5 10.5h14a1 1 0 0 1 1 1v8.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8.5a1 1 0 0 1 1-1z M8 10.5V7a4 4 0 0 1 8 0v3.5 M12 15v2.5',
  stethoscope: 'M6 3v5.5a4 4 0 0 0 8 0V3 M6 3H4.2 M14 3h1.8 M10 12.5v1.5a5 5 0 0 0 10 0v-1.2 M20 8.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  sun: 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z M12 2.5v2 M12 19.5v2 M4.6 4.6l1.4 1.4 M18 18l1.4 1.4 M2.5 12h2 M19.5 12h2 M4.6 19.4l1.4-1.4 M18 6l1.4-1.4',
  moon: 'M20.5 14.8A8.6 8.6 0 0 1 9.2 3.5a8.6 8.6 0 1 0 11.3 11.3z',
  hospital: 'M4 21V8.5L12 3l8 5.5V21 M9.5 21v-5.5h5V21 M12 7.5v4 M10 9.5h4 M2.5 21h19',
  close: 'M6.5 6.5l11 11 M17.5 6.5l-11 11',
  menu: 'M4 7h16 M4 12h16 M4 17h16',
  pill: 'M16.5 3.4a5.1 5.1 0 0 1 0 7.2l-5.9 5.9a5.1 5.1 0 1 1-7.2-7.2l5.9-5.9a5.1 5.1 0 0 1 7.2 0z M6.8 6.8l7.2 7.2',
  chevron: 'M6.5 9.5l5.5 5.5 5.5-5.5',
  alert: 'M12 3.6 2.7 20h18.6L12 3.6z M12 10v4.2 M12 17.2v.6',
  plus: 'M12 5v14 M5 12h14',
  package: 'M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z M4 7.5l8 4.5 8-4.5 M12 12v9',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M20 20l-4-4',
  home: 'M3.5 10.5L12 3.5l8.5 7 M5.5 9v11h13V9 M10 20v-6h4v6',
  droplet: 'M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5z',
  cross: 'M9.5 3.5h5v6h6v5h-6v6h-5v-6h-6v-5h6z',
  receipt: 'M6 2.5h12v19l-2.5-1.8L13 21.5l-2-1.8-2 1.8-2.5-1.8L6 21.5z M9 7.5h6 M9 11h6 M9 14.5h4',
  snow: 'M12 2.5v19 M4 7l16 10 M20 7L4 17 M9.5 4.5L12 7l2.5-2.5 M9.5 19.5L12 17l2.5 2.5',
  ban: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M5.6 5.6l12.8 12.8',
  layers: 'M12 3l9 5-9 5-9-5 9-5z M3 13l9 5 9-5 M3 17.5l9 5 9-5',
  clipboard: 'M9 4h6v3H9z M9 5.5H6.5A1.5 1.5 0 0 0 5 7v12.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V7a1.5 1.5 0 0 0-1.5-1.5H15 M8.5 12h7 M8.5 16h4.5',
  pause: 'M8.5 5v14 M15.5 5v14',
  grid: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  edit: 'M4 20h4.5L19 9.5a2.1 2.1 0 0 0-3-3L5.5 17V20z M14.5 6.5l3 3',
  download: 'M12 3.5v11 M7.5 10l4.5 4.5 4.5-4.5 M4.5 15.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3',
  phone: 'M8 2.5h8a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 20V4A1.5 1.5 0 0 1 8 2.5z M11 18.5h2',
  card: 'M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 17V7A1.5 1.5 0 0 1 4 5.5z M2.5 10h19 M6 14.5h4',
  wallet: 'M4.5 7h15a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z M4.5 7l11-3.5V7 M16 13.5h1.5',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  chart: 'M4 20h16 M7 16v-5 M12 16V6 M17 16v-8',
  users: 'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20 M10 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7 M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.4 M15 4.6a3.5 3.5 0 0 1 0 6.8',
  factory: 'M3 21V10l5 3v-3l5 3v-3l5 3V4h3v17z M7 17h2 M12 17h2 M17 17h1',
  badge: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z M12 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5 M7.5 17a4.5 4.5 0 0 1 9 0',
  mic: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z M5.5 11a6.5 6.5 0 0 0 13 0 M12 17.5V21 M8.5 21h7',
  sliders: 'M4 6h9 M17 6h3 M15 4v4 M4 12h3 M11 12h9 M9 10v4 M4 18h11 M19 18h1 M17 16v4',
} satisfies Record<string, string>;

/** Line icons drawn from single SVG path strings; `name` must be one of PATHS. */
export function Icon({
  name,
  size = 18,
  strokeWidth = 2,
}: {
  name: keyof typeof PATHS;
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name].split(' M').map((d, i) => (
        <path key={i} d={i === 0 ? d : 'M' + d} />
      ))}
    </svg>
  );
}
