import React, { useCallback, useEffect, useState } from "react";
import { brighten } from "client/utils/color-utils";
import { palette } from "client/utils/palette";
import { Corner } from "../tools/Corner";
import { usePx } from "client/hooks/use-px";
import { JACKPOT_CREATE_TITLE } from "shared/util/strings";
import { CloseButton } from "../core/CloseButton";
import { TextLabel } from "../core/TextLabel";
import { useMotion } from "@rbxts/pretty-react-hooks";
import { Button } from "../core/Button";
import { TextInputBox } from "../core/TextInputBox";
import {
	formatValueRange,
	parseDurationToSeconds,
	parseValueRange,
	smartStringToNumber,
} from "shared/util/string-utils";
import { formatDuration } from "shared/util/number-utils";
import { Functions } from "client/network";
import { isLoadingAtom } from "client/utils/global-state";
import { Modding } from "@flamework/core";
import { ClientStateController } from "client/controllers/ClientStateController";
import { requestServer } from "client/utils/send-function";

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 64;
const MIN_DELAY = 10;
const MAX_DELAY = 300;

interface Props {
	visible: boolean;
	close: () => void;
}

function LabelledInput(props: {
	label: string;
	placeholder: string;
	image: string;
	layoutOrder: number;
	onFocusLost: (textBox: TextBox) => void;
}) {
	const px = usePx();
	const { label, placeholder, image, layoutOrder, onFocusLost } = props;
	return (
		<>
			<TextLabel
				typeface="Sans"
				weight="Medium"
				native={{
					TextColor3: palette.darkerText,
					Text: label,
					Size: new UDim2(0, px(380), 0, px(18)),
					TextSize: px(18),
					TextXAlignment: Enum.TextXAlignment.Left,
					LayoutOrder: layoutOrder,
				}}
			/>
			<TextInputBox
				size={new UDim2(1, 0, 0, px(32))}
				typeface="Sans"
				weight="Medium"
				placeholder={placeholder}
				image={image}
				layoutOrder={layoutOrder + 1}
				event={{ FocusLost: onFocusLost }}
			/>
			<frame BackgroundTransparency={1} LayoutOrder={layoutOrder + 2} Size={UDim2.fromOffset(732, 3)} />
		</>
	);
}

