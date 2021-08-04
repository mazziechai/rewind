import { action, autorun, makeObservable, observable, runInAction, toJS } from "mobx";
import { ReplayStore } from "./ReplayStore";
import { BlueprintStore } from "./BlueprintStore";
import {
  Beatmap,
  Blueprint,
  BucketedReplayStateTimeMachine,
  buildBeatmap,
  HitObjectJudgement,
  NoteLockStyle,
  OsuClassicMods,
  ReplayAnalysisEvent,
  ReplayStateTimeMachine,
  retrieveEvents,
} from "@rewind/osu/core";
import { hitWindowsForOD } from "@rewind/osu/math";
import { OsuReplay } from "../managers/ReplayManager";
import { RenderSettings } from "./RenderSettings";
import { GameClock } from "../clocks/GameClock";
import { ReplayViewerContext } from "../containers/ReplayViewerContext";
import { Skin } from "../skins/Skin";
import { defaultViewSettings } from "../ViewSettings";

/**
 * The scenario determines the input of what should be rendered on the stage.
 */
export class Scenario {
  state: string;
  // showFlashlight: boolean; soon^TM

  blueprint?: Blueprint;
  replay?: OsuReplay;
  beatmap?: Beatmap;
  replayEvents: ReplayAnalysisEvent[] = [];

  // NOT OBSERVABLE
  replayStateTimeMachine?: ReplayStateTimeMachine;
  replayViewerContext: ReplayViewerContext;

  constructor(
    private readonly blueprintStore: BlueprintStore,
    private readonly replayStore: ReplayStore,
    private readonly renderSettings: RenderSettings,
    private readonly gameClock: GameClock,
  ) {
    // makeAutoObservable(this);
    makeObservable(this, {
      loadScenario: action,
      state: observable,
      replay: observable,
      blueprint: observable,
      beatmap: observable,
      replayEvents: observable,
      // replayStateTimeMachine intentionally not observable (too many calls)
    });

    this.replayViewerContext = {
      view: defaultViewSettings(),
      beatmap: Beatmap.EMPTY_BEATMAP,
      skin: Skin.EMPTY,
      judgements: [],
    } as ReplayViewerContext;

    autorun(() => {
      this.replayViewerContext.view = toJS(renderSettings.viewSettings);
      this.replayViewerContext.skin = toJS(renderSettings.skin);
    });
    autorun(() => {
      // Basically toJS gives a deep clone without observations
      this.replayViewerContext.replay = toJS(this.replay);
      this.replayViewerContext.blueprint = toJS(this.blueprint);
      this.replayViewerContext.beatmap = toJS(this.beatmap ?? Beatmap.EMPTY_BEATMAP);
      // TODO: This should not be observable
      this.replayViewerContext.judgements = toJS(this.replayEvents).filter(
        (f) => f.type === "HitObjectJudgement",
      ) as HitObjectJudgement[];
      console.log("judgements : " + this.replayViewerContext.judgements.length);
      this.replayViewerContext.replayTimeMachine = this.replayStateTimeMachine;
    });

    this.state = "NONE_LOADED";
  }

  setState(s: string) {
    this.state = s;
  }

  async loadScenario(blueprintId: string, replayId?: string) {
    console.log("API loading started");
    this.setState("Loading from API...");
    [this.blueprint, this.replay] = await Promise.all([
      this.blueprintStore.loadBlueprint(blueprintId),
      replayId ? this.replayStore.loadReplay(replayId) : undefined,
    ]);
    console.log("API loading done");

    runInAction(() => {
      if (!this.blueprint) {
        console.error("Blueprint not loaded properly.");
        this.state = "ERROR";
        return;
      }
      // TODO: depending on replay
      const mods: OsuClassicMods[] = [];
      // TODO: Depending on replay we gonna turn on / off by default
      const modHidden = false;
      this.renderSettings.viewSettings.modHidden = modHidden;

      this.gameClock.seekTo(0);
      this.gameClock.pause();

      this.setState("Building beatmap...");
      this.beatmap = buildBeatmap(this.blueprint, { addStacking: true, mods });
      if (this.replay) {
        console.log("Replay frames number: " + this.replay.frames.length + " started calculating events...");
        this.setState("Calculating replay events");
        this.replayStateTimeMachine = new BucketedReplayStateTimeMachine(
          this.replay.frames,
          this.beatmap,
          {
            hitWindows: hitWindowsForOD(this.beatmap.difficulty.overallDifficulty),
            noteLockStyle: NoteLockStyle.STABLE,
          },
          1000,
        );
        // This implicitly also calculates all states for each bucket
        const finalState = this.replayStateTimeMachine.replayStateAt(1e9);
        this.replayEvents = retrieveEvents(finalState, this.beatmap.hitObjects);
        this.setState("Done calculating events");
      }
      console.log("Loaded blue print", blueprintId, replayId);
    });
  }
}
