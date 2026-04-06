import React, { RefObject, useEffect, useMemo } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { palette } from "client/utils/palette";
import { TextLabel } from "../core/TextLabel";
import { Button } from "../core/Button";
import { Modding } from "@flamework/core";
import { ClientStateController } from "client/controllers/ClientStateController";
import getRarity from "shared/util/get-item-rarity";
import { formatWithSuffix } from "shared/util/number-utils";
import { useMotion } from "client/hooks/use-motion";
import { usePxScale } from "client/hooks/use-scale";
import { InventoryMenuAction } from "../menus/InventoryMenu";
import { Corner } from "../tools/Corner";

interface Props {
	position: UDim2;
	selectedItem: string;
	tooltipRef: RefObject<Frame>;
	setHoveringTooltip: React.Dispatch<React.SetStateAction<boolean>> | ((isHovering: boolean) => void);
	dispatch: (value: InventoryMenuAction) => void;
	scale?: boolean;
	currentSelection: Record<string, number> | undefined;

	addEvent: (rbx: ImageButton, inputObject: InputObject, clickCount: number) => void;
	subEvent: (rbx: ImageButton, inputObject: InputObject, clickCount: number) => void;
	addButtonEnabled: boolean;
	subButtonEnabled: boolean;
}

const COLORS = {
	background: {
		common: [Color3.fromRGB(28, 32, 44), Color3.fromRGB(19, 21, 29)],
	},
	strokes: {
		common: palette.rarities.glow.common.Keypoints[0].Value,
	},
	text: {
		common: palette.primaryText,
		uncommon: Color3.fromRGB(148, 255, 129),
		rare: Color3.fromRGB(93, 163, 255),
		epic: Color3.fromRGB(255, 97, 97),
		legendary: Color3.fromRGB(255, 198, 65),
		mythical: Color3.fromRGB(107, 222, 228),
	},
	buttons: {
		view: { bg: Color3.fromRGB(43, 48, 66), text: Color3.fromRGB(228, 248, 255) },
		equip: { bg: Color3.fromRGB(35, 66, 43), text: Color3.fromRGB(199, 255, 215) },
		unequip: { bg: Color3.fromRGB(66, 43, 35), text: Color3.fromRGB(255, 199, 215) },
		sell: { bg: Color3.fromRGB(43, 48, 66), text: Color3.fromRGB(228, 248, 255) },
	},
};

const SIZES = {
	buttonWidth: 130,
	buttonHeight: 28,
	padding: 10,
	textSize: { name: 16, rarity: 13, value: 13, action: 14 },
};

const ExtraPadding = ({ extra, layoutOrder }: { extra: number; layoutOrder: number }) => {
	const px = usePx();
	return (
		<frame
			Size={new UDim2(0, px(SIZES.buttonWidth), 0, px(extra))}
			BackgroundTransparency={1}
			LayoutOrder={layoutOrder}
		/>
	);
};

