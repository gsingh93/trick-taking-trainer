import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function HelpCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Help</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <div>
          The goal of this application is to build trick-taking skills: tracking voids, counting remaining cards in a suit,
          and judging whether your card can be beaten.
        </div>
        <div>
          The app has two AIs: Random and Bidding. The bidding AI is intentionally lightweight so you have
          opponents to practice against, and it is not intended to be realistic or challenging. Team bidding games are out
          of scope.
        </div>
        <div className="space-y-1">
          <div className="font-medium text-foreground">Difficulty ladder</div>
          <div>These options are ordered by difficulty. Start with the first and move down as you improve.</div>
          <ul className="list-disc space-y-1 pl-4">
            <li>
              Void tracking: after a player first plays off-suit, confirm who is void whenever that suit is led in the
              future. Set "Prompt after first void" to "Global" to make it harder. You can start by only tracking one suit
              and add more as you get better at this.
            </li>
            <li>
              Suit count prompt: after the first off-suit, estimate how many cards of the lead suit remain in other
              players' hands.
            </li>
            <li>
              Win intent prompt: when enabled and you play a card above the minimum rank, you choose if you intend to win.
              If yes, the app warns when your card can be beaten based on known information. You can still play it but the
              goal is to make sure you are aware of the risk.
            </li>
          </ul>
          <div>
            If you get stuck, you can reveal hands, enable open-hand verify, or use trick history to review or replay
            past tricks.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
