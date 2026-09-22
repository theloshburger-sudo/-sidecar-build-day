import { Sora, Patrick_Hand } from "next/font/google";

export const uiFont = Sora({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
export const handFont = Patrick_Hand({ weight: "400", subsets: ["latin"], variable: "--font-hand", display: "block" });
