export function withSentBackLast<T extends { id: string }>(
  deck: readonly T[],
  sentBackIds: readonly string[],
): T[] {
  const staying = deck.filter((task) => !sentBackIds.includes(task.id));
  const leaving = sentBackIds.flatMap((id) => deck.filter((task) => task.id === id));
  return [...staying, ...leaving];
}
