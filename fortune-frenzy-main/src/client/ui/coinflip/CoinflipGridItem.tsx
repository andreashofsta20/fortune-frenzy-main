import React, { useMemo } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { palette } from "client/utils/palette";
import { Coinflip } from "typings/APIResponses";
import { SectionStroke } from "../tools/SectionStroke";
import { resolveStakeItemId } from "client/utils/trade-stake-token";
import { Corner } from "../tools/Corner";
import { TextLabel } from "../core/TextLabel";
import { addCommasToNumber } from "shared/util/number-utils";
import { Modding } from "@flamework/core";
import { ClientStateController } from "client/controllers/ClientStateController";
import { Button } from "../core/Button";
import { COINS } from "shared/util/strings";
import { setValue } from "client/utils/color-utils";
import { LoadingCircle } from "../core/LoadingCircle";

const BOT_THUMBNAIL_USER_IDS = ["1", "156", "1787431079", "3566000179", "5518226836"];

function pickDeterministicBotThumbnailUserId(seed: string): string {
	const digitsOnly = seed.gsub("%D", "")[0];
	const numericSeed = tonumber(digitsOnly.sub(1, 9));
	const normalizedSeed = numericSeed !== undefined ? math.abs(math.floor(numericSeed)) : seed.size();
	const index = normalizedSeed % BOT_THUMBNAIL_USER_IDS.size();
	return BOT_THUMBNAIL_USER_IDS[index];
}

interface Props {
	coinflip: Coinflip;
	LayoutOrder: number;
	Activated: (rbx: ImageButton, inputObject: InputObject, clickCount: number) => void;
}

export const UserHeadshot = ({
	player,
	coin,
	userId,
	size,
	position,
	anchorPoint,
	occupied = true,
}: {
	player: 1 | 2;
	coin: 1 | 2;
	userId: string;
	size?: UDim2;
	position?: UDim2;
	anchorPoint?: Vector2;
	/** When false, show an empty seat (no avatar) — avoids placeholder user ids like "1". */
	occupied?: boolean;
}) => {
	const px = usePx();
	const color = palette.coins[COINS[coin].name as "Heads" | "Tails"];
	const resolvedAnchor = anchorPoint ?? (player === 1 ? new Vector2(0, 0) : new Vector2(1, 0));
	const resolvedPosition =
		position ?? (player === 1 ? new UDim2(0, px(10), 0, px(10)) : new UDim2(1, px(-10), 0, px(10)));
	const resolvedSize = size ?? new UDim2(0, px(55), 0, px(55));

	const coinBadge = (
		<imagelabel
			AnchorPoint={player === 1 ? new Vector2(1, 1) : new Vector2(0, 1)}
			Position={player === 1 ? new UDim2(1, px(5), 1, px(5)) : new UDim2(0, px(-5), 1, px(5))}
			Size={new UDim2(0, px(25), 0, px(25))}
			Image={COINS[coin].icon}
			BackgroundTransparency={1}
		/>
	);

	if (!occupied) {
		return (
			<frame
				AnchorPoint={resolvedAnchor}
				Position={resolvedPosition}
				Size={resolvedSize}
				BackgroundColor3={setValue(color, 40)}
				BackgroundTransparency={0.35}
			>
				<Corner roundness="full" />
				<uistroke Thickness={px(1)} Color={color} Transparency={0.45} />
				{coinBadge}
			</frame>
		);
	}

	const thumbnailUserId = (() => {
		const parsed = tonumber(userId);
		if (parsed !== undefined && parsed > 0) return tostring(math.floor(parsed));
		return pickDeterministicBotThumbnailUserId(userId);
	})();

	return (
		<imagelabel
			AnchorPoint={resolvedAnchor}
			Position={resolvedPosition}
			Size={resolvedSize}
			Image={`rbxthumb://type=AvatarHeadShot&id=${thumbnailUserId}&w=150&h=150`}
			BackgroundColor3={setValue(color, 80)}
		>
			<Corner roundness="full" />
			<uistroke Thickness={px(1)} Color={color} />
			{coinBadge}
		</imagelabel>
	);
};

