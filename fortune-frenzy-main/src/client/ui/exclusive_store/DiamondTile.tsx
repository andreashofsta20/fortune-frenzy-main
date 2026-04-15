import React, { useEffect, useRef } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { Corner } from "../tools/Corner";
import { Button } from "../core/Button";
import { TextLabel } from "../core/TextLabel";
import { addCommasToNumber } from "shared/util/number-utils";
import { MarketplaceService, Players } from "@rbxts/services";
import { isLoadingAtom } from "client/utils/global-state";

/** `rbxthumb` loads catalog / non-bundled assets reliably; raw `rbxassetid` often shows blank in ImageLabels. */
const DIAMOND_TILE_IMAGE = "rbxthumb://type=Asset&id=100608701680904&w=420&h=420";

export interface DiamondTileProps {
	info: DeveloperProductInfo;
}

const DiamondTile = React.memo(({ info }: DiamondTileProps) => {
	const px = usePx();
	const frameRef = useRef<Frame>();
	const parentWidth = useRef(px(105));

	useEffect(() => {
		const frame = frameRef.current;
		if (frame) {
			parentWidth.current = frame.AbsoluteSize.X;
			const conn = frame.GetPropertyChangedSignal("AbsoluteSize").Connect(() => {
				parentWidth.current = frame.AbsoluteSize.X;
			});
			return () => conn.Disconnect();
		}
	}, []);

	return (
		<frame
			ref={frameRef}
			Size={new UDim2(0, px(105), 0, px(150))}
			LayoutOrder={info.PriceInRobux}
			BackgroundColor3={Color3.fromRGB(255, 255, 255)}
		>
			<Corner roundness="small" />
			<uigradient
				Color={
					new ColorSequence([
						new ColorSequenceKeypoint(0, Color3.fromRGB(21, 36, 44)),
						new ColorSequenceKeypoint(0.464, Color3.fromRGB(30, 52, 63)),
						new ColorSequenceKeypoint(1, Color3.fromRGB(21, 36, 44)),
					])
				}
				Rotation={-70}
			/>
			<uistroke Color={Color3.fromRGB(255, 255, 255)}>
				<uigradient
					Color={
						new ColorSequence([
							new ColorSequenceKeypoint(0, Color3.fromRGB(81, 140, 170)),
							new ColorSequenceKeypoint(0.464, Color3.fromRGB(194, 244, 255)),
							new ColorSequenceKeypoint(1, Color3.fromRGB(81, 140, 170)),
						])
					}
					Rotation={-70}
				/>
			</uistroke>
			<Button
				size={new UDim2(1, px(-20), 0, px(28))}
				anchorPoint={new Vector2(0.5, 1)}
				position={new UDim2(0.5, 0, 1, px(-10))}
				typeface="Sans"
				weight="Medium"
				text={`\u{E002} ${addCommasToNumber(info.PriceInRobux ?? 0)}`}
				textSize={px(17)}
				textColor={Color3.fromRGB(12, 21, 25)}
				backgroundColor={Color3.fromRGB(105, 183, 222)}
				parentWidth={parentWidth.current}
				event={{
					Activated: () => {
						isLoadingAtom(true);
						MarketplaceService.PromptProductPurchase(Players.LocalPlayer, info.ProductId);
						MarketplaceService.PromptProductPurchaseFinished.Once(() => isLoadingAtom(false));
					},
				}}
			>
				<uigradient
					Color={
						new ColorSequence([
							new ColorSequenceKeypoint(0, Color3.fromRGB(255, 255, 255)),
							new ColorSequenceKeypoint(1, Color3.fromRGB(213, 213, 213)),
						])
					}
					Rotation={90}
				/>
			</Button>
			<imagelabel
				Image={DIAMOND_TILE_IMAGE}
				ScaleType={Enum.ScaleType.Fit}
				AnchorPoint={new Vector2(0.5, 0)}
				BackgroundTransparency={1}
				Position={new UDim2(0.5, 0, 0, px(-5))}
				Size={new UDim2(0, px(80), 0, px(80))}
			>
				<uigradient
					Rotation={90}
					Transparency={
						new NumberSequence([
							new NumberSequenceKeypoint(0, 1),
							new NumberSequenceKeypoint(0.153, 0.634),
							new NumberSequenceKeypoint(0.295, 0),
							new NumberSequenceKeypoint(0.463, 0),
							new NumberSequenceKeypoint(0.812, 1),
							new NumberSequenceKeypoint(1, 1),
						])
					}
				/>
			</imagelabel>
			<TextLabel
				typeface="Sans"
				weight="Bold"
				native={{
					Text: info.Name,
					TextSize: px(20),
					AnchorPoint: new Vector2(0.5, 0),
					Size: new UDim2(1, px(-20), 0, px(20)),
					Position: new UDim2(0.5, 0, 0, px(60)),
					TextXAlignment: Enum.TextXAlignment.Center,
					AutomaticSize: Enum.AutomaticSize.Y,
				}}
			>
				<uigradient
					Color={
						new ColorSequence([
							new ColorSequenceKeypoint(0, Color3.fromRGB(81, 140, 170)),
							new ColorSequenceKeypoint(0.464, Color3.fromRGB(194, 244, 255)),
							new ColorSequenceKeypoint(1, Color3.fromRGB(81, 140, 170)),
						])
					}
					Rotation={-70}
				/>
			</TextLabel>
		</frame>
	);
});

export default DiamondTile;
