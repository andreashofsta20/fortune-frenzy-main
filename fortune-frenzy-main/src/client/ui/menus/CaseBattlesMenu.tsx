import React, { useEffect, useState } from "@rbxts/react";
import { MenuCore } from "../navigation/MenuCore";
import { BattleGrid } from "../case_battles/BattleGrid";
import { BattleBuilder } from "../case_battles/BattleBuilder";
import { CaseSelector } from "../case_battles/CaseSelector";
import { BattleViewing } from "../case_battles/BattleViewing";

interface Props {
	visible: boolean;
	flashMenu: () => void;
}

export const CaseBattlesMenu = React.memo(({ visible, flashMenu }: Props) => {
	const [currentPage, setCurrentPage] = useState<"grid" | "builder" | "case-selector" | "viewing">("grid");

	useEffect(() => {
		flashMenu();
	}, [currentPage]);

	return (
		<MenuCore scale={true}>
			<BattleGrid
				visible={currentPage === "grid" && visible}
				flashMenu={flashMenu}
				setCurrentPage={setCurrentPage}
			/>
			<BattleBuilder
				visible={currentPage === "builder" && visible}
				flashMenu={flashMenu}
				setCurrentPage={setCurrentPage}
			/>
			<CaseSelector
				visible={currentPage === "case-selector" && visible}
				flashMenu={flashMenu}
				setCurrentPage={setCurrentPage}
			/>
			<BattleViewing
				visible={currentPage === "viewing" && visible}
				flashMenu={flashMenu}
				setCurrentPage={setCurrentPage}
			/>
		</MenuCore>
	);
});
