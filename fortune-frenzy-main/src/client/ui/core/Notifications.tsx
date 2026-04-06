import React, { useEffect, useMemo, useRef, useState } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { TweenService, TextService, Workspace, HttpService, Players } from "@rbxts/services";
import { useMotion } from "client/hooks/use-motion";
import { usePxScale } from "client/hooks/use-scale";
import { Modding } from "@flamework/core";
import { ClientStateController } from "client/controllers/ClientStateController";
import { TextLabel } from "./TextLabel";
import { palette } from "client/utils/palette";
import { SoundController } from "client/controllers/SoundController";

function Notifications() {
	const px = usePx();
	const pxScale = usePxScale();
	const [currentNotification, setCurrentNotification] = useState<string | undefined>(undefined);
	const [position, positionMotion] = useMotion(new UDim2(0.5, 0, 0, px(80) - px(10)));
	const [transparency, transparencyMotion] = useMotion(1);
	const fadeTaskRef = useRef<thread | undefined>();
	const soundController = Modding.resolveSingleton(SoundController);

	useEffect(() => {
		const handleNotification = (
			text: string,
			sound = "rbxassetid://98356372625094",
			source: "signal" | "event",
		) => {
			warn(`[Notifications] ${source} notification: ${text}`);

			setCurrentNotification(text);
			soundController.PlaySound(sound, "sfx", 0.7);

			if (fadeTaskRef.current) {
				task.cancel(fadeTaskRef.current);
				fadeTaskRef.current = undefined;
			}

			positionMotion.immediate(new UDim2(0.5, 0, 0, px(80) - px(10)));
			positionMotion.tween(new UDim2(0.5, 0, 0, px(80)), {
				time: 0.4,
				style: Enum.EasingStyle.Back,
				direction: Enum.EasingDirection.Out,
			});
			transparencyMotion.tween(0, {
				time: 0.2,
				style: Enum.EasingStyle.Quad,
				direction: Enum.EasingDirection.Out,
			});

			fadeTaskRef.current = task.delay(3, () => {
				transparencyMotion.tween(1, {
					time: 2,
					style: Enum.EasingStyle.Quad,
					direction: Enum.EasingDirection.Out,
				});
			});
		};

		const clientStateController = Modding.resolveSingleton(ClientStateController);
		const signalConnection = clientStateController.NotificationEvent.Connect((text, sound) =>
			handleNotification(text, sound, "signal"),
		);
		const event = Players.LocalPlayer.WaitForChild("NotificationEvent") as BindableEvent;
		const eventConnection = event.Event.Connect((text, sound) => handleNotification(text, sound, "event"));

		return () => {
			signalConnection.Disconnect();
			eventConnection.Disconnect();
			if (fadeTaskRef.current) {
				task.cancel(fadeTaskRef.current);
				fadeTaskRef.current = undefined;
			}
		};
	}, []);

	return (
		<TextLabel
			typeface="Sans"
			weight="Bold"
			native={{
				Text: currentNotification,
				TextSize: px(23),
				TextColor3: palette.primaryText,
				Size: new UDim2(1, 0, 0, px(23)),
				AnchorPoint: new Vector2(0.5, 0),
				Position: position,
				TextTransparency: transparency,
				RichText: true,
				ZIndex: 10,
			}}
		>
			<uistroke Thickness={px(1.5)} Color={palette.black} Transparency={transparency} />
		</TextLabel>
	);
}

export default React.memo(Notifications);
