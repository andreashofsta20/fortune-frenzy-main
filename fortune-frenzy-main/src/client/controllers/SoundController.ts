import { Controller } from "@flamework/core";
import { RunService, SoundService } from "@rbxts/services";

const STUDIO_FALLBACK_SOUND = "rbxasset://sounds/electronicpingshort.wav";

@Controller()
export class SoundController {
	private soundInstanceCache = new Map<string, Sound>();

	public PlaySound(soundId: string, category: "sfx" | "music", volume = 1) {
		// TODO: Add category support when settings are implemented
		const isAssetId = soundId.sub(1, 13) === "rbxassetid://";
		const resolvedSoundId = RunService.IsStudio() && isAssetId ? STUDIO_FALLBACK_SOUND : soundId;

		let sound = this.soundInstanceCache.get(resolvedSoundId);
		if (!sound) {
			sound = new Instance("Sound");
			sound.SoundId = resolvedSoundId;
			sound.Parent = SoundService;
			this.soundInstanceCache.set(resolvedSoundId, sound);
		}

		sound.Volume = volume;
		sound.TimePosition = 0;
		SoundService.PlayLocalSound(sound);
	}
}
