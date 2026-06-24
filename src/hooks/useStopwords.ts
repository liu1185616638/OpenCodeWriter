import { useMemo } from "react";
import { STOPWORDS } from "@/lib/stopwords";

interface StopwordHit {
  word: string;
  count: number;
}

export function useStopwords(text: string): StopwordHit[] {
  return useMemo(() => {
    if (!text) return [];
    return STOPWORDS
      .map(word => {
        const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const matches = text.match(new RegExp(escaped, "g"));
        return { word, count: matches ? matches.length : 0 };
      })
      .filter(item => item.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [text]);
}
