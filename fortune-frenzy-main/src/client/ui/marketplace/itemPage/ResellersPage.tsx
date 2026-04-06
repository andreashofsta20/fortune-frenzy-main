import React, { useMemo, useReducer } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { TextLabel } from "client/ui/core/TextLabel";
import { palette } from "client/utils/palette";
import { MARKETPLACE_NO_RESELLERS_DESCRIPTION, MARKETPLACE_NO_RESELLERS_TITLE } from "shared/util/strings";
import { ItemListing } from "typings/APIResponses";
import { ItemPageReseller } from "./Reseller";
import { addCommasToNumber } from "shared/util/number-utils";
import { usePxScale } from "client/hooks/use-scale";
import { VirtualizedScrollingFrame } from "../../core/VirtualizedScrollingFrame";

interface Props {
	listings?: ItemListing[];
	position: React.Binding<UDim2>;

	currentConfirmationPrompt: {
		enabled: boolean;
		listing: ItemListing | undefined;
		directItemId?: string;
		directPrice?: number;
		directItemName?: string;
	};
	setCurrentConfirmationPrompt: (
		value: React.SetStateAction<{
			enabled: boolean;
			listing: ItemListing | undefined;
			directItemId?: string;
			directPrice?: number;
			directItemName?: string;
		}>,
	) => void;
	confirmationPromptTransparencyMotion: Ripple.Motion<number>;
	confirmationPromptBGTransparencyMotion: Ripple.Motion<number>;
	currentStatus: string;
}

const initialState = {
	firstVisibleTile: 0,
	lastVisibleTile: 10,
	canvasSize: new UDim2(1, 0, 0, 0),
};

type Action =
	| { type: "SET_FIRST_VISIBLE_TILE"; payload: number }
	| { type: "SET_LAST_VISIBLE_TILE"; payload: number }
	| { type: "SET_CANVAS_SIZE"; payload: UDim2 };

function reducer(state: typeof initialState, action: Action) {
	switch (action.type) {
		case "SET_FIRST_VISIBLE_TILE":
			return { ...state, firstVisibleTile: action.payload };
		case "SET_LAST_VISIBLE_TILE":
			return { ...state, lastVisibleTile: action.payload };
		case "SET_CANVAS_SIZE":
			return { ...state, canvasSize: action.payload };
		default:
			return state;
	}
}

export function ResellersPage({
	listings,
	position,
	currentConfirmationPrompt,
	setCurrentConfirmationPrompt,
	confirmationPromptTransparencyMotion,
	confirmationPromptBGTransparencyMotion,
	currentStatus,
}: Props) {
	const px = usePx();
	const pxScale = usePxScale();
	const [state, dispatch] = useReducer(reducer, initialState);

	const listingTiles = useMemo(() => {
		if (!listings || listings.size() === 0) return [];

		const sortListings = (a: ItemListing, b: ItemListing): boolean => {
			return (tonumber(a.price) || 0) < (tonumber(b.price) || 0);
		};

		listings.sort(sortListings);

		const tiles: JSX.Element[] = [];
		for (const listing of listings) {
			tiles.push(
				<ItemPageReseller
					key={listing.user_asset_id}
					title={`$${addCommasToNumber(tonumber(listing.price) || 0)}`}
					subtitle={`${listing.display_name} (@${listing.username})`}
					image={`rbxthumb://type=AvatarHeadShot&id=${listing.seller_id}&w=150&h=150`}
					buttonIcon="rbxassetid://11833005733"
					buttonText="Purchase"
					LayoutOrder={tiles.size()}
					activated={() => {
						if (!currentConfirmationPrompt.listing && !currentConfirmationPrompt.directItemId) {
							setCurrentConfirmationPrompt({ enabled: true, listing });
							confirmationPromptTransparencyMotion.tween(0, {
								time: 0.15,
								style: Enum.EasingStyle.Quad,
								direction: Enum.EasingDirection.Out,
							});
							confirmationPromptBGTransparencyMotion.tween(0.1, {
								time: 0.15,
								style: Enum.EasingStyle.Quad,
								direction: Enum.EasingDirection.Out,
							});
						}
					}}
				/>,
			);
		}

		return tiles;
	}, [listings, currentStatus, currentConfirmationPrompt]);

	const tileHeight = px(80) * pxScale();
	const listPaddingPx = px(10);
	const rowHeight = tileHeight + listPaddingPx;

	return (
		<frame BackgroundTransparency={1} Size={new UDim2(1, 0, 1, 0)} Position={position}>
			<VirtualizedScrollingFrame
				size={new UDim2(1, 0, 1, 0)}
				position={new UDim2(0, 0, 0, 0)}
				backgroundTransparency={1}
				scrollBarThickness={0}
				layout="list"
				listPadding={new UDim(0, listPaddingPx)}
				items={listingTiles}
				rowHeight={rowHeight}
				itemsPerRow={1}
			/>
			<frame Size={new UDim2(1, 0, 1, 0)} BackgroundTransparency={1} Visible={(listings ?? []).size() === 0}>
				<imagelabel
					Position={new UDim2(0, px(95), 0.5, 0)}
					Size={new UDim2(0, px(128), 0, px(128))}
					BackgroundTransparency={1}
					Image="rbxassetid://123361866154149"
					AnchorPoint={new Vector2(0, 0.5)}
				/>
				<TextLabel
					weight="Bold"
					typeface="Sans"
					native={{
						Position: new UDim2(0, px(239), 0, px(116)),
						Size: new UDim2(0, px(329), 0, px(23)),
						TextSize: px(25),
						Text: MARKETPLACE_NO_RESELLERS_TITLE,
						TextColor3: palette.primaryText,
						TextXAlignment: Enum.TextXAlignment.Left,
					}}
				/>
				<TextLabel
					weight="SemiBold"
					typeface="Sans"
					native={{
						Position: new UDim2(0, px(239), 0, px(146)),
						Size: new UDim2(0, px(337), 0, px(100)),
						TextSize: px(20),
						Text: MARKETPLACE_NO_RESELLERS_DESCRIPTION,
						TextColor3: palette.midText,
						TextXAlignment: Enum.TextXAlignment.Left,
						TextYAlignment: Enum.TextYAlignment.Top,
					}}
				/>
			</frame>
		</frame>
	);
}