export function CoinflipGridItem({ coinflip, LayoutOrder, Activated }: Props) {
	const px = usePx();
	const clientStateController = Modding.resolveSingleton(ClientStateController);

	const coinflipInfo = useMemo(() => {
		const calculateTotalValue = (items: string[]) => {
			return items.reduce((acc, item) => {
				const itemId = resolveStakeItemId(item);
				const itemData = clientStateController.ItemInfo.get(itemId);
				return itemData ? acc + itemData.value : acc;
			}, 0);
		};

		const itemPreviewTiles: Array<React.Element> = [];
		const allItems = [...coinflip.player1_items, ...(coinflip.player2_items || [])];

		let i = 0;
		for (const item of allItems) {
			if (i === 5) {
				itemPreviewTiles.push(
					<imagelabel
						BackgroundColor3={palette.background2}
						Size={new UDim2(0, px(39), 0, px(39))}
						ImageTransparency={1}
						ZIndex={i}
						LayoutOrder={i}
					>
						<Corner roundness="full" />
						<uistroke Thickness={px(4)} Color={palette.background2} />
						<frame BackgroundTransparency={1} Size={new UDim2(1, 0, 1, 0)} ZIndex={0}>
							<SectionStroke />
							<Corner roundness="full" />
						</frame>
						<TextLabel
							typeface="Sans"
							weight="SemiBold"
							native={{
								Text: `+${allItems.size() - 6}`,
								TextColor3: palette.primaryText,
								Size: UDim2.fromScale(1, 1),
								Position: UDim2.fromScale(0.5, 0.5),
								AnchorPoint: new Vector2(0.5, 0.5),
								TextSize: px(18),
							}}
						/>
					</imagelabel>,
				);

				break;
			}

			const itemId = resolveStakeItemId(item);
			const itemData = clientStateController.ItemInfo.get(itemId);
			if (itemData) {
				itemPreviewTiles.push(
					<imagelabel
						BackgroundColor3={palette.background2}
						Size={new UDim2(0, px(39), 0, px(39))}
						Image={`rbxthumb://type=Asset&id=${itemData.asset_id}&w=150&h=150`}
						ZIndex={i}
						LayoutOrder={i}
					>
						<Corner roundness="full" />
						<uistroke Thickness={px(4)} Color={palette.background2} />
						<frame BackgroundTransparency={1} Size={new UDim2(1, 0, 1, 0)} ZIndex={0}>
							<SectionStroke />
							<Corner roundness="full" />
						</frame>
					</imagelabel>,
				);
				i++;
			}
		}

		return {
			totalValue: calculateTotalValue(allItems),
			itemPreviewTiles,
		};
	}, [coinflip]);

	return (
		<frame BackgroundColor3={palette.background2} LayoutOrder={LayoutOrder}>
			<Corner roundness="small" />
			<SectionStroke />
			<UserHeadshot player={1} userId={coinflip.player1.id} coin={coinflip.player1_coin} />
			<UserHeadshot
				player={2}
				userId={coinflip.player2?.id ?? ""}
				coin={coinflip.player1_coin === 1 ? 2 : 1}
				occupied={coinflip.player2 !== undefined}
			/>
			<TextLabel
				typeface="Sans"
				weight="Bold"
				native={{
					Text: `${addCommasToNumber(coinflipInfo.totalValue)} Value`,
					TextColor3: palette.primaryText,
					Position: new UDim2(0.5, 0, 0, px(95)),
					Size: new UDim2(0, px(255), 0, px(16)),
					AnchorPoint: new Vector2(0.5, 1),
					TextSize: px(16),
				}}
			/>
			<TextLabel
				typeface="Sans"
				weight="SemiBold"
				native={{
					Text: `Created by @${coinflip.player1.username}`,
					TextColor3: palette.midText,
					Position: new UDim2(0.5, 0, 0, px(108)),
					Size: new UDim2(0, px(255), 0, px(13)),
					AnchorPoint: new Vector2(0.5, 1),
					TextSize: px(13),
				}}
			/>
			<frame
				BackgroundTransparency={1}
				Position={new UDim2(0, px(10), 0, px(120))}
				Size={new UDim2(0, px(160), 0, px(40))}
			>
				<uilistlayout
					Padding={new UDim(0, px(-15))}
					FillDirection={Enum.FillDirection.Horizontal}
					HorizontalAlignment={Enum.HorizontalAlignment.Left}
					SortOrder={Enum.SortOrder.LayoutOrder}
					VerticalAlignment={Enum.VerticalAlignment.Center}
				/>
				{coinflipInfo.itemPreviewTiles}
			</frame>
			<Button
				size={new UDim2(0, px(84), 0, px(32))}
				position={new UDim2(1, px(-10), 1, px(-10))}
				anchorPoint={new Vector2(1, 1)}
				typeface="Sans"
				weight="Medium"
				textSize={18}
				text="View"
				backgroundColor={palette.background2}
				textColor={palette.primaryText}
				event={{
					Activated,
				}}
			>
				<SectionStroke />
			</Button>
			{coinflip.status === "waiting_for_player" || coinflip.status === "awaiting_confirmation" ? (
				<LoadingCircle
					Size={new UDim2(0, px(30), 0, px(30))}
					Position={new UDim2(0.5, 0, 0.5, -px(43))}
					AnchorPoint={new Vector2(0.5, 0.5)}
				/>
			) : (
				<imagelabel
					Image={COINS[coinflip.winning_coin ?? 1].icon}
					AnchorPoint={new Vector2(0.5, 0.5)}
					BackgroundTransparency={1}
					Position={new UDim2(0.5, 0, 0.5, -45)}
					Size={new UDim2(0, 50, 0, 50)}
					Visible={coinflip.status === "completed"}
				/>
			)}
		</frame>
	);
}
