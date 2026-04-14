import React from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { Corner } from "../tools/Corner";
import { palette } from "client/utils/palette";
import { JackpotData } from "typings/APIResponses";
import { Button } from "../core/Button";
import { TextLabel } from "../core/TextLabel";
import { JackpotSlice, PlayerSliceRotationRange } from "client/hooks/use-jackpot-wheel";
import { jackpotSelectionDataAtom } from "client/utils/global-state";
import { LoadingCircle } from "../core/LoadingCircle";
import { useJackpotWheelAnimations } from "client/hooks/use-jackpot-wheel-animations";
import { setDecimalPlaces } from "shared/util/number-utils";

interface Props {
	jackpot: JackpotData;
	slices: JackpotSlice[];
	playerSliceInfo: PlayerSliceRotationRange[];
	setCurrentPage: (page: "grid" | "viewing" | "inventory") => void;
}

export function JackpotWheel({ jackpot, slices, playerSliceInfo, setCurrentPage }: Props) {
	const px = usePx();
	const { wheel, transparency, text, state, image, registerSlice } = useJackpotWheelAnimations(
		jackpot,
		playerSliceInfo,
	);

	const {
		size: innerWheelSize,
		rotation: wheelRotation,
		strokeSize: innerStrokeSize,
		strokeColour: innerStrokeColour,
		ref: wheelRef,
		pointerColour,
		pointerTransparency,
	} = wheel;
	const {
		title: titleTransparency,
		loading: loadingTransparency,
		preSubtitle: preSubTextTransparency,
		postSubtitle: postSubTextTransparency,
		roundOverTitle: roundOverTitleTransparency,
		roundOverDescription: roundOverDescriptionTransparency,
	} = transparency;
	const { colour: textColour, subtitle: subtitleText, postSubtitle: postSubText } = text;
	const { buttonEnabled: buttonActive } = state;
	const { headshotRotation, headshotPosition, headshotSize, headshotTransparency } = image;

	return (
		<frame
			BackgroundTransparency={1}
			AnchorPoint={new Vector2(0, 0.5)}
			Position={new UDim2(0, px(34), 0.5, 0)}
			Size={new UDim2(0, px(375), 0, px(375))}
		>
			<Corner roundness="full" />
			<uistroke Color={palette.background1} Thickness={px(10)} />
			<frame
				BackgroundColor3={palette.background1}
				Position={new UDim2(0.5, 0, 0.5, 0)}
				AnchorPoint={new Vector2(0.5, 0.5)}
				Size={innerWheelSize}
				ZIndex={2}
			>
				<Corner roundness="full" />
				<uistroke Color={innerStrokeColour} Thickness={innerStrokeSize} />
				<imagelabel
					Image={"rbxassetid://100759203440470"}
					BackgroundTransparency={1}
					AnchorPoint={new Vector2(0.5, 0.5)}
					Position={new UDim2(0.5, 0, 0.5, 0)}
					Size={new UDim2(1, 0, 1, 0)}
					ImageColor3={Color3.fromRGB(128, 133, 179)}
					ImageTransparency={0.5}
				/>
				<frame
					Size={new UDim2(1, 0, 1, 0)}
					AnchorPoint={new Vector2(0.5, 0.5)}
					Position={new UDim2(0.5, 0, 0.5, 0)}
					BackgroundColor3={textColour}
				>
					<Corner roundness="full" />
					<uigradient
						Rotation={-90}
						Transparency={
							new NumberSequence([new NumberSequenceKeypoint(0, 0.85), new NumberSequenceKeypoint(1, 1)])
						}
					/>
				</frame>
				<Button
					size={new UDim2(0, px(120), 0, px(32))}
					anchorPoint={new Vector2(0.5, 0)}
					position={new UDim2(0.5, 0, 0, px(170))}
					text="Join"
					typeface="Sans"
					weight="SemiBold"
					backgroundColor={palette.blue}
					textColor={palette.blueText}
					visible={buttonActive}
					event={{
						Activated: async () => {
							setCurrentPage("inventory");
							jackpotSelectionDataAtom({
								maximumValue: jackpot.value_cap,
								maximumPerItem: math.huge,
								minimumValue: jackpot.value_floor ?? 5,
								totalMaximum: 8,
								title: "Select items to Jackpot",
								buttonText: "Join",
								autoSelectButtonVisible: true,
								autoSelectButtonText: "Add Max",
								autoSelectButtonMode: "max",
								excludeListedCopies: true,
							});
						},
					}}
				/>
				<imagelabel
					Image={"rbxassetid://113781041769162"}
					AnchorPoint={new Vector2(0.5, 0)}
					BackgroundTransparency={1}
					Position={new UDim2(0.5, 0, 0, px(20))}
					Size={new UDim2(0, px(43), 0, px(28))}
					ImageColor3={pointerColour}
					ImageTransparency={pointerTransparency}
				/>
				<TextLabel
					typeface="Sans"
					weight="Bold"
					native={{
						Text: "Jackpot",
						TextSize: px(35),
						Size: new UDim2(1, 0, 0, px(35)),
						Position: new UDim2(0.5, 0, 0, px(98)),
						AnchorPoint: new Vector2(0.5, 0),
						TextColor3: palette.primaryText,
						TextTransparency: titleTransparency,
					}}
				/>
				<LoadingCircle
					Size={new UDim2(0, px(34), 0, px(34))}
					AnchorPoint={new Vector2(0.5, 0.5)}
					Position={new UDim2(0.5, 0, 0, px(137))}
					ImageTransparency={loadingTransparency}
				/>
				<TextLabel
					typeface="Sans"
					weight="Bold"
					native={{
						Text: subtitleText,
						TextSize: px(20),
						Size: new UDim2(1, 0, 0, px(20)),
						Position: new UDim2(0.5, 0, 0, px(137)),
						AnchorPoint: new Vector2(0.5, 0),
						TextColor3: palette.midText,
						TextTransparency: preSubTextTransparency,
					}}
				/>

				{/*  post sub text 	 */}
				<TextLabel
					typeface="Sans"
					weight="Bold"
					native={{
						Text: postSubText.split("#")[0],
						TextSize: px(20),
						Size: new UDim2(1, 0, 0, px(20)),
						Position: new UDim2(0.5, 0, 0, px(140)),
						AnchorPoint: new Vector2(0.5, 0),
						TextColor3: textColour,
						TextTransparency: postSubTextTransparency,
					}}
				/>
				<TextLabel
					typeface="Sans"
					weight="SemiBold"
					native={{
						Text: postSubText.split("#")[1],
						TextSize: px(17),
						Size: new UDim2(1, 0, 0, px(17)),
						Position: new UDim2(0.5, 0, 0, px(163)),
						AnchorPoint: new Vector2(0.5, 0),
						TextColor3: textColour,
						TextTransparency: postSubTextTransparency,
					}}
				/>
				<imagelabel
					Image={postSubText.split("#")[2]}
					BackgroundColor3={textColour}
					Rotation={headshotRotation}
					Position={headshotPosition}
					Size={headshotSize}
					AnchorPoint={new Vector2(0.5, 0.5)}
					ImageTransparency={headshotTransparency}
					BackgroundTransparency={headshotTransparency}
				>
					<Corner roundness="full" />
				</imagelabel>

				{/* End-of-round text */}
				<TextLabel
					typeface="Sans"
					weight="Bold"
					native={{
						Text: "Round Over!",
						TextSize: px(30),
						Size: new UDim2(1, 0, 0, px(30)),
						Position: new UDim2(0.5, 0, 1, -px(116)),
						AnchorPoint: new Vector2(0.5, 1),
						TextColor3: palette.primaryText,
						TextTransparency: roundOverTitleTransparency,
					}}
				/>
				<TextLabel
					typeface="Sans"
					weight="SemiBold"
					native={{
						Text: (() => {
							if (jackpot.winning_data) {
								const winnerId = jackpot.winning_data.player.id;
								const winnerMember = jackpot.members.find((m) => m.player.id === winnerId);
								const winChance = winnerMember
									? math.clamp(
											(winnerMember.total_value /
												jackpot.members.reduce((s, m) => s + m.total_value, 0)) *
												100,
											0,
											100,
										)
									: 0;
								return `@${jackpot.winning_data.player.username} won Jackpot with a ${setDecimalPlaces(winChance, 2)}% chance.`;
							}
							return "";
						})(),
						TextSize: px(20),
						Size: new UDim2(1, -px(50), 0, px(40)),
						Position: new UDim2(0.5, 0, 1, -px(71)),
						AnchorPoint: new Vector2(0.5, 1),
						TextColor3: palette.midText,
						TextTransparency: roundOverDescriptionTransparency,
					}}
				/>
			</frame>
			<imagelabel
				Image={"rbxassetid://15091786603"}
				ImageColor3={Color3.fromRGB(0, 0, 0)}
				AnchorPoint={new Vector2(0.5, 0.5)}
				BackgroundTransparency={1}
				Position={new UDim2(0.5, 0, 0.5, 0)}
				Size={new UDim2(1, 0, 1, 0)}
				ZIndex={slices.size() > 0 ? 2 : 1}
			/>
			<frame
				BackgroundTransparency={1}
				AnchorPoint={new Vector2(0.5, 0.5)}
				Position={new UDim2(0.5, 0, 0.5, 0)}
				Size={new UDim2(1, 0, 1, 0)}
				Rotation={wheelRotation}
				ref={wheelRef}
			>
				{slices.map((slice, idx) => (
					<imagelabel
						key={`slice-${idx}`}
						Image={"rbxassetid://7135409944"}
						BackgroundTransparency={1}
						AnchorPoint={new Vector2(0.5, 0.5)}
						Position={new UDim2(0.5, 0, 0.5, 0)}
						Size={new UDim2(1, 0, 1, 0)}
						Rotation={slice.rotation}
						ImageColor3={slice.colour}
						ZIndex={slice.zIndex}
						ref={(inst) => {
							registerSlice(idx, inst as ImageLabel | undefined);
						}}
					>
						{slice.cutRotation !== undefined && (
							<uigradient
								Transparency={
									new NumberSequence([
										new NumberSequenceKeypoint(0, 0),
										new NumberSequenceKeypoint(0.5, 0),
										new NumberSequenceKeypoint(0.501, 1),
										new NumberSequenceKeypoint(1, 1),
									])
								}
								Rotation={slice.cutRotation}
							/>
						)}
					</imagelabel>
				))}
			</frame>
		</frame>
	);
}
