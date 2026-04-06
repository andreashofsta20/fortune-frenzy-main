const fs = require('fs');

let code = fs.readFileSync('src/client/ui/menus/AdminMenu.tsx', 'utf8');

// Replace active tab initial state
code = code.replace(/const \[selectedTab, setSelectedTab\] = useState<AdminTab>\("overview"\);/, 'const [activePage, setActivePage] = useState<AdminTab | "dashboard">("dashboard");');

code = code.replace(/const \[selectedTabLabel, setSelectedTabLabel\] = useState<string>\(tabs\[0\]\.label\);/, '');
code = code.replace(/const selectedTabLabel = useMemo\([\s\S]*?\}, \[selectedTab\]\);/, '');

code = code.replace(/const setTabFromLabel = useCallback\([\s\S]*?\}, \[\]\);/, '');

code = code.replace(/switch \(selectedTab\) \{/, 'switch (activePage) {');

let startStr = '<TextLabel\n\t\t\t\t\ttypeface="Sans"\n\t\t\t\t\tweight="Bold"';
let endStr = '{message ?';
let s = code.indexOf(startStr);
let e = code.indexOf(endStr);

if (s !== -1 && e !== -1) {
    let replacement = `{activePage === "dashboard" ? (
<frame BackgroundTransparency={1} Size={new UDim2(1, 0, 1, 0)}>
<TextLabel
typeface="Sans"
weight="Bold"
native={{
Text: "Admin Console",
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
Text: \`Restricted to user ID \${ADMIN_USER_ID}\`,
TextColor3: palette.darkerText,
TextSize: px(15),
Size: new UDim2(0, px(360), 0, px(16)),
Position: new UDim2(0, px(24), 0, px(49)),
TextXAlignment: Enum.TextXAlignment.Left,
}}
/>
<CloseButton
native={{ Size: new UDim2(0, px(21), 0, px(21)), Position: new UDim2(0, px(855), 0, px(24)) }}
event={{ Activated: handleCloseButton }}
/>
<frame BackgroundTransparency={1} Position={new UDim2(1, px(-318), 0, px(26))} Size={new UDim2(0, px(272), 0, px(24))}>
<uilistlayout FillDirection={Enum.FillDirection.Horizontal} HorizontalAlignment={Enum.HorizontalAlignment.Right} Padding={new UDim(0, px(8))} />
<Badge text={panelData?.player.online ? "Online" : "Offline"} color={panelData?.player.online ? palette.deepGreen : palette.deepMaroon} />
<Badge text={\`Players \${activePlayers}\`} color={palette.blue} />
</frame>

<frame BackgroundTransparency={1} Position={new UDim2(0, px(24), 0, px(90))} Size={new UDim2(1, px(-48), 1, px(-114))}>
<uigridlayout CellPadding={new UDim2(0, px(20), 0, px(20))} CellSize={new UDim2(0, px(270), 0, px(170))} FillDirection={Enum.FillDirection.Horizontal} SortOrder={Enum.SortOrder.LayoutOrder} />
{tabs.map((tab, i) => (
<imagebutton key={tab.id} LayoutOrder={i} BackgroundColor3={palette.background2} BorderSizePixel={0} AutoButtonColor={false} Event={{ Activated: () => setActivePage(tab.id) }}>
<Corner roundness="medium" />
<TextLabel typeface="Sans" weight="Bold" native={{ Text: tab.label, TextColor3: palette.primaryText, TextSize: px(20), Size: new UDim2(1, px(-32), 0, px(20)), Position: new UDim2(0, px(20), 0, px(20)), TextXAlignment: Enum.TextXAlignment.Left }} />
<TextLabel typeface="Sans" weight="Regular" native={{ Text: "Manage " + tab.label.toLowerCase() + " configuration spanning the network. Control values, log data, and wipe user traces.", TextColor3: palette.darkerText, TextSize: px(13), Size: new UDim2(1, px(-40), 0, px(80)), Position: new UDim2(0, px(20), 0, px(50)), TextXAlignment: Enum.TextXAlignment.Left, TextWrapped: true, TextYAlignment: Enum.TextYAlignment.Top }} />
<frame BackgroundTransparency={1} Size={new UDim2(0, px(42), 0, px(42))} Position={new UDim2(1, px(-62), 1, px(-62))} BackgroundColor3={palette.background3}><Corner roundness="small"/><TextLabel typeface="Sans" weight="Bold" native={{Text: "?", TextSize: px(20), Size: new UDim2(1,0,1,0), TextColor3: palette.blueText}}/></frame>
</imagebutton>
))}
</frame>
</frame>
) : (
<frame BackgroundTransparency={1} Size={new UDim2(1, 0, 1, 0)}>
<Button size={new UDim2(0, px(90), 0, px(32))} position={new UDim2(0, px(24), 0, px(20))} text="? Back" typeface="Sans" weight="SemiBold" backgroundColor={palette.background2} textColor={palette.primaryText} event={{ Activated: () => setActivePage("dashboard") }} />
<TextLabel typeface="Sans" weight="Bold" native={{ Text: "Admin UI: " + (tabs.find((t) => t.id === activePage)?.label ?? ""), TextSize: px(22), Size: new UDim2(0, px(320), 0, px(24)), Position: new UDim2(0, px(130), 0, px(24)), TextXAlignment: Enum.TextXAlignment.Left }} />
<CloseButton native={{ Size: new UDim2(0, px(21), 0, px(21)), Position: new UDim2(0, px(855), 0, px(24)) }} event={{ Activated: handleCloseButton }} />
<frame BackgroundTransparency={1} Position={new UDim2(0, px(16), 0, px(68))} Size={new UDim2(1, px(-32), 1, px(-84))}>
{renderTabContent()}
</frame>
</frame>
)}
`;

    code = code.substring(0, s) + replacement + code.substring(e);
}

fs.writeFileSync('src/client/ui/menus/AdminMenu.tsx', code);
console.log('done refactor');
