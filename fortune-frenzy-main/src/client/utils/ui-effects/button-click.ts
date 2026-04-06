import { RunService, SoundService } from "@rbxts/services";

const STUDIO_FALLBACK_SOUND = "rbxasset://sounds/electronicpingshort.wav";
const MUTE_UI_SOUNDS = true;

export default function (id = "rbxassetid://91461852737624", volume = 0.3) {
	if (MUTE_UI_SOUNDS) return;

	const isAssetId = id.sub(1, 13) === "rbxassetid://";
	const soundId = RunService.IsStudio() && isAssetId ? STUDIO_FALLBACK_SOUND : id;
	let sound = script.FindFirstChild(`${soundId}-${volume}`) as Sound | undefined;

	if (!sound) {
		sound = new Instance("Sound");
		sound.SoundId = soundId;
		sound.Parent = script;
		sound.Volume = volume;
		sound.Name = `${soundId}-${volume}`;
	}

	SoundService.PlayLocalSound(sound);
}
