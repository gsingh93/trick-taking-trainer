export type PlayGate = {
  leadPromptActive: boolean;
  suitCountPromptActive: boolean;
  awaitContinue: boolean;
  handComplete: boolean;
  isViewingHistory: boolean;
  biddingActive: boolean;
  biddingComplete: boolean;
};

export function canPlayCard(args: PlayGate): boolean {
  return (
    !args.leadPromptActive &&
    !args.suitCountPromptActive &&
    !args.awaitContinue &&
    !args.handComplete &&
    !args.isViewingHistory &&
    (!args.biddingActive || args.biddingComplete)
  );
}

export type AdvanceGate = {
  awaitContinue: boolean;
  handComplete: boolean;
  isViewingHistory: boolean;
};

export function canAdvanceTrick(args: AdvanceGate): boolean {
  return args.awaitContinue && !args.handComplete && !args.isViewingHistory;
}
