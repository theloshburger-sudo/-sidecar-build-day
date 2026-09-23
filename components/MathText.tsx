import { segments } from "@/lib/mathtext";

/** Text with real superscripts/subscripts (i¹⁴², x^2, H₂O). */
export default function MathText({ text }: { text: string }) {
  const segs = segments(text);
  if (segs.length === 1 && segs[0].k === "n") return <>{text}</>;
  return (
    <>
      {segs.map((s, i) => (s.k === "sup" ? <sup key={i}>{s.t}</sup> : s.k === "sub" ? <sub key={i}>{s.t}</sub> : <span key={i}>{s.t}</span>))}
    </>
  );
}
