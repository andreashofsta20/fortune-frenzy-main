import React, { useEffect, useMemo, useState } from "@rbxts/react";
import { MenuCore } from "../navigation/MenuCore";
import { usePx } from "client/hooks/use-px";
import { palette } from "client/utils/palette";
import { CloseButton } from "../core/CloseButton";
import { Corner } from "../tools/Corner";
import { TextLabel } from "../core/TextLabel";
import { ROBUX_SHOP_TITLE } from "shared/util/strings";
import { Modding } from "@flamework/core";
import { ClientStateController } from "client/controllers/ClientStateController";
import DiamondTile from "../exclusive_store/DiamondTile";
import GamepassTile, {
	VIP_SUBSCRIPTION_IMAGE,
	VIP_SUBSCRIPTION_PRODUCT_ID,
} from "../exclusive_store/GamepassTile";
import ScrollingFrameSection from "../exclusive_store/ScrollingFrameSection";
import { handleCloseButton } from "client/utils/menu-utils";
import { Events } from "client/network";
import { SubscriptionData } from "typings/APIResponses";

export interface RobuxShopMenuProps {
	visible: boolean;
	flashMenu: () => void;
}

const COLORS = {
	gamepass: {
		"1784219262": Color3.fromRGB(55, 189, 241),
		"1784211301": Color3.fromRGB(236, 132, 35),
		"1784405049": Color3.fromRGB(144, 34, 233),
	} as Record<string, Color3>,
	subscription: {
		[VIP_SUBSCRIPTION_PRODUCT_ID]: Color3.fromRGB(255, 173, 32),
	} as Record<string, Color3>,
};

