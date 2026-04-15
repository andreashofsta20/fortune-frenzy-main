import React from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { Button } from "../core/Button";
import { TextLabel } from "../core/TextLabel";
import { Corner } from "../tools/Corner";
import { MarketplaceService, Players } from "@rbxts/services";
import { formatWithSuffix } from "shared/util/number-utils";
import { isLoadingAtom } from "client/utils/global-state";
import { brighten, setValue } from "client/utils/color-utils";
import { palette } from "client/utils/palette";
import { SubscriptionData } from "typings/APIResponses";
import {
	formatSubscriptionTimeRemaining,
	isSubscriptionDataActive,
} from "client/utils/subscription-display";

/** Must match `CommerceService` SUBSCRIPTION_IDS.VIP (server). */
export const VIP_SUBSCRIPTION_PRODUCT_ID = "EXP-5129818885008261677";

/** VIP tile art. `rbxthumb` loads reliably in ImageLabels; raw `rbxassetid` often fails for non-bundled assets. */
export const VIP_SUBSCRIPTION_IMAGE = "rbxassetid://88528353846972";

const DESCRIPTIONS = {
	gamepass: {
		"1784219262": "Get 2x Gems from the Exclusive Store + 10,000 free Gems instantly when you buy this pass",
		"1784211301": "Open cases at super speed! Applies only to Item Cases.",
		"1784405049": "Receive a free Lucky Roll as a bonus for every 5 cases you open!",
	} as Record<string, string>,
	subscription: {
		[VIP_SUBSCRIPTION_PRODUCT_ID]:
			"Unlock exclusive perks like VIP Cases, Bot Coinflips, 2x Shards, and VIP chat—plus more coming soon!",
	} as Record<string, string>,
};

interface GamepassTileProps<T extends "gamepass" | "subscription"> {
	option: T;
	info: T extends "gamepass" ? GamePassProductInfo : SubscriptionInfo;
	layoutOrder: number;
	color: Color3;
	image: string;
	id: T extends "gamepass" ? number : string;
	/** Server subscription row (e.g. VIP) for owned state and time remaining in the shop. */
	subscriptionRow?: SubscriptionData;
	/** Profile says this gamepass is owned (`GamepassStatuses`). */
	gamepassOwned?: boolean;
}

// Type guard to check if info is GamePassProductInfo
function isGamePassInfo(info: unknown): info is GamePassProductInfo {
	return (info as GamePassProductInfo).PriceInRobux !== undefined;
}

// Type guard to check if info is SubscriptionInfo
function isSubscriptionInfo(info: unknown): info is SubscriptionInfo {
	return (
		(info as SubscriptionInfo).DisplayPrice !== undefined &&
		(info as SubscriptionInfo).DisplaySubscriptionPeriod !== undefined
	);
}

