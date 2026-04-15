import React from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { palette } from "client/utils/palette";
import { Corner } from "../tools/Corner";
import { TextLabel } from "../core/TextLabel";
import { JACKPOT_MENU_TITLE } from "shared/util/strings";
import { CloseButton } from "../core/CloseButton";
import { useJackpotWheel } from "client/hooks/use-jackpot-wheel";
import { JackpotWheel } from "./JackpotWheel";
import { JackpotViewingInfo } from "./JackpotViewingInfo";

interface Props {
	visible: boolean;
	setCurrentPage: (page: "grid" | "viewing" | "inventory") => void;
}

export function JackpotViewing({ visible, setCurrentPage }: Props) {
	const px = usePx();
	const {
		currentJackpot: currentJackpotData,
		deselectJackpot,
		selectedJackpotId,
		slices,
		playerSliceInfo,
	} = useJackpotWheel();
	const completeReturnRef = React.useRef<thread | undefined>(undefined);

	React.useEffect(() => {
		setCurrentPage(selectedJackpotId ? "viewing" : "grid");
	}, [selectedJackpotId]);

	React.useEffect(() => {
		if (completeReturnRef.current) {
			task.cancel(completeReturnRef.current);
			completeReturnRef.current = undefined;
		}

		if (!currentJackpotData || currentJackpotData.status !== "complete") return;

		completeReturnRef.current = task.delay(18, () => {
			deselectJackpot();
			setCurrentPage("grid");
		});

		return () => {
			if (completeReturnRef.current) {
				task.cancel(completeReturnRef.current);
				completeReturnRef.current = undefined;
			}
		};
	}, [currentJackpotData?.id, currentJackpotData?.status]);

	return (
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
				event={{
					Activated: () => {
						deselectJackpot();
						setCurrentPage("grid");
					},
				}}
			/>
			{!currentJackpotData ? (
				<TextLabel
					typeface="Sans"
					weight="Bold"
					native={{
						Text: "Something went wrong",
						TextSize: px(20),
						Size: new UDim2(0, px(700), 0, px(20)),
						Position: new UDim2(0.5, 0, 0.5, 0),
						AnchorPoint: new Vector2(0.5, 0.5),
						TextColor3: palette.lossRed,
					}}
				/>
			) : (
				<>
					<JackpotWheel
						jackpot={currentJackpotData}
						slices={slices}
						setCurrentPage={setCurrentPage}
						playerSliceInfo={playerSliceInfo}
					/>
					<JackpotViewingInfo jackpot={currentJackpotData} playerSliceInfo={playerSliceInfo} />
					<imagelabel
						Image={"rbxassetid://123544827159195"}
						ImageColor3={Color3.fromRGB(133, 138, 186)}
						ImageTransparency={0.65}
						BackgroundTransparency={1}
						Size={new UDim2(0, px(570), 1, 0)}
						ZIndex={0}
					/>
				</>
			)}
		</frame>
	);
}
