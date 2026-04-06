import { Controller, OnStart } from "@flamework/core";
import { UserInputService, Players, TweenService, Workspace } from "@rbxts/services";

@Controller()
export class KeybindController implements OnStart {
	private readonly NORMAL_WALK_SPEED = 16;
	private readonly RUN_WALK_SPEED = 26;
	private readonly NORMAL_FOV = 70;
	private readonly RUN_FOV = 80;
	private running = false;
	private moving = false;
	private currentFovTween?: Tween;

	private inputBeganKeybinds: Record<string, () => void> = {
		[Enum.KeyCode.LeftControl.Name]: () => this.handleRunning(true),
	};

	private inputEndedKeybinds: Record<string, () => void> = {
		[Enum.KeyCode.LeftControl.Name]: () => this.handleRunning(false),
	};

	onStart() {
		this.bindCharacter(Players.LocalPlayer.Character);
		Players.LocalPlayer.CharacterAdded.Connect((char) => this.bindCharacter(char));

		UserInputService.InputBegan.Connect((input, processed) => {
			if (processed) return;
			this.inputBeganKeybinds[input.KeyCode.Name]?.();
		});

		UserInputService.InputEnded.Connect((input, processed) => {
			if (processed) return;
			this.inputEndedKeybinds[input.KeyCode.Name]?.();
		});
	}

	// ----------------------------------------------------------------
	// CHARACTER & MOVEMENT
	// ----------------------------------------------------------------

	private bindCharacter(character?: Model) {
		if (!character) return;
		const humanoid = character.FindFirstChildOfClass("Humanoid");
		if (!humanoid) return;

		humanoid.Running.Connect((speed) => {
			const isMoving = speed > 0.1;
			if (this.moving !== isMoving) {
				this.moving = isMoving;
				this.updateFov();
			}
		});
	}

	// ----------------------------------------------------------------
	// FOV HANDLING
	// ----------------------------------------------------------------

	private updateFov() {
		const camera = Workspace.CurrentCamera;
		if (!camera) return;

		const targetFov = this.running && this.moving ? this.RUN_FOV : this.NORMAL_FOV;
		if (math.abs(camera.FieldOfView - targetFov) < 0.01) return;

		this.currentFovTween?.Cancel();
		const tweenInfo = new TweenInfo(0.3, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut);
		this.currentFovTween = TweenService.Create(camera, tweenInfo, { FieldOfView: targetFov });
		this.currentFovTween.Play();
	}

	// ----------------------------------------------------------------
	// PRIVATE METHODS
	// ----------------------------------------------------------------

	private handleRunning(enabled: boolean) {
		if (this.running === enabled) return;
		this.running = enabled;

		const humanoid = Players.LocalPlayer.Character?.FindFirstChildOfClass("Humanoid");
		if (humanoid) humanoid.WalkSpeed = enabled ? this.RUN_WALK_SPEED : this.NORMAL_WALK_SPEED;
		this.updateFov();
	}
}