const GamepassTile = React.memo(
	<T extends "gamepass" | "subscription">({
		option,
		info,
		layoutOrder,
		color,
		image,
		id,
		subscriptionRow,
		gamepassOwned = false,
	}: GamepassTileProps<T>) => {
		const px = usePx();
		const ySize = option === "gamepass" ? px(120) : px(150);
		const stringid = tostring(id);

		const vipOwned =
			option === "subscription" &&
			stringid === VIP_SUBSCRIPTION_PRODUCT_ID &&
			isSubscriptionDataActive(subscriptionRow);

		const ownedAppearance = vipOwned || (option === "gamepass" && gamepassOwned);

		const buttonText =
			option === "subscription"
				? vipOwned
					? "Owned"
					: stringid === VIP_SUBSCRIPTION_PRODUCT_ID
						? `Subscribe (\u{E002}1,000/mo)`
						: "Subscribe"
				: gamepassOwned
					? "Owned"
					: isGamePassInfo(info)
						? `Buy (\u{E002}${formatWithSuffix(info.PriceInRobux ?? 0)})`
						: "Buy";

		return (
			<frame BackgroundTransparency={1} Size={new UDim2(1, 0, 0, ySize)} LayoutOrder={layoutOrder}>
				<Corner roundness="small" />
				<Button
					size={new UDim2(0, px(130), 0, px(36))}
					anchorPoint={new Vector2(1, 1)}
					position={new UDim2(1, px(-15), 1, px(-15))}
					typeface="Sans"
					weight="Medium"
					text={buttonText}
					textSize={px(18)}
					textColor={ownedAppearance ? palette.midText : setValue(color, 30)}
					backgroundColor={ownedAppearance ? palette.background4 : color}
					enabled={option === "gamepass" ? !gamepassOwned : !vipOwned}
					event={{
						Activated: () => {
							if (option === "gamepass") {
								if (gamepassOwned) return;
								isLoadingAtom(true);
								MarketplaceService.PromptGamePassPurchase(Players.LocalPlayer, id as number);
								MarketplaceService.PromptGamePassPurchaseFinished.Once(() => isLoadingAtom(false));
							} else if (!vipOwned) {
								isLoadingAtom(true);
								MarketplaceService.PromptSubscriptionPurchase(Players.LocalPlayer, id as string);
								MarketplaceService.PromptSubscriptionPurchaseFinished.Once(() => isLoadingAtom(false));
							}
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
					Image={"rbxassetid://85064031907597"}
					ScaleType={Enum.ScaleType.Stretch}
					Size={new UDim2(1, 0, 1, 0)}
					ImageColor3={color}
					ZIndex={-1}
				>
					<Corner roundness="small" />
				</imagelabel>
				<imagelabel
					Image={image}
					ScaleType={Enum.ScaleType.Fit}
					AnchorPoint={new Vector2(0, 0.5)}
					Size={
						option === "subscription"
							? new UDim2(0, px(120), 0, px(120))
							: new UDim2(0, px(100), 0, px(100))
					}
					Position={new UDim2(0, px(15), 0.5, 0)}
					BackgroundTransparency={1}
				/>
				<TextLabel
					weight="Bold"
					typeface="Sans"
					native={{
						Text: info.Name,
						TextSize: option === "subscription" ? px(28) : px(24),
						Size: new UDim2(0, px(1), 0, option === "subscription" ? px(28) : px(24)),
						Position:
							option === "subscription"
								? new UDim2(0, px(144), 0, px(19))
								: new UDim2(0, px(127), 0, px(21)),
						TextXAlignment: Enum.TextXAlignment.Left,
						AutomaticSize: Enum.AutomaticSize.X,
						TextColor3: palette.primaryText,
					}}
				/>
				<TextLabel
					weight="SemiBold"
					typeface="Sans"
					native={{
						Text:
							option === "gamepass"
								? DESCRIPTIONS.gamepass[stringid] ?? ""
								: DESCRIPTIONS.subscription[stringid] ??
									(isSubscriptionInfo(info) ? ((info as SubscriptionInfo).Description ?? "") : ""),
						TextSize: option === "subscription" ? px(18) : px(17),
						Size: new UDim2(0, option === "subscription" ? px(305) : px(200), 0, px(55)),
						Position:
							option === "subscription"
								? new UDim2(0, px(144), 0, px(48))
								: new UDim2(0, px(127), 0, px(45)),
						TextXAlignment: Enum.TextXAlignment.Left,
						TextYAlignment: Enum.TextYAlignment.Top,
						TextColor3: brighten(color, 0.5),
					}}
				/>
				{option === "subscription" && (
					<TextLabel
						weight="SemiBold"
						typeface="Sans"
						native={{
							Text: (() => {
								if (vipOwned) {
									const remaining = formatSubscriptionTimeRemaining(subscriptionRow);
									return remaining.size() > 0 ? remaining : "VIP active";
								}
								if (!isSubscriptionInfo(info)) {
									return stringid === VIP_SUBSCRIPTION_PRODUCT_ID
										? `\u{E002}1,000 / month`
										: "";
								}
								const line = `${info.DisplayPrice}${info.DisplaySubscriptionPeriod}`;
								return line.size() > 0
									? line
									: stringid === VIP_SUBSCRIPTION_PRODUCT_ID
										? `\u{E002}1,000 / month`
										: "";
							})(),
							TextSize: px(20),
							Size: new UDim2(0, px(220), 0, px(28)),
							Position: new UDim2(0, px(144), 0, px(103)),
							TextXAlignment: Enum.TextXAlignment.Left,
							TextYAlignment: Enum.TextYAlignment.Center,
							TextColor3: brighten(color, 0.8),
						}}
					/>
				)}
			</frame>
		);
	},
);

export default GamepassTile;
