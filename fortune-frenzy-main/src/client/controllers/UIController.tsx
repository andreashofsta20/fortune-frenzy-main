/* eslint-disable no-constant-condition */
import { Controller, OnInit, OnStart } from "@flamework/core";
import React, { StrictMode } from "@rbxts/react";
import { createPortal, createRoot } from "@rbxts/react-roblox";
import { CollectionService, Players, ReplicatedStorage, RunService, SoundService, StarterGui } from "@rbxts/services";

import { Events } from "client/network";
import { App } from "client/ui/app";
import { GAME_LoadingScreen } from "client/ui/core/GAME_LoadingScreen";
import { DailyWheel } from "client/ui/rewards/DailyWheel";
import { isNavigationVisibleAtom } from "client/utils/global-state";
import { changeMenu } from "client/utils/menu-utils";
import { SERVER_LOAD_FAILED } from "shared/util/strings";

// Constants
const PURCHASE_SOUND_ID = "rbxassetid://114081271665464";
const WAIT_TIMEOUT = 30;
const SOUND_CLEANUP_DELAY = 5;
const STUDIO_FALLBACK_SOUND = "rbxasset://sounds/electronicpingshort.wav";

@Controller({ loadOrder: -1 })
export class UIController implements OnStart, OnInit {
	private softShutdownRoot?: ReturnType<typeof createRoot>;
	private softShutdownActive = false;

	onInit() {
		this.setupNotificationEvent();
		this.setupLoadingScreen();
		this.validateServerReady();
	}

	onStart() {
		this.validateClientReady();
		this.setupMainUI();
		this.setupNetworkEvents();
	}

	setNavigationButtonsVisible(visible: boolean) {
		isNavigationVisibleAtom(visible);
	}

	private setCoreGuiEnabledSafe(enabled: boolean) {
		let lastError: unknown = undefined;

		for (let attempt = 1; attempt <= 5; attempt++) {
			const [success, err] = pcall(() => StarterGui.SetCoreGuiEnabled(Enum.CoreGuiType.All, enabled));
			if (success) return;

			lastError = err;
			task.wait(0.1 * attempt);
		}

		warn(`[UIController] Failed to set CoreGui enabled=${enabled}:`, lastError);
	}

	private getPlayableSoundId(soundId: string) {
		const isAssetId = soundId.sub(1, 13) === "rbxassetid://";
		return RunService.IsStudio() && isAssetId ? STUDIO_FALLBACK_SOUND : soundId;
	}

	private setupNotificationEvent() {
		const notificationEvent = new Instance("BindableEvent");
		notificationEvent.Name = "NotificationEvent";
		notificationEvent.Parent = Players.LocalPlayer;
	}

	private setupLoadingScreen() {
		this.setCoreGuiEnabledSafe(false);

		const root = createRoot(new Instance("Folder"));
		const target = Players.LocalPlayer.WaitForChild("PlayerGui");
		root.render(<StrictMode>{createPortal(<GAME_LoadingScreen />, target)}</StrictMode>);
		this.setupLoadingCompletionHandler(root);
	}

	private setupLoadingCompletionHandler(root: ReturnType<typeof createRoot>) {
		task.spawn(() => {
			const playerGui = Players.LocalPlayer.WaitForChild("PlayerGui");
			const connection = playerGui.GetAttributeChangedSignal("LOADING_COMPLETE").Connect(() => {
				connection.Disconnect();
				root.unmount();
				this.setCoreGuiEnabledSafe(true);
			});
		});
	}

	private validateServerReady() {
		const serverReadyBoolean = ReplicatedStorage.WaitForChild("ServerReady", WAIT_TIMEOUT) as BoolValue;
		if (!serverReadyBoolean) {
			Players.LocalPlayer.Kick(SERVER_LOAD_FAILED);
		}
	}

	private validateClientReady() {
		const playerGui = Players.LocalPlayer.WaitForChild("PlayerGui");
		const clientReadyBoolean = playerGui.WaitForChild("ClientReady", WAIT_TIMEOUT) as BoolValue;

		if (!clientReadyBoolean || !clientReadyBoolean.Value) {
			Players.LocalPlayer.Kick(SERVER_LOAD_FAILED);
		}
	}

	private setupMainUI() {
		const target = Players.LocalPlayer.WaitForChild("PlayerGui");

		this.renderMainApp(target);
		this.setupDailyWheel(target);
	}

	private renderMainApp(target: Instance) {
		createRoot(new Instance("Folder")).render(<StrictMode>{createPortal(<App />, target)}</StrictMode>);
	}

	private setupDailyWheel(target: Instance) {
		const dailyWheel = CollectionService.GetTagged("DailyWheel")[0] as Model;
		if (!dailyWheel) return;

		const dailyWheelPart = dailyWheel.WaitForChild("UIPart", 5) as BasePart | undefined;
		if (!dailyWheelPart) return;

		dailyWheelPart.ClearAllChildren();
		createRoot(new Instance("Folder")).render(
			<StrictMode>{createPortal(<DailyWheel adornee={dailyWheelPart} />, target)}</StrictMode>,
		);

		this.setupDailyWheelInteraction(dailyWheel);
	}

	private setupDailyWheelInteraction(dailyWheel: Model) {
		const activatorPart = dailyWheel.WaitForChild("Activator", 5) as BasePart;
		const proximityPrompt = activatorPart.FindFirstChild("ProximityPrompt") as ProximityPrompt;

		if (proximityPrompt) {
			proximityPrompt.Triggered.Connect(() => {
				changeMenu("RewardWheel");
				isNavigationVisibleAtom(false);
			});
		}
	}

	private setupNetworkEvents() {
		Events.PurchaseConfirmed.connect(() => {
			this.playPurchaseSound();
		});

		Events.SoftShutdown.connect((payload) => {
			this.showSoftShutdownScreen(payload);
		});
	}

	private showSoftShutdownScreen(payload?: { clientMessage?: string; serverMessage?: string }) {
		if (this.softShutdownActive) return;
		this.softShutdownActive = true;

		const target = Players.LocalPlayer.WaitForChild("PlayerGui");
		const messageOverrides = {
			client: payload?.clientMessage ?? "Game updating...",
			server: payload?.serverMessage ?? "Rejoining a new server...",
		};

		this.setCoreGuiEnabledSafe(false);
		isNavigationVisibleAtom(false);
		Players.LocalPlayer.SetAttribute("_localLoadingStatus", messageOverrides.client);
		Players.LocalPlayer.SetAttribute("_backendLoadingStatus", messageOverrides.server);

		const root = createRoot(new Instance("Folder"));
		root.render(
			<StrictMode>
				{createPortal(<GAME_LoadingScreen lockCompletion messageOverrides={messageOverrides} />, target)}
			</StrictMode>,
		);

		this.softShutdownRoot = root;
	}

	private playPurchaseSound() {
		const sound = new Instance("Sound");
		sound.SoundId = this.getPlayableSoundId(PURCHASE_SOUND_ID);
		SoundService.PlayLocalSound(sound);
		task.delay(SOUND_CLEANUP_DELAY, () => sound.Destroy());
	}
}