function RobuxShopMenuComponent({ visible }: RobuxShopMenuProps) {
	const px = usePx();
	const clientStateController = Modding.resolveSingleton(ClientStateController);

	const [vipSubscriptionRow, setVipSubscriptionRow] = useState<SubscriptionData | undefined>(undefined);

	useEffect(() => {
		const sync = () => setVipSubscriptionRow(clientStateController.SubscriptionData.get("VIP"));
		sync();
		const connection = Events.SubscriptionStatusUpdate.connect(sync);
		return () => connection.Disconnect();
	}, [clientStateController]);

	useEffect(() => {
		if (visible) setVipSubscriptionRow(clientStateController.SubscriptionData.get("VIP"));
	}, [visible, clientStateController]);

	const [gamepassStatusRevision, setGamepassStatusRevision] = useState(0);
	useEffect(() => {
		const connection = Events.GamepassStatusUpdate.connect(() => {
			setGamepassStatusRevision((n) => n + 1);
		});
		return () => connection.Disconnect();
	}, []);

	const diamondsProductArray = useMemo(() => {
		const products: number[] = [];
		clientStateController.RobuxProducts.DeveloperProducts.forEach((category, productId) => {
			if (category === "Gems") {
				const numericId = tonumber(productId);
				if (numericId !== undefined) products.push(numericId);
			}
		});

		return products;
	}, [clientStateController.RobuxProducts]);

	const diamondTiles = useMemo(() => {
		const tiles: JSX.Element[] = [];

		diamondsProductArray.forEach((productId) => {
			const productIdStr = tostring(productId);
			const info = clientStateController.ProductInfo.get(productIdStr) as DeveloperProductInfo | undefined;
			if (info) {
				tiles.push(<DiamondTile info={info} key={productId} />);
			}
		});

		return tiles;
	}, [diamondsProductArray, clientStateController.ProductInfo]);

	const subscriptionTiles = useMemo(() => {
		const subscriptions = clientStateController.RobuxProducts.Subscriptions;
		const tiles: JSX.Element[] = [];

		subscriptions.forEach((subscriptionId) => {
			const info = clientStateController.ProductInfo.get(tostring(subscriptionId)) as SubscriptionInfo | undefined;
			if (!info) return;

			const iconId = (info as unknown as { IconImageAssetId?: number }).IconImageAssetId;
			const image =
				subscriptionId === VIP_SUBSCRIPTION_PRODUCT_ID
					? VIP_SUBSCRIPTION_IMAGE
					: typeIs(iconId, "number") && iconId > 0
						? `rbxassetid://${iconId}`
						: "rbxassetid://85064031907597";

			tiles.push(
				<GamepassTile
					option="subscription"
					info={info}
					layoutOrder={info.PriceTier ?? 0}
					color={COLORS.subscription[subscriptionId] ?? Color3.fromRGB(255, 173, 32)}
					image={image}
					id={subscriptionId}
					key={`subscription-${subscriptionId}`}
					subscriptionRow={subscriptionId === VIP_SUBSCRIPTION_PRODUCT_ID ? vipSubscriptionRow : undefined}
				/>,
			);
		});

		return tiles;
	}, [clientStateController.RobuxProducts, clientStateController.ProductInfo, vipSubscriptionRow]);

	const gamepassTiles = useMemo(() => {
		const gamepasses = clientStateController.RobuxProducts.Gamepasses;
		const tiles: JSX.Element[] = [];

		gamepasses.forEach((productIdStr, gamepassKey) => {
			const info = clientStateController.ProductInfo.get(productIdStr) as GamePassProductInfo | undefined;
			if (!info) return;
			const owns = clientStateController.GamepassStatuses.get(gamepassKey) === true;
			tiles.push(
				<GamepassTile
					option="gamepass"
					info={info}
					layoutOrder={info.PriceInRobux ?? 0}
					color={COLORS.gamepass[productIdStr] ?? palette.blue}
					image={`rbxthumb://type=GamePass&id=${productIdStr}&w=150&h=150`}
					id={tonumber(productIdStr)!}
					key={`gamepass-${productIdStr}`}
					gamepassOwned={owns}
				/>,
			);
		});

		return tiles;
	}, [clientStateController.RobuxProducts, clientStateController.ProductInfo, gamepassStatusRevision]);

	return (
		<MenuCore>
			<frame
				AnchorPoint={new Vector2(0.5, 0.5)}
				Size={new UDim2(0, px(520), 0, px(470))}
				Position={new UDim2(0.5, 0, 0.5, 0)}
				BackgroundColor3={palette.background1}
				Visible={visible}
			>
				<Corner roundness="small" />
				<CloseButton
					native={{
						Size: new UDim2(0, px(21), 0, px(21)),
						Position: new UDim2(1, px(-24), 0, px(24)),
						AnchorPoint: new Vector2(1, 0),
					}}
					event={{ Activated: handleCloseButton }}
				/>
				<TextLabel
					typeface="Sans"
					weight="Bold"
					native={{
						Text: ROBUX_SHOP_TITLE,
						TextSize: px(28),
						Size: new UDim2(0, px(320), 0, px(28)),
						Position: new UDim2(0, px(24), 0, px(21)),
						TextXAlignment: Enum.TextXAlignment.Left,
					}}
				/>
				<scrollingframe
					AnchorPoint={new Vector2(0.5, 1)}
					Position={new UDim2(0.5, 0, 1, px(-24))}
					Size={new UDim2(1, px(-48), 1, px(-90))}
					CanvasSize={new UDim2(0, 0, 0, 0)}
					AutomaticCanvasSize={Enum.AutomaticSize.Y}
					ScrollBarImageTransparency={1}
					ScrollBarThickness={0}
					BackgroundTransparency={1}
				>
					<uilistlayout
						Padding={new UDim(0, px(10))}
						Wraps={true}
						FillDirection={Enum.FillDirection.Horizontal}
						HorizontalAlignment={Enum.HorizontalAlignment.Center}
						SortOrder={Enum.SortOrder.LayoutOrder}
					/>
					<ScrollingFrameSection title="VIP" layoutOrder={0}>
						{subscriptionTiles}
					</ScrollingFrameSection>
					<ScrollingFrameSection title="Gamepasses" layoutOrder={1}>
						{gamepassTiles}
					</ScrollingFrameSection>
					<ScrollingFrameSection title="Gems" layoutOrder={2}>
						{diamondTiles}
					</ScrollingFrameSection>
					<ScrollingFrameSection title="" layoutOrder={3}>
						{[]}
					</ScrollingFrameSection>
				</scrollingframe>
			</frame>
		</MenuCore>
	);
}

export const RobuxShopMenu = React.memo(RobuxShopMenuComponent);
