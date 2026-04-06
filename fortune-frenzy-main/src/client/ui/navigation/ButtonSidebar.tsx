import React, { useEffect } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { SidebarButton } from "./SidebarButton";
import { useAtom } from "@rbxts/react-charm";
import { useMotion } from "@rbxts/pretty-react-hooks";
import { usePxScale } from "client/hooks/use-scale";
import { isNavigationVisibleAtom } from "client/utils/global-state";

interface Props {
	buttons: [iconUrl: string, name: string][];
	onButtonClick: (name: string) => void;
}

export function Sidebar({ buttons, onButtonClick }: Props) {
	const px = usePx();
	const buttonsVisible = useAtom(isNavigationVisibleAtom);
	const [buttonsPosition, buttonsPositionMotion] = useMotion(new UDim2(0, 0, 0.5, 0));
	const [buttonAnchorPoint, buttonAnchorPointMotion] = useMotion(new Vector2(1, 0.5));

	useEffect(() => {
		if (buttonsVisible) {
			buttonsPositionMotion.tween(new UDim2(0, px(30), 0.5, 0), {
				time: 0.15,
				style: Enum.EasingStyle.Exponential,
				direction: Enum.EasingDirection.Out,
			});
			buttonAnchorPointMotion.tween(new Vector2(0, 0.5), {
				time: 0.15,
				style: Enum.EasingStyle.Exponential,
				direction: Enum.EasingDirection.Out,
			});
		} else {
			buttonsPositionMotion.tween(new UDim2(0, 0, 0.5, 0), {
				time: 0.15,
				style: Enum.EasingStyle.Exponential,
				direction: Enum.EasingDirection.In,
			});
			buttonAnchorPointMotion.tween(new Vector2(1, 0.5), {
				time: 0.15,
				style: Enum.EasingStyle.Exponential,
				direction: Enum.EasingDirection.In,
			});
		}
	}, [buttonsVisible]);

	return (
		<frame
			Size={new UDim2(0, px(54), 0, px(398))}
			Position={buttonsPosition}
			AnchorPoint={buttonAnchorPoint}
			BackgroundTransparency={1}
			Visible={true}
		>
			<uiscale Scale={usePxScale()()} />
			<uilistlayout
				Padding={new UDim(0, px(8))}
				FillDirection={Enum.FillDirection.Vertical}
				SortOrder={Enum.SortOrder.LayoutOrder}
				HorizontalAlignment={Enum.HorizontalAlignment.Left}
				VerticalAlignment={Enum.VerticalAlignment.Center}
			/>
			{buttons.map(([iconUrl, name]) => (
				<SidebarButton
					imageUrl={iconUrl}
					name={name}
					onClick={() => {
						if (buttonsVisible) {
							onButtonClick(name);
						}
					}}
				/>
			))}
		</frame>
	);
}