export function JackpotCreatePopup({ visible, close }: Props) {
	const px = usePx();
	const clientStateController = Modding.resolveSingleton(ClientStateController);

	const [overlayTransparency, overlayTransparencyMotion] = useMotion(1);
	const [promptScale, promptScaleMotion] = useMotion(0.95);
	const [valueRange, setValueRange] = useState("");
	const [maxPlayers, setMaxPlayers] = useState("");
	const [startDelay, setStartDelay] = useState("");

	useEffect(() => {
		const tweenParams = {
			time: 0.25,
			style: Enum.EasingStyle.Exponential,
			direction: Enum.EasingDirection.InOut,
		};

		if (visible) {
			overlayTransparencyMotion.immediate(1);
			overlayTransparencyMotion.tween(0.5, tweenParams);
			promptScaleMotion.immediate(0.95);
			promptScaleMotion.tween(1, { ...tweenParams, style: Enum.EasingStyle.Back });
		} else {
			overlayTransparencyMotion.tween(1, tweenParams);
			promptScaleMotion.tween(0.95, tweenParams);
		}
	}, [visible]);

	const handleValueRangeLost = useCallback((text: TextBox) => {
		const parsed = parseValueRange(text.Text);
		setValueRange(parsed);
		text.Text = formatValueRange(parsed);
	}, []);

	const handleMaxPlayersLost = useCallback((text: TextBox) => {
		const parsed = smartStringToNumber(text.Text) ?? MIN_PLAYERS;
		const clamped = math.clamp(parsed, MIN_PLAYERS, MAX_PLAYERS);
		setMaxPlayers(tostring(clamped));
		text.Text = tostring(clamped);
	}, []);

	const handleStartDelayLost = useCallback((text: TextBox) => {
		let parsed = parseDurationToSeconds(text.Text);
		if (parsed === undefined || parsed === 0) parsed = MIN_DELAY;
		const clamped = math.clamp(parsed, MIN_DELAY, MAX_DELAY);
		setStartDelay(tostring(clamped));
		text.Text = formatDuration(clamped);
	}, []);

	return (
		<frame
			BackgroundColor3={brighten(palette.background1, 0.05)}
			BackgroundTransparency={overlayTransparency}
			Size={new UDim2(1, 0, 1, 0)}
			Visible={visible}
			ZIndex={100}
		>
			<Corner roundness={"small"} />
			<frame
				AnchorPoint={new Vector2(0.5, 0.5)}
				Position={new UDim2(0.5, 0, 0.5, 0)}
				Size={new UDim2(1, -px(120), 1, -px(120))}
				BackgroundColor3={palette.background1}
				ZIndex={101}
			>
				<uiscale Scale={promptScale} />
				<Corner roundness={"small"} />
				<TextLabel
					typeface="Sans"
					weight="Bold"
					native={{
						Text: JACKPOT_CREATE_TITLE,
						TextSize: px(28),
						Size: new UDim2(0, px(320), 0, px(28)),
						Position: new UDim2(0, px(24), 0, px(21)),
						TextXAlignment: Enum.TextXAlignment.Left,
					}}
				/>
				<CloseButton
					native={{
						Size: new UDim2(0, px(21), 0, px(21)),
						Position: new UDim2(1, -px(24), 0, px(24)),
						AnchorPoint: new Vector2(1, 0),
					}}
					event={{ Activated: close }}
				/>
				<Button
					anchorPoint={new Vector2(1, 1)}
					size={new UDim2(0, px(133), 0, px(32))}
					position={new UDim2(1, -px(24), 1, -px(24))}
					text="Create Game"
					typeface="Sans"
					weight="SemiBold"
					backgroundColor={palette.blue}
					textColor={palette.blueText}
					event={{
						Activated: async () => {
							const parsedValueRange = parseValueRange(valueRange);
							const parsedMaxPlayers = smartStringToNumber(maxPlayers) ?? MIN_PLAYERS;
							const parsedStartDelay = parseDurationToSeconds(startDelay) ?? MIN_DELAY;
							isLoadingAtom(true);

							const response = await requestServer(
								Functions.Jackpot.CreatePot,
								"Failed to create jackpot",
								parsedValueRange,
								parsedMaxPlayers,
								parsedStartDelay,
							);

							isLoadingAtom(false);

							if (response === -1) return;
							if (response.code === 200) {
								isLoadingAtom(false);
								await new Promise<void>((resolve) => {
									const isJackpotAdded = () => {
										const currentJackpots = clientStateController.Jackpots.find(
											(jp) => jp.id === response.message,
										);
										return currentJackpots;
									};

									if (isJackpotAdded()) {
										resolve();
										return;
									}

									const connection = clientStateController.JackpotChangedEvent.Connect((jps) => {
										if (jps.find((jp) => jp.id === response.message)) {
											connection.Disconnect();
											resolve();
										}
									});

									task.delay(5, () => {
										connection.Disconnect();
										resolve();
									});
								});

								close();
							} else {
								clientStateController.NotificationEvent.Fire(
									`<font color="#${palette.lossRed.ToHex()}">${response.message ?? "Failed to create jackpot"}; Code ${response.code}</font>`,
									"rbxassetid://134904801170653",
								);
							}
						},
					}}
				/>
				<frame
					BackgroundTransparency={1}
					AnchorPoint={new Vector2(0.5, 0.5)}
					Position={new UDim2(0.5, 0, 0.5, -px(5))}
					Size={new UDim2(1, -px(48), 0, px(220))}
				>
					<uilistlayout Padding={new UDim(0, px(8))} SortOrder={Enum.SortOrder.LayoutOrder} />
					<LabelledInput
						label="Value Range"
						placeholder="Enter a max value (e.g. 2M) or range (e.g. 1M - 2M)"
						image="rbxassetid://120000048331921"
						layoutOrder={1}
						onFocusLost={handleValueRangeLost}
					/>
					<LabelledInput
						label="Maximum Players"
						placeholder="How many people can join (must be between 2 and 64)"
						image="rbxassetid://97435883027463"
						layoutOrder={4}
						onFocusLost={handleMaxPlayersLost}
					/>
					<LabelledInput
						label="How long should the game take to start?"
						placeholder="How long to wait before the game starts (e.g. 30s, 1m 30s)"
						image="rbxassetid://100503553886895"
						layoutOrder={7}
						onFocusLost={handleStartDelayLost}
					/>
				</frame>
			</frame>
		</frame>
	);
}
