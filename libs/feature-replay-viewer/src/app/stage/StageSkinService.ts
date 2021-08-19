import { Skin } from "./rewind/Skin";
import { injectable } from "inversify";

@injectable()
export class StageSkinService {
  private skin: Skin;

  constructor() {
    this.skin = Skin.EMPTY;
  }

  getSkin(): Skin {
    return this.skin;
  }

  setSkin(skin: Skin) {
    this.skin = skin;
  }
}