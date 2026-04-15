import React, { useEffect, useMemo, useState, useCallback, useRef } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { palette } from "client/utils/palette";
import { CloseButton } from "../core/CloseButton";
import { Modding } from "@flamework/core";
import { ClientStateController } from "client/controllers/ClientStateController";
import getRarity from "shared/util/get-item-rarity";
import { capitalizeFirstChar } from "shared/util/string-utils";
import { Item, ItemListing } from "typings/APIResponses";
import {
	FONTS,
	MARKETPLACE_ITEM_PAGE_BUY,
	MARKETPLACE_ITEM_PAGE_RESELLERS,
	MARKETPLACE_ITEM_PAGE_SELL_YOURS,
} from "shared/util/strings";
import { useMotion } from "@rbxts/pretty-react-hooks";
import { ConfirmationPrompt } from "./ConfirmationPrompt";
import { ItemPageInfoSection } from "./itemPage/InfoSection";
import { ItemPageStatsSection } from "./itemPage/StatsSection";
import { ResellersPage } from "./itemPage/ResellersPage";
import { BuyPage } from "./itemPage/BuyPage";
import { SellYoursPage } from "./itemPage/SellYoursPage";
import {
	activeMarketplacePageAtom,
	activeMenuAtom,
	marketplaceBackContextAtom,
	marketplaceStatusAtom,
} from "client/utils/global-state";
import { useAtom } from "@rbxts/react-charm";
import { Players } from "@rbxts/services";
import { requestServer } from "client/utils/send-function";
import { Functions } from "client/network";
import { isItemDirectShopPurchaseBlocked } from "shared/util/is-item-direct-shop-blocked";
import { peek } from "@rbxts/charm";
import {
	TUTORIAL_STEPS,
	advanceTutorialAction,
	registerTutorialTarget,
	tutorialStateAtom,
	unregisterTutorialTarget,
	TUTORIAL_TARGET_IDS,
} from "client/tutorial/tutorial-state";

interface Props {
	currentStatus: string;
	visible: boolean;
	flashMenu: () => void;
}

interface ItemPageData {
	rawData?: { data: Item; rarity: string };
	listings?: ItemListing[];
	ownedCopies?: string[];
}

