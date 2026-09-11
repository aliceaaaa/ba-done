import { PRIORITY_MAX, type DeckPosition, type ScheduledTask } from './types';

export function toDeckPosition(task: ScheduledTask): DeckPosition {
  return task.placementType === 'ranked'
    ? { placementType: 'ranked', priority: task.priority, carryOverOrder: null }
    : { placementType: 'carryOver', priority: null, carryOverOrder: task.carryOverOrder };
}

function deckRank(position: DeckPosition): readonly [number, number] {
  return position.placementType === 'carryOver'
    ? [0, position.carryOverOrder]
    : [1, PRIORITY_MAX - position.priority];
}

export function compareDeckPositions(a: DeckPosition, b: DeckPosition): number {
  const [aGroup, aOrder] = deckRank(a);
  const [bGroup, bOrder] = deckRank(b);
  return aGroup - bGroup || aOrder - bOrder;
}
