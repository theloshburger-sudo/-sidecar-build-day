"use client";

export type Mood = "idle" | "thinking" | "talking" | "happy" | "listening";

/** Teacher: a friendly cloud. Pure SVG + CSS animation, no images. */
export default function Cloud({ mood = "idle", size = 72, className = "" }: { mood?: Mood; size?: number; className?: string }) {
  return (
    <svg
      className={`cloud cloud--${mood} ${className}`}
      width={size}
      height={size * 0.78}
      viewBox="0 0 120 94"
      role="img"
      aria-label={`Teacher the cloud (${mood})`}
    >
      <defs>
        <linearGradient id="cloudFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e3ecfb" />
        </linearGradient>
      </defs>
      <g className="cloud-body">
        <path
          d="M28 80h66a22 22 0 0 0 3-43.8A30 30 0 0 0 40.6 27 21 21 0 0 0 28 80z"
          fill="url(#cloudFill)"
          stroke="#b9cbee"
          strokeWidth="2.5"
        />
        {/* cheeks */}
        <ellipse cx="42" cy="62" rx="6" ry="3.6" fill="#ffc9c2" opacity="0.8" />
        <ellipse cx="82" cy="62" rx="6" ry="3.6" fill="#ffc9c2" opacity="0.8" />
        {/* eyes */}
        <g className="cloud-eyes">
          {mood === "happy" ? (
            <>
              <path d="M45 53q4-5 8 0" stroke="#1f2d3a" strokeWidth="3" fill="none" strokeLinecap="round" />
              <path d="M71 53q4-5 8 0" stroke="#1f2d3a" strokeWidth="3" fill="none" strokeLinecap="round" />
            </>
          ) : (
            <>
              <ellipse className="cloud-eye" cx={mood === "thinking" ? 51 : 49} cy={mood === "thinking" ? 49 : 52} rx="3.6" ry="4.4" fill="#1f2d3a" />
              <ellipse className="cloud-eye" cx={mood === "thinking" ? 77 : 75} cy={mood === "thinking" ? 49 : 52} rx="3.6" ry="4.4" fill="#1f2d3a" />
            </>
          )}
        </g>
        {/* mouth */}
        {mood === "talking" ? (
          <ellipse className="cloud-mouth-talk" cx="62" cy="64" rx="5" ry="3.6" fill="#1f2d3a" />
        ) : mood === "thinking" ? (
          <path d="M57 65h10" stroke="#1f2d3a" strokeWidth="2.6" strokeLinecap="round" />
        ) : mood === "listening" ? (
          <circle cx="62" cy="64" r="3" fill="#1f2d3a" />
        ) : (
          <path d="M55 62q7 6 14 0" stroke="#1f2d3a" strokeWidth="2.8" fill="none" strokeLinecap="round" />
        )}
      </g>
      {mood === "thinking" && (
        <g className="cloud-dots" fill="#7a8fb8">
          <circle cx="98" cy="18" r="3.4" />
          <circle cx="108" cy="10" r="2.6" />
          <circle cx="115" cy="3" r="1.8" />
        </g>
      )}
      {mood === "listening" && (
        <g className="cloud-waves" stroke="#2f5bd3" strokeWidth="2.4" fill="none" strokeLinecap="round">
          <path d="M104 44q5 6 0 12" />
          <path d="M110 40q8 10 0 20" />
        </g>
      )}
    </svg>
  );
}
