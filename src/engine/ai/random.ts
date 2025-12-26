export type RandomCard = { id: string };

export type AiDecision = { cardId: string } | null;
export type AiChooseCard = (hand: RandomCard[], legalIds: Set<string>, rng?: () => number) => AiDecision;

export function pickRandomLegalCard<T extends RandomCard>(
  hand: T[],
  legalIds: Set<string>,
  rng: () => number = Math.random
): T | null {
  if (!legalIds.size) return null;
  const ids = Array.from(legalIds);
  const pickId = ids[Math.floor(rng() * ids.length)];
  return hand.find((c) => c.id === pickId) ?? null;
}

export const chooseCardToPlay: AiChooseCard = (hand, legalIds, rng = Math.random) => {
  const card = pickRandomLegalCard(hand, legalIds, rng);
  return card ? { cardId: card.id } : null;
};