export function MarketplaceItemPage({ currentStatus, visible, flashMenu }: Props) {
	const px = usePx();
	const clientStateController = Modding.resolveSingleton(ClientStateController);
	const [itemPageData, setItemPageData] = useState<ItemPageData>({});
	const currentPage = useAtom(activeMarketplacePageAtom);
	const [animatePageChange, setAnimatePageChange] = useState(true);
	const [currentConfirmationPrompt, setCurrentConfirmationPrompt] = useState<{
		enabled: boolean;
		listing: ItemListing | undefined;
		directItemId?: string;
		directPrice?: number;
		directItemName?: string;
	}>({ enabled: false, listing: undefined });
	const [confirmationPromptTransparency, confirmationPromptTransparencyMotion] = useMotion(1);
	const [confirmationPromptBGTransparency, confirmationPromptBGTransparencyMotion] = useMotion(1);
	const pageOrder = [MARKETPLACE_ITEM_PAGE_RESELLERS, MARKETPLACE_ITEM_PAGE_BUY, MARKETPLACE_ITEM_PAGE_SELL_YOURS];
	const pagePositions = useMemo(() => {
		return pageOrder.reduce<Record<string, LuaTuple<[React.Binding<UDim2>, Ripple.Motion<UDim2>]>>>(
			(acc, page, index) => {
				const position = new UDim2(index, 0, 0, 0);
				acc[page] = useMotion(position);
				return acc;
			},
			{},
		);
	}, [pageOrder]);
	const backButtonContext = useAtom(marketplaceBackContextAtom);
	const tutorialSnap = useAtom(tutorialStateAtom);

	useEffect(() => {
		if (currentStatus === "none") return;

		const id = currentStatus.gsub("^item_info_", "")[0];
		const data = clientStateController.ItemInfo.get(id);

		if (data) {
			const rarity = getRarity(data.value || 0);
			setItemPageData((prev) => ({ ...prev, rawData: { data, rarity } }));
		}

		let pollAlive = true;
		const refreshCatalogRow = () => {
			task.spawn(async () => {
				const result = await requestServer(
					Functions.Marketplace.RefreshMarketplaceItemFromApi,
					"Failed to refresh item stats",
					id,
				);
				if (result === -1 || result === undefined) return;
				const updatedRarity = getRarity(result.value || 0);
				setItemPageData((prev) => ({
					...prev,
					rawData: { data: result, rarity: updatedRarity },
				}));
			});
		};

		refreshCatalogRow();
		task.spawn(() => {
			while (pollAlive) {
				task.wait(25);
				if (!pollAlive) break;
				refreshCatalogRow();
			}
		});

		const handleListingsUpdate = (itemID: string) => {
			if (id === itemID) {
				const updatedListings = clientStateController.ItemListings.get(id);
				setItemPageData((prev) => ({ ...prev, listings: updatedListings || [] }));
				refreshCatalogRow();
			}
		};

		const handleInventoryUpdate = (inventory: Map<string, string[]>) => {
			setItemPageData((prev) => ({ ...prev, ownedCopies: inventory.get(id) || [] }));
		};

		const handleItemInfoUpdate = (itemID: string) => {
			if (id === itemID) {
				const updatedData = clientStateController.ItemInfo.get(id);
				if (updatedData) {
					const updatedRarity = getRarity(updatedData.value || 0);
					setItemPageData((prev) => ({
						...prev,
						rawData: { data: updatedData, rarity: updatedRarity },
					}));
				}
			}
		};

		const listingsUpdateConnection = clientStateController.ListingsEvent.Connect(handleListingsUpdate);
		const inventoryUpdateConnection = clientStateController.InventoryChangedEvent.Connect(handleInventoryUpdate);
		const itemInfoUpdateConnection = clientStateController.ItemInfoChangedEvent.Connect(handleItemInfoUpdate);

		handleListingsUpdate(id);
		task.spawn(async () => {
			const refreshedListings = await clientStateController.GetCachedListingsForItem(id, true);
			setItemPageData((prev) => ({
				...prev,
				listings: refreshedListings,
			}));
		});
		handleInventoryUpdate(clientStateController.Inventory);
		handleItemInfoUpdate(id);

		setAnimatePageChange(false);
		activeMarketplacePageAtom(MARKETPLACE_ITEM_PAGE_RESELLERS);

		return () => {
			pollAlive = false;
			listingsUpdateConnection.Disconnect();
			inventoryUpdateConnection.Disconnect();
			itemInfoUpdateConnection.Disconnect();
			setItemPageData((prev) => ({ ...prev, listings: [] }));
		};
	}, [currentStatus, clientStateController]);

	useEffect(() => {
		const currentIndex = pageOrder.indexOf(currentPage);

		pageOrder.forEach((page, index) => {
			const offset = index - currentIndex;
			if (animatePageChange) {
				pagePositions[page][1].spring(new UDim2(offset, 0, 0, 0), {
					mass: 1.4,
					tension: 285,
					friction: 50,
				});
			} else {
				pagePositions[page][1].set(new UDim2(offset, 0, 0, 0));
			}
		});

		if (!animatePageChange) setAnimatePageChange(true);
	}, [currentPage, pagePositions, animatePageChange]);

	const handlePageChange = useCallback((title: string) => {
		activeMarketplacePageAtom(title);
	}, []);

	const tutorialBlocksNonBuyTab = useCallback((title: string) => {
		const tut = peek(tutorialStateAtom);
		if (!tut.active) return false;
		const id = TUTORIAL_STEPS[tut.stepIndex]?.actionId;
		if (
			id === "marketplace_open_buy_tab" ||
			id === "marketplace_click_direct_purchase" ||
			id === "marketplace_confirm_direct_buy"
		) {
			return title !== MARKETPLACE_ITEM_PAGE_BUY;
		}
		return false;
	}, []);

	const buyTabButtonRef = useRef<TextButton | undefined>(undefined);

	useEffect(() => {
		const stepId = TUTORIAL_STEPS[tutorialSnap.stepIndex]?.actionId;
		const el = buyTabButtonRef.current;
		if (!el || !tutorialSnap.active || stepId !== "marketplace_open_buy_tab") return;
		registerTutorialTarget(TUTORIAL_TARGET_IDS.marketplaceBuyTab, el);
		return () => unregisterTutorialTarget(TUTORIAL_TARGET_IDS.marketplaceBuyTab, el);
	}, [tutorialSnap.active, tutorialSnap.stepIndex, currentPage, currentStatus, itemPageData.rawData]);

	const pageButtons = useMemo(() => {
		const rawData = itemPageData.rawData;
		const catalogItem = rawData?.data;
		if (!rawData || !catalogItem) return [];
		const localUserId = tostring(Players.LocalPlayer.UserId);
		const hasOwnActiveListings = (itemPageData.listings ?? []).some((listing) => listing.seller_id === localUserId);

		return pageOrder.map((title, index) => {
			if (
				title === MARKETPLACE_ITEM_PAGE_SELL_YOURS &&
				itemPageData.ownedCopies?.size() === 0 &&
				!hasOwnActiveListings
			)
				return undefined;

			if (title === MARKETPLACE_ITEM_PAGE_BUY && isItemDirectShopPurchaseBlocked(catalogItem))
				return undefined;

			return (
				<textbutton
					ref={
						title === MARKETPLACE_ITEM_PAGE_BUY
							? (el: TextButton | undefined) => {
									buyTabButtonRef.current = el;
								}
							: undefined
					}
					FontFace={new Font(FONTS.Sans, Enum.FontWeight.Bold, Enum.FontStyle.Normal)}
					TextColor3={currentPage === title ? palette.primaryText : palette.darkerText}
					TextSize={px(23)}
					Size={new UDim2(0, 0, 0, px(23))}
					AutomaticSize={Enum.AutomaticSize.X}
					Text={capitalizeFirstChar(title)}
					BackgroundTransparency={1}
					LayoutOrder={index}
					Selectable={!tutorialBlocksNonBuyTab(title)}
					Active={!tutorialBlocksNonBuyTab(title)}
					Event={{
						Activated: () => {
							if (tutorialBlocksNonBuyTab(title)) return;
							handlePageChange(title);
							const tut = peek(tutorialStateAtom);
							if (
								tut.active &&
								TUTORIAL_STEPS[tut.stepIndex]?.actionId === "marketplace_open_buy_tab" &&
								title === MARKETPLACE_ITEM_PAGE_BUY
							) {
								advanceTutorialAction("marketplace_open_buy_tab");
							}
						},
					}}
				/>
			);
		});
	}, [
		itemPageData.rawData,
		itemPageData.ownedCopies,
		itemPageData.listings,
		currentPage,
		handlePageChange,
		tutorialBlocksNonBuyTab,
	]);

	return (
		<frame BackgroundTransparency={1} Size={new UDim2(1, 0, 1, 0)} Visible={visible}>
			<ConfirmationPrompt
				currentConfirmationPrompt={currentConfirmationPrompt}
				setCurrentConfirmationPrompt={setCurrentConfirmationPrompt}
				transparency={confirmationPromptTransparency}
				confirmationPromptTransparencyMotion={confirmationPromptTransparencyMotion}
				backgroundTransparency={confirmationPromptBGTransparency}
				backgroundTransparencyMotion={confirmationPromptBGTransparencyMotion}
			/>
			<CloseButton
				native={{
					Size: new UDim2(0, px(21), 0, px(21)),
					Position: new UDim2(1, px(-24), 0, px(24)),
					AnchorPoint: new Vector2(1, 0),
					Image: "rbxassetid://114306723191635",
				}}
				event={{
					Activated: () => {
						if (backButtonContext === "marketplace") {
							marketplaceStatusAtom("none");
						} else if (backButtonContext === "inventory") {
							marketplaceStatusAtom("none");
							activeMenuAtom("Inventory");
							marketplaceBackContextAtom("marketplace");
						}
					},
				}}
			/>
			<ItemPageInfoSection data={itemPageData.rawData} />
			<ItemPageStatsSection data={itemPageData.rawData} />
			<frame
				BackgroundTransparency={1}
				Position={new UDim2(0, px(518), 0, px(25))}
				Size={new UDim2(0, px(542), 0, px(23))}
				AnchorPoint={new Vector2(0.5, 0)}
			>
				<uilistlayout FillDirection={Enum.FillDirection.Horizontal} Padding={new UDim(0, px(15))} />
				{pageButtons}
			</frame>
			<frame
				BackgroundTransparency={1}
				Size={new UDim2(0, px(641), 0, px(305))}
				Position={new UDim2(0, px(238), 0, px(58))}
				ClipsDescendants={true}
			>
				<ResellersPage
					listings={itemPageData.listings}
					position={pagePositions[MARKETPLACE_ITEM_PAGE_RESELLERS][0]}
					currentConfirmationPrompt={currentConfirmationPrompt}
					setCurrentConfirmationPrompt={setCurrentConfirmationPrompt}
					confirmationPromptBGTransparencyMotion={confirmationPromptBGTransparencyMotion}
					confirmationPromptTransparencyMotion={confirmationPromptTransparencyMotion}
					currentStatus={currentStatus}
				/>
				<BuyPage
					itemData={itemPageData.rawData?.data}
					position={pagePositions[MARKETPLACE_ITEM_PAGE_BUY][0]}
					currentConfirmationPrompt={currentConfirmationPrompt}
					setCurrentConfirmationPrompt={setCurrentConfirmationPrompt}
					confirmationPromptBGTransparencyMotion={confirmationPromptBGTransparencyMotion}
					confirmationPromptTransparencyMotion={confirmationPromptTransparencyMotion}
				/>
				<SellYoursPage
					ownedCopies={itemPageData.ownedCopies}
					position={pagePositions[MARKETPLACE_ITEM_PAGE_SELL_YOURS][0]}
					rawData={itemPageData.rawData}
					currentStatus={currentStatus}
					currentConfirmationPrompt={currentConfirmationPrompt}
					listings={itemPageData.listings}
				/>
			</frame>
		</frame>
	);
}
