import React, { useState, useEffect } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { palette } from "client/utils/palette";
import { Leaderboard, LeaderboardType } from "client/ui/leaderboards/leaderboard";
import { handleCloseButton } from "client/utils/menu-utils";
import { Button } from "../core/Button";
import { CloseButton } from "../core/CloseButton";
import { TextLabel } from "../core/TextLabel";
import { MenuCore } from "../navigation/MenuCore";
import { Corner } from "../tools/Corner";

interface Props {
	visible: boolean;
	flashMenu: () => void;
}

function LeaderboardsMenuComponent({ visible, flashMenu }: Props) {
	const px = usePx();
	const [selectedBoard, setSelectedBoard] = useState<LeaderboardType>("cash");

	useEffect(() => {
		if (!visible) return;
		flashMenu();
	}, [visible, flashMenu]);

	return (
		<MenuCore>
			<frame
				Size={new UDim2(0, px(900), 0, px(470))}
				Position={new UDim2(0.5, 0, 0.5, 0)}
				AnchorPoint={new Vector2(0.5, 0.5)}
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
						Text: "Leaderboards",
						TextSize: px(28),
						Size: new UDim2(0, px(320), 0, px(28)),
						Position: new UDim2(0, px(24), 0, px(21)),
						TextXAlignment: Enum.TextXAlignment.Left,
					}}
				/>
				<TextLabel
					typeface="Sans"
					weight="SemiBold"
					native={{
						Text: "Top earners and collections, updated live",
						TextColor3: palette.darkerText,
						TextSize: px(15),
						Size: new UDim2(0, px(360), 0, px(16)),
						Position: new UDim2(0, px(24), 0, px(49)),
						TextXAlignment: Enum.TextXAlignment.Left,
					}}
				/>
				<Button
					size={new UDim2(0, px(120), 0, px(32))}
					position={new UDim2(0, px(24), 0, px(70))}
					text="Cash"
					typeface="Sans"
					weight="SemiBold"
					backgroundColor={selectedBoard === "cash" ? palette.blue : palette.background3}
					textColor={selectedBoard === "cash" ? palette.blueText : palette.primaryText}
					event={{ Activated: () => setSelectedBoard("cash") }}
				/>
				<Button
					size={new UDim2(0, px(120), 0, px(32))}
					position={new UDim2(0, px(154), 0, px(70))}
					text="Value"
					typeface="Sans"
					weight="SemiBold"
					backgroundColor={selectedBoard === "value" ? palette.blue : palette.background3}
					textColor={selectedBoard === "value" ? palette.blueText : palette.primaryText}
					event={{ Activated: () => setSelectedBoard("value") }}
				/>
				<frame
					BackgroundTransparency={1}
					Position={new UDim2(0.5, 0, 0, px(112))}
					AnchorPoint={new Vector2(0.5, 0)}
					Size={new UDim2(0, px(850), 0, px(332))}
				>
					<Leaderboard lb={selectedBoard} />
				</frame>
			</frame>
		</MenuCore>
	);
}

export const LeaderboardsMenu = React.memo(LeaderboardsMenuComponent);
