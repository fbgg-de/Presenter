import { useWsCompanionCommands } from '@/hooks/useWsCompanionCommands';
import { useBroadcastCompanionState } from '@/hooks/useBroadcastCompanionState';

/**
 * Hosts the Companion bridge, like `StageEngineHost` and `PresentationSyncHost`: the state it
 * publishes follows every playback (four times a second while a video plays), the master speed,
 * the stage and the readiness checks. Called from MainPage itself, each of those re-rendered the
 * whole operator view — a master speed change blocked the page for up to 0.8 s. As a leaf it
 * re-renders this null component only.
 */
const CompanionHost = () => {
  useWsCompanionCommands();
  useBroadcastCompanionState();
  return null;
};

export default CompanionHost;
