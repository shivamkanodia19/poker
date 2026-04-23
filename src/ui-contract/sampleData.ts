import type { GameSnapshot } from "./types.js";
import {
  bustedPlayer,
  flopFacingBet,
  handComplete,
  playerSittingOut,
  preflopFacingCall,
  privatePlayerSnapshot,
  river,
  showdown,
  turnAllIn,
  waiting
} from "./fixtures.js";

export const sampleSnapshots: Record<
  | "waiting"
  | "preflopFacingCall"
  | "flopFacingBet"
  | "turnAllIn"
  | "river"
  | "showdown"
  | "handComplete"
  | "playerSittingOut"
  | "bustedPlayer",
  GameSnapshot
> = {
  waiting,
  preflopFacingCall,
  flopFacingBet,
  turnAllIn,
  river,
  showdown,
  handComplete,
  playerSittingOut,
  bustedPlayer
};

export const samplePrivateSnapshot = privatePlayerSnapshot;
