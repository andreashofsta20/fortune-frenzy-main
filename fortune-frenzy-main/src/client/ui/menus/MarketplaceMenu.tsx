import React, { useEffect, useRef } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { palette } from "client/utils/palette";
import { MenuCore } from "../navigation/MenuCore";
import { MainMarketplaceGrid } from "../marketplace/MainMarketplaceGrid";
import { MarketplaceItemPage } from "../marketplace/MarketplaceItemPage";
import { Corner } from "../tools/Corner";
import { useAtom } from "@rbxts/react-charm";
import { marketplaceStatusAtom } from "client/utils/global-state";

interface Props {
	visible: boolean;
	flashMenu: () => void;
}

function MarketplaceMenuComponent({ visible, flashMenu }: Props) {
	const px = usePx();
	const frameRef = useRef<Frame>(undefined);
	const currentStatus = useAtom(marketplaceStatusAtom);

	useEffect(() => {
		flashMenu();
	}, [currentStatus]);

	return (
		<MenuCore>
			<frame
				ref={frameRef}
				Size={new UDim2(0, px(900), 0, px(470))}
				Position={new UDim2(0.5, 0, 0.5, 0)}
				AnchorPoint={new Vector2(0.5, 0.5)}
				BackgroundColor3={palette.background1}
				Visible={visible}
			>
				<Corner roundness="small" />
				<MainMarketplaceGrid parentFrameRef={frameRef} visible={currentStatus === "none"} />
				<MarketplaceItemPage
					currentStatus={currentStatus}
					visible={currentStatus !== "none"}
					flashMenu={flashMenu}
				/>
			</frame>
		</MenuCore>
	);
}

export const MarketplaceMenu = React.memo(MarketplaceMenuComponent);
