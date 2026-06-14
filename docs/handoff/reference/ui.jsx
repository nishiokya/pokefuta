/* ui.jsx — shared primitives for the pokefuta photo-prompt explorations */

/* ---- Pokéball logo (simple, allowed: circles + line) ---- */
function Logo({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ flex: "0 0 auto" }}>
      <circle cx="20" cy="20" r="18" fill="#fff" stroke="#23211d" strokeWidth="2.5" />
      <path d="M2 20a18 18 0 0 1 36 0Z" fill="#e3493b" stroke="#23211d" strokeWidth="2.5" />
      <line x1="2" y1="20" x2="38" y2="20" stroke="#23211d" strokeWidth="2.5" />
      <circle cx="20" cy="20" r="6" fill="#fff" stroke="#23211d" strokeWidth="2.5" />
      <circle cx="20" cy="20" r="2.4" fill="#fff" stroke="#23211d" strokeWidth="2" />
    </svg>
  );
}

/* ---- icon set (stroke icons) ---- */
const I = {
  camera: (p) => (<svg viewBox="0 0 24 24" {...ip(p)}><path d="M3 8.5A1.5 1.5 0 0 1 4.5 7H7l1.2-1.8a1 1 0 0 1 .83-.45h5.94a1 1 0 0 1 .83.45L17 7h2.5A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z"/><circle cx="12" cy="13" r="3.4"/></svg>),
  search: (p) => (<svg viewBox="0 0 24 24" {...ip(p)}><circle cx="11" cy="11" r="6.5"/><line x1="16" y1="16" x2="21" y2="21"/></svg>),
  stamp: (p) => (<svg viewBox="0 0 24 24" {...ip(p)}><path d="M9 3.5h6a2 2 0 0 1 2 2.2l-.6 4.3a2 2 0 0 1-2 1.7H9.6a2 2 0 0 1-2-1.7L7 5.7a2 2 0 0 1 2-2.2Z"/><rect x="4.5" y="14.5" width="15" height="2.6" rx="1.3"/><line x1="4.5" y1="20.5" x2="19.5" y2="20.5"/></svg>),
  home: (p) => (<svg viewBox="0 0 24 24" {...ip(p)}><path d="M4 11 12 4l8 7"/><path d="M6 10v9.5h12V10"/></svg>),
  image: (p) => (<svg viewBox="0 0 24 24" {...ip(p)}><rect x="3.5" y="5" width="17" height="14" rx="2.2"/><circle cx="9" cy="10" r="1.8"/><path d="m5 17 4.5-4 3 2.5L16 12l3.5 3.5"/></svg>),
  pin: (p) => (<svg viewBox="0 0 24 24" {...ip(p)}><path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/></svg>),
  chev: (p) => (<svg viewBox="0 0 24 24" {...ip(p)}><path d="m9 6 6 6-6 6"/></svg>),
  spark: (p) => (<svg viewBox="0 0 24 24" {...ip(p)}><path d="M12 3.5c.6 4.4 2.1 5.9 6.5 6.5-4.4.6-5.9 2.1-6.5 6.5-.6-4.4-2.1-5.9-6.5-6.5 4.4-.6 5.9-2.1 6.5-6.5Z"/></svg>),
  trophy: (p) => (<svg viewBox="0 0 24 24" {...ip(p)}><path d="M7 4h10v4a5 5 0 0 1-10 0z"/><path d="M7 5H4.5v1.5A3 3 0 0 0 7 9.4M17 5h2.5v1.5A3 3 0 0 1 17 9.4"/><line x1="12" y1="13" x2="12" y2="16.5"/><path d="M8.5 20h7M9.5 16.5h5l.5 3.5h-6z"/></svg>),
  star: (p) => (<svg viewBox="0 0 24 24" {...ip(p)}><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/></svg>),
  bolt: (p) => (<svg viewBox="0 0 24 24" {...ip(p)}><path d="M13 3 5 13h6l-1 8 8-10h-6z"/></svg>),
  target: (p) => (<svg viewBox="0 0 24 24" {...ip(p)}><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.4"/></svg>),
  lock: (p) => (<svg viewBox="0 0 24 24" {...ip(p)}><rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>),
  route: (p) => (<svg viewBox="0 0 24 24" {...ip(p)}><circle cx="6" cy="6" r="2.3"/><circle cx="18" cy="18" r="2.3"/><path d="M6 8.3v4.2A3.5 3.5 0 0 0 9.5 16H14a3.5 3.5 0 0 0 0-7"/></svg>),
  flag: (p) => (<svg viewBox="0 0 24 24" {...ip(p)}><line x1="6" y1="3.5" x2="6" y2="21"/><path d="M6 4.5h11l-2.2 3.4L17 11.3H6z"/></svg>),
  users: (p) => (<svg viewBox="0 0 24 24" {...ip(p)}><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M16.5 14.4A5.5 5.5 0 0 1 20.5 19"/></svg>),
  clock: (p) => (<svg viewBox="0 0 24 24" {...ip(p)}><circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/></svg>),
  plus: (p) => (<svg viewBox="0 0 24 24" {...ip(p)}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>),
};
function ip(p = {}) {
  return {
    width: p.size || 18, height: p.size || 18,
    fill: "none", stroke: p.color || "currentColor",
    strokeWidth: p.sw || 2, strokeLinecap: "round", strokeLinejoin: "round",
    style: p.style,
  };
}

/* ---- mobile app frame ---- */
function App({ title, tab = "stamp", auth = "tako", children, bodyStyle, navTabs }) {
  return (
    <div className="app">
      <div className="app__bar">
        <Logo />
        <span className="ttl">{title}</span>
        <span className="spacer" />
        {auth === "tako"
          ? <span className="chip-mini"><span style={{ width: 14, height: 14, borderRadius: 99, background: "#dfe7f3", display: "grid", placeItems: "center", fontSize: 9 }}>👤</span>tako</span>
          : <span className="chip-mini" style={{ background: "var(--purple)", color: "#fff", border: "none", fontWeight: 700 }}>新規登録</span>}
      </div>
      <div className="app__body" style={bodyStyle}>{children}</div>
      <TabBar active={tab} items={navTabs} />
    </div>
  );
}

const NAV_DEFAULT = [
  { id: "search", label: "探す", ic: I.search },
  { id: "post", label: "投稿", ic: I.image },
  { id: "stamp", label: "スタンプ帳", ic: I.target },
];
const NAV_MYTRIP = [
  { id: "search", label: "探す", ic: I.search },
  { id: "stamp", label: "スタンプ帳", ic: I.target },
  { id: "mytrip", label: "マイ旅", ic: I.home },
];

function TabBar({ active, items }) {
  const tabs = items || NAV_DEFAULT;
  return (
    <div className="app__tab">
      {tabs.map((t) => (
        <div key={t.id} className={"t" + (active === t.id ? " on" : "")}>
          <span className="ic"><t.ic size={20} color={active === t.id ? "var(--purple)" : "var(--ink-faint)"} sw={2} /></span>
          {t.label}
        </div>
      ))}
    </div>
  );
}

/* ---- circular manhole placeholder (has a photo) ---- */
function Mh({ size = 54, label = "ポケふた" }) {
  return (
    <div className="mh" style={{ width: size, height: size }}>
      <span className="lbl">{label}</span>
    </div>
  );
}

/* ---- empty / zero-photo circular frame ---- */
function EmptyFrame({ size = 54, children }) {
  return (
    <div className="empty-frame" style={{ width: size, height: size }}>
      {children || <I.camera size={Math.round(size * 0.34)} color="#bcae8e" sw={1.8} />}
    </div>
  );
}

function Meter({ pct, color = "var(--terracotta)", track }) {
  return (
    <div className="meter" style={track ? { background: track } : undefined}>
      <span style={{ width: pct + "%", background: color }} />
    </div>
  );
}

function Pill({ kind = "peach", icon: Ic, children, style }) {
  return (
    <span className={"pill " + kind} style={style}>
      {Ic && <Ic size={12} sw={2.4} />}{children}
    </span>
  );
}

Object.assign(window, { Logo, I, App, TabBar, Mh, EmptyFrame, Meter, Pill, NAV_DEFAULT, NAV_MYTRIP });
