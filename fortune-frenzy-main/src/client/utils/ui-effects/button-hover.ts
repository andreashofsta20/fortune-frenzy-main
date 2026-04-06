import { RunService, SoundService } from "@rbxts/services";

const STUDIO_FALLBACK_SOUND = "rbxasset://sounds/electronicpingshort.wav";
const MUTE_UI_SOUNDS = true;

export default function (id = "rbxassetid://118947276036921") {
	if (MUTE_UI_SOUNDS) return;

	const isAssetId = id.sub(1, 13) === "rbxassetid://";
	const soundId = RunService.IsStudio() && isAssetId ? STUDIO_FALLBACK_SOUND : id;
	let sound = script.FindFirstChild(soundId) as Sound | undefined;

	if (!sound) {
		sound = new Instance("Sound");
		sound.SoundId = soundId;
		sound.Parent = script;
		sound.Volume = 0.1;
		sound.Name = soundId;
	}

	SoundService.PlayLocalSound(sound);
}
