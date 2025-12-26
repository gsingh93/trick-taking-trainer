export type Suit = "S" | "H" | "D" | "C";
export const SUITS: Suit[] = ["S", "H", "D", "C"];

export type Opp = "Left" | "Across" | "Right";
export const OPPONENTS: Opp[] = ["Left", "Across", "Right"];

export type Seat = Opp | "Me";
export const SEATS: Seat[] = ["Left", "Across", "Right", "Me"];

export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14; // 11=J,12=Q,13=K,14=A

export type CardT = { suit: Suit; rank: Rank; id: string };

export type Hands = Record<Seat, CardT[]>;

export type PlayT = { seat: Seat; card: CardT };

export type TrumpConfig = {
  enabled: boolean;
  suit: Suit;
  mustBreak: boolean;
};
