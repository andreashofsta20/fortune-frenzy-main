import React, { useCallback, useEffect, useMemo, useState } from "@rbxts/react";
import { Players, SoundService } from "@rbxts/services";
import { setInterval } from "@rbxts/set-timeout";
import { useMotion } from "@rbxts/pretty-react-hooks";

import { usePx } from "client/hooks/use-px";
import { palette } from "client/utils/palette";

import { Layer } from "../layer";
import { TextLabel } from "./TextLabel";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const ASSETS = {
	icon: "rbxassetid://70523191477904",
	loadingSound: "rbxasset://sounds/electronicpingshort.wav",
};

const SPIN_DURATION = 0.7; // seconds per half-rotation
const FINISHED_ATTRIBUTE = "LOADING_COMPLETE";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface LoadingMessages {
	client: string;
	server: string;
}

interface LoadingScreenProps {
	messageOverrides?: Partial<LoadingMessages>;
	lockCompletion?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function GAME_LoadingScreen({ messageOverrides, lockCompletion = false }: LoadingScreenProps) {
	const px = usePx();

	// -----------------------------------------------------------------------
	// State
	// -----------------------------------------------------------------------
	const [isLoaded, setIsLoaded] = useState(false);
	const [rotationTarget, setRotationTarget] = useState(0);
	const [messages, setMessages] = useState<LoadingMessages>({
		client: messageOverrides?.client ?? "Loading...",
		server: messageOverrides?.server ?? "Please wait...",
	});

	// -----------------------------------------------------------------------
	// Motion values
	// -----------------------------------------------------------------------
	const [imageRotation, rotationMotion] = useMotion(0);

	const [imageSize, sizeMotion] = useMotion(new UDim2(0, px(60), 0, px(60)));
	const [imagePos, posMotion] = useMotion(new UDim2(0, px(50), 1, -px(120)));
	const [imageAnchor, anchorMotion] = useMotion(new Vector2(0, 1));

	const [fade, fadeMotion] = useMotion(0);
	const [backgroundColor, bgMotion] = useMotion(palette.background1);
	const [textTransparency, textMotion] = useMotion(0);

	// -----------------------------------------------------------------------
	// Helpers
	// -----------------------------------------------------------------------
	const baseTween = useMemo(
		() => ({
			time: SPIN_DURATION,
			direction: Enum.EasingDirection.InOut,
			style: Enum.EasingStyle.Back,
		}),
		[],
	);

	const updateClientMessage = useCallback(() => {
		if (messageOverrides?.client !== undefined) {
			setMessages((prev) => ({ ...prev, client: messageOverrides.client! }));
			return;
		}

		const value = Players.LocalPlayer.GetAttribute("_localLoadingStatus") as string | undefined;

		setMessages((prev) => ({
			...prev,
			client:
				value ??
				(Players.LocalPlayer.FindFirstChild("PlayerGui")?.FindFirstChild("ClientReady")
					? "Client ready!"
					: "Loading..."),
		}));
	}, [messageOverrides?.client]);

	const updateServerMessage = useCallback(() => {
		if (messageOverrides?.server !== undefined) {
			setMessages((prev) => ({ ...prev, server: messageOverrides.server! }));
			return;
		}

		const value = Players.LocalPlayer.GetAttribute("_backendLoadingStatus") as string | undefined;

		setMessages((prev) => ({
			...prev,
			server: value ?? (Players.LocalPlayer.GetAttribute("__SERVER_LOADED") ? "Server ready!" : "Please wait..."),
		}));
	}, [messageOverrides?.server]);

	// -----------------------------------------------------------------------
	// Effects
	// -----------------------------------------------------------------------

	// Continuous spinning (until loaded)
	useEffect(() => {
		if (isLoaded) return;

		const clear = setInterval(() => {
			setRotationTarget((prev) => prev + 180);
		}, SPIN_DURATION);

		return () => clear();
	}, [isLoaded]);

	// Tween to latest rotation target
	useEffect(() => {
		if (isLoaded) return;
		rotationMotion.tween(rotationTarget, baseTween);
	}, [rotationTarget, isLoaded]);

	// Status message listeners
	useEffect(() => {
		if (isLoaded) return;

		// Initialise with current values
		updateClientMessage();
		updateServerMessage();

		const conn1 = Players.LocalPlayer.GetAttributeChangedSignal("_localLoadingStatus").Connect(updateClientMessage);
		const conn2 =
			Players.LocalPlayer.GetAttributeChangedSignal("_backendLoadingStatus").Connect(updateServerMessage);

		return () => {
			conn1.Disconnect();
			conn2.Disconnect();
		};
	}, [isLoaded]);

	// Detect when the client is ready ("ClientReady" BoolValue is added)
	useEffect(() => {
		if (lockCompletion) return;

		const gui = Players.LocalPlayer.WaitForChild("PlayerGui");

		const onMaybeReady = (child: Instance) => {
			if (child.IsA("BoolValue") && child.Name === "ClientReady") {
				setIsLoaded(true);
			}
		};

		// ClientStateController may parent ClientReady before this effect runs (fast load / scheduling).
		// ChildAdded alone would miss that and leave the screen stuck forever.
		const existing = gui.FindFirstChild("ClientReady");
		if (existing) onMaybeReady(existing);

		const conn = gui.ChildAdded.Connect(onMaybeReady);
		return () => conn.Disconnect();
	}, [lockCompletion]);

	// Final animation & clean-up
	useEffect(() => {
		if (!isLoaded || lockCompletion) return;

		// Wait for the last spin tween to finish
		task.wait(SPIN_DURATION + 0.1);

		const fastTween = { time: 0.7, direction: Enum.EasingDirection.InOut, style: Enum.EasingStyle.Exponential };

		sizeMotion.tween(new UDim2(0, px(80), 0, px(80)), fastTween);
		posMotion.tween(new UDim2(0.5, 0, 0.5, 0), fastTween);
		anchorMotion.tween(new Vector2(0.5, 0.5), fastTween);
		textMotion.tween(1, fastTween);

		// Play subtle feedback sound near the end of tween
		task.delay(fastTween.time - 0.55, () => {
			const sound = new Instance("Sound");
			sound.SoundId = ASSETS.loadingSound;
			sound.Volume = 0.2;
			SoundService.PlayLocalSound(sound);
			task.delay(5, () => sound.Destroy());
		});

		// Chain final fade-out
		task.delay(fastTween.time, () => {
			const fadeTween = { ...fastTween, time: 0.5 };
			fadeMotion.tween(1, fadeTween);
			sizeMotion.tween(new UDim2(0, px(150), 0, px(150)), fadeTween);

			// Flash to white briefly for a smoother transition
			task.delay(0.15, () => {
				const colorTween = { ...fastTween, time: 0.4 };
				bgMotion.tween(Color3.fromRGB(255, 255, 255), colorTween);
			});

			// Mark screen as complete – the UIController listens for this
			task.delay(0.7, () => {
				Players.LocalPlayer.WaitForChild("PlayerGui").SetAttribute(FINISHED_ATTRIBUTE, true);
			});
		});
	}, [isLoaded, lockCompletion]);

	// -----------------------------------------------------------------------
	// Render
	// -----------------------------------------------------------------------
	return (
		<Layer displayOrder={100} name="GAME_LoadingScreen">
			<frame BackgroundColor3={backgroundColor} Size={new UDim2(1, 0, 1, 0)} BackgroundTransparency={fade}>
				<imagelabel
					BackgroundTransparency={1}
					Position={imagePos}
					Size={imageSize}
					AnchorPoint={imageAnchor}
					Rotation={imageRotation}
					ImageTransparency={fade}
					Image={ASSETS.icon}
					ScaleType={Enum.ScaleType.Fit}
				/>

				{/* Client / server status */}
				<TextLabel
					typeface="Sans"
					weight="Bold"
					native={{
						TextTransparency: textTransparency,
						Text: messages.client,
						TextSize: px(20),
						Size: new UDim2(0, px(380), 0, px(20)),
						Position: new UDim2(0, px(50), 1, -px(80)),
						AnchorPoint: new Vector2(0, 1),
						TextXAlignment: Enum.TextXAlignment.Left,
					}}
				/>
				<TextLabel
					typeface="Sans"
					weight="Bold"
					native={{
						TextTransparency: textTransparency,
						Text: messages.server,
						TextSize: px(20),
						Size: new UDim2(0, px(380), 0, px(20)),
						Position: new UDim2(0, px(50), 1, -px(50)),
						AnchorPoint: new Vector2(0, 1),
						TextXAlignment: Enum.TextXAlignment.Left,
					}}
				/>
			</frame>
		</Layer>
	);
}
