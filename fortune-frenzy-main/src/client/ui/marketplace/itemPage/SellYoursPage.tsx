import React, { useMemo, useReducer } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { Item, ItemListing } from "typings/APIResponses";
import { SellYoursTile } from "./SellYoursTile";
import { usePxScale } from "client/hooks/use-scale";
import { VirtualizedScrollingFrame } from "../../core/VirtualizedScrollingFrame";
import { Players } from "@rbxts/services";

interface Props {
	ownedCopies?: string[];
	listings?: ItemListing[];
	position: React.Binding<UDim2>;
	rawData?: {
		data: Item;
		rarity: string;
	};
	currentStatus: string;
	currentConfirmationPrompt: {
		enabled: boolean;
		listing: ItemListing | undefined;
	};
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

export function SellYoursPage({
	position,
	ownedCopies,
	listings = [],
	rawData,
	currentStatus,
	currentConfirmationPrompt,
}: Props) {
	const px = usePx();
	const pxScale = usePxScale();
	const [state, dispatch] = useReducer(reducer, initialState);

	const ownedTiles = useMemo(() => {
		const localUserId = tostring(Players.LocalPlayer.UserId);
		const ownListingsByUaid = new Set<string>();

		for (const listing of listings) {
			if (listing.seller_id !== localUserId) continue;
			ownListingsByUaid.add(listing.user_asset_id);
		}

		const copyIdByUaid = new Map<string, string>();
		if (ownedCopies) {
			for (const copy of ownedCopies) {
				const [uaid, copyId] = copy.split("|");
				if (uaid.size() === 0) continue;
				copyIdByUaid.set(uaid, copyId);
			}
		}

		for (const listedUaid of ownListingsByUaid) {
			if (!copyIdByUaid.has(listedUaid)) {
				copyIdByUaid.set(listedUaid, "");
			}
		}

		if (copyIdByUaid.size() === 0) return [];

		const sortedCopies = new Array<{ uaid: string; copyId: string; listed: boolean }>();
		for (const [uaid, copyId] of copyIdByUaid) {
			sortedCopies.push({
				uaid,
				copyId,
				listed: ownListingsByUaid.has(uaid),
			});
		}

		sortedCopies.sort((a, b) => {
			if (a.listed && !b.listed) return true;
			if (!a.listed && b.listed) return false;

			const aCopyNumber = tonumber(a.copyId) ?? math.huge;
			const bCopyNumber = tonumber(b.copyId) ?? math.huge;
			return aCopyNumber < bCopyNumber;
		});

		const tiles: JSX.Element[] = [];
		let i = 0;

		for (const copy of sortedCopies) {
			i++;
			const uaid = copy.uaid;
			const copy_id = copy.copyId;
			const unlistMode = copy.listed;
			const hasCopyNumber = tonumber(copy_id) !== undefined;

			tiles.push(
				<SellYoursTile
					key={uaid}
					title={hasCopyNumber ? `Copy #${copy_id}` : "Listed Copy"}
					subtitle={`ID: ${uaid}`}
					image={`rbxthumb://type=Asset&id=${rawData?.data.asset_id}&w=420&h=420`}
					buttonText={unlistMode ? "Unlist" : "List for Sale"}
					LayoutOrder={i}
					activated={() => {}}
					uaid={uaid}
					unlistMode={unlistMode}
					itemId={rawData?.data.id ?? ""}
				/>,
			);
		}

		return tiles;
	}, [listings, ownedCopies, rawData?.data.asset_id, rawData?.data.id]);

	const tileHeight = px(80) * pxScale();
	const listPaddingPx = px(10);
	const rowHeight = tileHeight + listPaddingPx;

	return (
		<frame BackgroundTransparency={1} Size={new UDim2(1, 0, 1, 0)} Position={position}>
			<uipadding
				PaddingLeft={new UDim(0, px(1))}
				PaddingRight={new UDim(0, px(1))}
				PaddingTop={new UDim(0, px(1))}
			/>
			<VirtualizedScrollingFrame
				size={new UDim2(1, 0, 1, 0)}
				position={new UDim2(0, 0, 1, 0)}
				anchorPoint={new Vector2(0, 1)}
				backgroundTransparency={1}
				scrollBarThickness={0}
				layout="list"
				listPadding={new UDim(0, listPaddingPx)}
				items={ownedTiles}
				rowHeight={rowHeight}
				itemsPerRow={1}
			/>
		</frame>
	);
}
