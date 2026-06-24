export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("zh-CN");
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

export function wordCount(text: string): number {
  return text.length;
}