export function ItemSelectionTooltip({
	position,
	selectedItem,
	tooltipRef,
	setHoveringTooltip,
	dispatch,
	scale = true,
	currentSelection,
	addEvent,
	subEvent,
	addButtonEnabled,
	subButtonEnabled,
}: Props) {
	const px = usePx();
	const pxScale = usePxScale();
	const clientStateController = Modding.resolveSingleton(ClientStateController);
	const [tooltipPosition, tooltipPositionMotion] = useMotion(tooltipRef.current?.Position ?? position);

	useEffect(() => {
		tooltipPositionMotion.spring(position, { tension: 200, friction: 20 });
	}, [position]);

	const itemData = useMemo(() => {
		if (selectedItem === "") return undefined;
		const data = clientStateController.ItemInfo.get(selectedItem);
		const rarity = getRarity(data ? data.value : 0);
		const total_selected = currentSelection ? currentSelection[selectedItem] || 0 : 0;
		const value_selected = data ? data.value * total_selected : 0;

		return {
			total_selected,
			rarity,
			value_selected,
			name: data ? data.name : "",
			value: data ? data.value : 0,
		};
	}, [selectedItem, clientStateController, currentSelection]);

	return (
		<frame
			AutomaticSize={Enum.AutomaticSize.XY}
			Position={tooltipPosition}
			Size={new UDim2(0, 1, 0, 1)}
			AnchorPoint={new Vector2(0, 0)}
			BackgroundColor3={Color3.fromRGB(255, 255, 255)}
			Visible={selectedItem !== ""}
			ref={tooltipRef}
			Event={{
				MouseEnter: () => setHoveringTooltip(true),
				MouseLeave: () => setHoveringTooltip(false),
			}}
		>
			{scale ? <uiscale Scale={pxScale()} /> : undefined}
			<Corner roundness="small" />
			<uigradient
				Color={
					new ColorSequence([
						new ColorSequenceKeypoint(0, COLORS.background["common"][0]),
						new ColorSequenceKeypoint(1, COLORS.background["common"][1]),
					])
				}
				Rotation={-90}
			/>
			<uisizeconstraint MaxSize={new Vector2(px(150) * pxScale(), math.huge)} />
			<uistroke Thickness={0.7} Color={COLORS.strokes["common"]} />
			<frame
				AutomaticSize={Enum.AutomaticSize.XY}
				BackgroundTransparency={1}
				Position={new UDim2(0, 0, 0, 0)}
				Size={new UDim2(0, 0, 0, 0)}
			>
				<uilistlayout
					Padding={new UDim(0, 2)}
					HorizontalAlignment={Enum.HorizontalAlignment.Center}
					SortOrder={Enum.SortOrder.LayoutOrder}
				/>
				<uipadding
					PaddingBottom={new UDim(0, px(SIZES.padding))}
					PaddingLeft={new UDim(0, px(SIZES.padding))}
					PaddingRight={new UDim(0, px(SIZES.padding))}
					PaddingTop={new UDim(0, px(SIZES.padding))}
				/>
				<TextLabel
					typeface="Sans"
					weight="Bold"
					native={{
						Text: itemData?.name ?? "",
						AutomaticSize: Enum.AutomaticSize.XY,
						TextSize: px(SIZES.textSize.name),
						Size: new UDim2(0, 0, 0, px(14)),
						LayoutOrder: 1,
					}}
				/>
				<TextLabel
					typeface="Sans"
					weight="Medium"
					native={{
						Text: itemData?.rarity
							? string.upper(string.sub(itemData.rarity, 1, 1)) + string.sub(itemData.rarity, 2)
							: "",
						AutomaticSize: Enum.AutomaticSize.XY,
						TextSize: px(SIZES.textSize.rarity),
						Size: new UDim2(0, 0, 0, px(14)),
						LayoutOrder: 2,
						TextColor3: COLORS.text[itemData?.rarity ?? "common"],
					}}
				/>
				<TextLabel
					typeface="Sans"
					weight="SemiBold"
					native={{
						Text: `${formatWithSuffix(itemData?.value ?? 0, 2)} Value`,
						AutomaticSize: Enum.AutomaticSize.XY,
						TextSize: px(SIZES.textSize.value),
						Size: new UDim2(0, px(100), 0, px(14)),
						LayoutOrder: 3,
						TextColor3: palette.primaryText,
						TextWrapped: false,
					}}
				/>
				<TextLabel
					typeface="Sans"
					weight="SemiBold"
					native={{
						Text: `${formatWithSuffix(itemData?.value_selected ?? 0, 2)} Value Selected`,
						AutomaticSize: Enum.AutomaticSize.XY,
						TextSize: px(SIZES.textSize.value),
						Size: new UDim2(0, px(100), 0, px(14)),
						LayoutOrder: 3,
						TextColor3: palette.primaryText,
						TextWrapped: false,
					}}
				/>
				<TextLabel
					typeface="Sans"
					weight="SemiBold"
					native={{
						Text: `${itemData?.total_selected} Selected`,
						AutomaticSize: Enum.AutomaticSize.XY,
						TextSize: px(SIZES.textSize.value),
						Size: new UDim2(0, px(100), 0, px(14)),
						LayoutOrder: 3,
						TextColor3: palette.primaryText,
						TextWrapped: false,
					}}
				/>
				<ExtraPadding extra={2} layoutOrder={4} />
				<frame
					Size={new UDim2(0, 0, 0, 0)}
					Position={new UDim2(0, 0, 0, 0)}
					LayoutOrder={5}
					BackgroundTransparency={1}
					AutomaticSize={Enum.AutomaticSize.XY}
				>
					<Button
						size={new UDim2(0, px(56), 0, px(28))}
						position={new UDim2(0, 0, 0, 0)}
						text=""
						image="rbxassetid://83691402457044"
						backgroundColor={COLORS.buttons.view.bg}
						imagePadding={0}
						event={{
							Activated: subEvent,
						}}
						enabled={subButtonEnabled}
					/>
					<Button
						size={new UDim2(0, px(56), 0, px(28))}
						position={new UDim2(0, px(66), 0, 0)}
						text=""
						image="rbxassetid://82058407140864"
						backgroundColor={COLORS.buttons.view.bg}
						imagePadding={0}
						event={{
							Activated: addEvent,
						}}
						enabled={addButtonEnabled}
					/>
				</frame>
			</frame>
		</frame>
	);
}
