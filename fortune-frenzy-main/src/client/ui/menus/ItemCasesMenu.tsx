import React, { useState } from "@rbxts/react";
import { MenuCore } from "../navigation/MenuCore";
import { CaseSelectorPage } from "../item_cases/CaseSelectorPage";
import { Case } from "typings/APIResponses";
import { CasePage } from "../item_cases/CasePage";
import { SpinnerPage } from "../item_cases/SpinnerPage";

interface Props {
	visible: boolean;
	flashMenu: () => void;
}

function ItemCasesMenuComponent({ visible, flashMenu }: Props) {
	const [currentCase, setCurrentCase] = useState<Case | undefined>(undefined);
	const [spinnerState, setSpinnerState] = useState<{
		status: "none" | "loading" | "spinning" | "done" | "ready";
		speed: number;
		winningItem?: string;
		winningIndex?: number;
		isLucky?: boolean;
	}>({
		status: "none",
		speed: 5,
		winningItem: undefined,
		winningIndex: undefined,
		isLucky: false,
	});

	return (
		<MenuCore>
			<frame
				Size={new UDim2(1, 0, 1, 0)}
				Position={new UDim2(0.5, 0, 0.5, 0)}
				AnchorPoint={new Vector2(0.5, 0.5)}
				BackgroundTransparency={1}
				Visible={visible}
			>
				<CaseSelectorPage
					visible={currentCase === undefined}
					currentCase={currentCase}
					setCurrentCase={setCurrentCase}
				/>
				<CasePage
					currentCase={currentCase}
					setCurrentCase={setCurrentCase}
					visible={currentCase !== undefined && spinnerState.status === "none"}
					spinnerState={spinnerState}
					setSpinnerState={setSpinnerState}
					flashMenu={flashMenu}
				/>
				<SpinnerPage
					visible={spinnerState.status !== "none"}
					currentCase={currentCase}
					spinnerState={spinnerState}
					setSpinnerState={setSpinnerState}
				/>
			</frame>
		</MenuCore>
	);
}

export const ItemCasesMenu = React.memo(ItemCasesMenuComponent);
