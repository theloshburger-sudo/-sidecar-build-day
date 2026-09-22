"use client";

export type Mood = "idle" | "thinking" | "talking" | "happy" | "listening";

/** Teacher: a sleek, floating white robot with a glass visor and glowing eyes. Pure SVG + CSS. */
export default function Cloud({ mood = "idle", size = 72, className = "" }: { mood?: Mood; size?: number; className?: string }) {
  const eyeY = mood === "thinking" ? 33 : 36;
  return (
    <svg
      className={`cloud bot bot--${mood} ${className}`}
      width={size}
      height={size * 1.05}
      viewBox="0 0 100 105"
      role="img"
      aria-label={`Teacher the robot (${mood})`}
    >
      <defs>
        <radialGradient id="botShell" cx="0.35" cy="0.25" r="0.9">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.65" stopColor="#eef2f8" />
          <stop offset="1" stopColor="#c9d3e3" />
        </radialGradient>
        <radialGradient id="botVisor" cx="0.4" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#1b2230" />
          <stop offset="1" stopColor="#05070c" />
        </radialGradient>
        <filter id="botGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <ellipse className="bot-shadow" cx="50" cy="101" rx="16" ry="3" fill="#8fb8ff" opacity="0.35" />
      <g className="cloud-body">
        {/* body: smooth egg that tapers to a point */}
        <path d="M30 62 C30 54 70 54 70 62 C70 78 60 92 50 94 C40 92 30 78 30 62 Z" fill="url(#botShell)" stroke="#c3cee0" strokeWidth="1.2" />
        {/* chest light */}
        <circle className="bot-chest" cx="50" cy="70" r="2.6" fill="#5fd0ff" filter="url(#botGlow)" />
        {/* arms */}
        <path className="bot-arm-l" d="M27 60 C21 64 20 76 24 84 C27 85 30 80 30 72 Z" fill="url(#botShell)" stroke="#c3cee0" strokeWidth="1" />
        <path className="bot-arm-r" d="M73 60 C79 64 80 76 76 84 C73 85 70 80 70 72 Z" fill="url(#botShell)" stroke="#c3cee0" strokeWidth="1" />
        {/* head */}
        <ellipse cx="50" cy="34" rx="30" ry="25" fill="url(#botShell)" stroke="#c3cee0" strokeWidth="1.2" />
        <ellipse cx="50" cy="37" rx="23" ry="15" fill="url(#botVisor)" />
        <ellipse cx="42" cy="29" rx="8" ry="2.4" fill="#ffffff" opacity="0.12" />
        {/* eyes */}
        <g className="bot-eyes" fill="none" stroke="#4fc3ff" strokeWidth="3.4" strokeLinecap="round" filter="url(#botGlow)">
          {mood === "happy" ? (
            <>
              <path d="M36 39 q5 -6 10 0" />
              <path d="M54 39 q5 -6 10 0" />
            </>
          ) : mood === "listening" ? (
            <>
              <ellipse cx="41" cy="37" rx="4" ry="4.4" fill="#4fc3ff" stroke="none" />
              <ellipse cx="59" cy="37" rx="4" ry="4.4" fill="#4fc3ff" stroke="none" />
            </>
          ) : (
            <>
              <path className="bot-eye" d={`M35 ${eyeY} q6 3 11 1`} />
              <path className="bot-eye" d={`M54 ${eyeY + 1} q5 2 11 -1`} />
            </>
          )}
        </g>
      </g>
      {mood === "thinking" && (
        <g className="cloud-dots" fill="#4fc3ff">
          <circle cx="84" cy="14" r="2.8" />
          <circle cx="91" cy="8" r="2.1" />
          <circle cx="97" cy="3" r="1.5" />
        </g>
      )}
      {mood === "listening" && (
        <g className="cloud-waves" stroke="#4fc3ff" strokeWidth="2.2" fill="none" strokeLinecap="round">
          <path d="M86 30 q5 6 0 12" />
          <path d="M92 26 q8 10 0 20" />
        </g>
      )}
    </svg>
  );
}
