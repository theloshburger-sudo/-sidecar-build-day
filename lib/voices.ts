/** Natural voices Teacher can speak with (ElevenLabs default voices). The server only accepts these ids. */
export const NATURAL_VOICES = [
  { id: "george", label: "George · warm", eleven: "JBFqnCBsd6RMkjVDRZzb" },
  { id: "brian", label: "Brian · deep", eleven: "nPczCjzI2devNBz1zQrb" },
  { id: "jessica", label: "Jessica · upbeat", eleven: "cgSgspJ2msm6clMCkdW9" },
  { id: "charlie", label: "Charlie · casual", eleven: "IKne3meq5aSn9XLyUdCD" },
  { id: "alice", label: "Alice · clear", eleven: "Xb7hH8MSUJpSbSDYk0k2" },
] as const;

export const DEFAULT_VOICE = "george";

export function elevenVoiceId(id: string | undefined): string | null {
  return NATURAL_VOICES.find((v) => v.id === id)?.eleven ?? null;
}
