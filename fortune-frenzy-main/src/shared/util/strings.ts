export const FONTS = {
	Mono: "rbxassetid://16658246179",
	Sans: "rbxassetid://16658221428",
	Extended: "rbxassetid://16658237174",
};

export const COINS = {
	[1]: {
		icon: "rbxassetid://129214013019384",
		name: "Heads",
	},
	[2]: {
		icon: "rbxassetid://82967436231437",
		name: "Tails",
	},
};

export const COINFLIP_VIEWING_STATUSES = {
	waiting_for_player: "Waiting for another player..",
	awaiting_confirmation: "Finalizing flip on server…",
	completed: "This coinflip has been marked as complete!",
	failed: "Something went wrong - contact support if this issue persists.",
};

export const COINFLIP_MENU_TITLE = "Item Coinflip";
export const COINFLIP_AFFORDABLE_JOIN_TITLE = "Interested?";
export const COINFLIP_AFFORDABLE_JOIN_SUBTITLE = "You can afford to join this coinflip!";
export const COINFLIP_AFFORDABLE_JOIN_BUTTON = "Join Coinflip";
export const COINFLIP_UNAFFORDABLE_JOIN_TITLE = "You can't match!";
export const COINFLIP_UNAFFORDABLE_JOIN_SUBTITLE = "You can't match the value in this coinflip.";
export const COINFLIP_UNAFFORDABLE_JOIN_BUTTON = "";
export const COINFLIP_JOIN_BUTTON = "Join Coinflip";
export const COINFLIP_CANCEL_TITLE = "Having doubts?";
export const COINFLIP_CANCEL_SUBTITLE = "You can cancel your coinflip anytime.";
export const COINFLIP_SELECTION_TITLE = "Select items to Coinflip";
export const COINFLIP_VIEWING_TITLE = "@{{name}}'s Coinflip";
export const COINFLIP_VIEWING_ENDED = "All items have been sent to the winner.";
export const COINFLIP_VIEWING_COUNT = "This was coinflip #{{count}}";

export const CASE_BATTLES_MENU_TITLE = "Case Battles";
export const CASE_BATTLES_BATTLE_BUILDER_TITLE = "Create a Case Battle";
export const CASE_BATTLES_CASE_SELECTOR_TITLE = "Select a case";
export const CASE_BATTLES_CASE_SELECTOR_SEARCH_PLACEHOLDER = "Search through {{count}} cases...";
export const CASE_BATTLES_CASE_SELECTOR_SORT_VALUE = "Sort by Highest";
export const CASE_BATTLES_CASE_SELECTOR_SORT_VALUE_LOW = "Sort by Lowest";
export const CASE_BATTLES_VIEWING_TITLE = "{{name}}'s Battle";

export const PLAYERS_MENU_TITLE = "People";
export const PLAYERS_SEARCH_PLACEHOLDER = "You can search for players outside of this server!";
export const PLAYERS_SORT_NAME = "Sort by Name";
/** Player list: value ordering (dropdown must show two distinct labels; avoid duplicate “Sort by Value”). */
export const PLAYERS_SORT_VALUE_HIGH = "Sort by Highest Value";
export const PLAYERS_SORT_VALUE_LOW = "Sort by Lowest Value";
export const PLAYERS_PROFILE_TITLE = "@{{name}}'s Profile";
export const PLAYERS_CARD_TRADE_BUTTON = "Trade";
export const PLAYERS_CARD_TRADE_BUTTON_YOU = "This is you!";

export const PROFILE_NOT_LOADED = "Something went wrong while loading your data, please try rejoining the game.";
export const PROFILE_RELEASED = "Your data has been released, please rejoin the game.";
export const SERVER_LOAD_FAILED = "Something went wrong while loading the game, please try rejoining a new server.";
export const INVENTORY_MENU_TITLE = "Your Inventory";
export const INVENTORY_SEARCH_PLACEHOLDER = "Search through {{count}} items...";
export const INVENTORY_SORT_RARITY = "Sort by Rarity";
export const INVENTORY_SORT_VALUE = "Sort by Highest Value";
export const INVENTORY_SORT_VALUE_LOW = "Sort by Lowest Value";
export const INVENTORY_SORT_QUANTITY = "Sort by Most Owned";
export const INVENTORY_SORT_QUANTITY_LOW = "Sort by Least Owned";
export const INVENTORY_NO_ITEMS_TITLE = "You own no items :(";
export const INVENTORY_NO_ITEMS_DESCRIPTION =
	"Head over to the Marketplace to buy some, and then come back here to equip them!";
export const INVENTORY_AUTOSELECT_BUTTON = "Auto Select";

export const MARKETPLACE_MENU_TITLE = "Item Shop";
export const MARKETPLACE_SEARCH_PLACEHOLDER = "Search through {{count}} items...";
export const MARKETPLACE_SORT_RARITY = "Sort by Rarity";
export const MARKETPLACE_SORT_HIGHEST_VALUE = "Sort by Highest Value";
export const MARKETPLACE_SORT_LOWEST_VALUE = "Sort by Lowest Value";
export const MARKETPLACE_SORT_HIGHEST_PRICE = "Sort by Highest Price";
export const MARKETPLACE_SORT_LOWEST_PRICE = "Sort by Lowest Price";
/** Marketplace item stat label: live copy count from item_copies (not total_unboxed). */
export const MARKETPLACE_ITEM_STATS_QUANTITY = "Quantity";
export const MARKETPLACE_ITEM_STATS_VALUE = "Value";
export const MARKETPLACE_ITEM_STATS_AVERAGE_PRICE = "Average Price";
export const MARKETPLACE_ITEM_STATS_RARITY = "Rarity";
export const MARKETPLACE_ITEM_PAGE_RESELLERS = "Resellers";
export const MARKETPLACE_ITEM_PAGE_BUY = "Buy";
export const MARKETPLACE_ITEM_PAGE_SELL_YOURS = "Sell Yours";
export const MARKETPLACE_ITEM_PAGE_INITIAL = "Initial";
export const MARKETPLACE_BUY_CONFIRMATION_TITLE = "Are you sure?";
export const MARKETPLACE_BUY_CONFIRMATION_DESCRIPTION = "You will have {{s}} tokens remaining after this purchase.";
export const MARKETPLACE_BUY_CONFIRMATION_CONFIRM = "Purchase";
export const MARKETPLACE_BUY_CONFIRMATION_CANCEL = "Nevermind";
export const MARKETPLACE_INITIAL_BUY_TITLE = "This item is still available!";
export const MARKETPLACE_INITIAL_BUY_BUTTON = "Buy for ${{price}}";
export const MARKETPLACE_SELL_PRICE_PLACEHOLDER = "Enter a price...";
export const MARKETPLACE_NO_RESELLERS_TITLE = "You've been clownfished!";
export const MARKETPLACE_NO_RESELLERS_DESCRIPTION =
	"No one is selling this item right now. I hope you didn't want it too badly.";
export const MARKETPLACE_PURCHASE_SUCCESS = "Purchase successful! 🎉";
export const MARKETPLACE_PURCHASE_FAILED = "An error occurred: Code {{code}}";

export const TOOLTIP_VIEW = "View on Shop";
export const TOOLTIP_EQUIP = "Equip";
export const TOOLTIP_UNEQUIP = "Unequip";
export const TOOLTIP_SELL = "Sell on Shop";

export const ITEM_CASES_MENU_TITLE = "Item Cases";
export const ITEM_CASES_ROTATION_TITLE = 'The next rotation is <font color="{{color}}">{{countdown}}</font>';
export const ITEM_CASES_ROTATION_DESCRIPTION =
	"Cases change every 3 days. Items are only available through these cases, so grab as many as you can before they disappear, possibly for weeks!";
export const ITEM_CASES_CASE_MENU_TITLE = `{{name}} Case`;
export const ITEM_CASES_CASE_MENU_DESCRIPTION = `This case currently has the following items:`;
export const ITEM_CASES_CASE_MENU_INFO_PRICE_TITLE = `Price`;
export const ITEM_CASES_CASE_MENU_INFO_PRICE_DESC = "${{price}}";
export const ITEM_CASES_CASE_MENU_INFO_OPENED_TITLE = `Opened`;
export const ITEM_CASES_CASE_MENU_INFO_OPENED_DESC = `{{count}} times`;
export const ITEM_CASES_CASE_MENU_INFO_DIAMONDS_TITLE = `Lucky Price`;
export const ITEM_CASES_CASE_MENU_INFO_DIAMONDS_DESC = `{{price}} Gems`;
export const ITEM_CASES_CASE_MENU_INFO_WINCHANCE_TITLE = `Odds`;
export const ITEM_CASES_CASE_MENU_INFO_WINCHANCE_DESC = `{{chance}}%`;
export const ITEM_CASES_CASE_MENU_CANT_AFFORD_DESC = "You cannot afford to open this case";
export const ITEM_CASES_CASE_SPINNER_TITLE = "You unboxed: {{item}}";
export const ITEM_CASES_CASE_SPINNER_DESCRIPTION = "This item has been added to your inventory.";
export const ITEM_CASES_OPEN_AGAIN_BUTTON = "Open Again";
export const ITEM_CASES_CLAIM_BUTTON = "Claim Item";

export const JACKPOT_MENU_TITLE = "Jackpot";
export const JACKPOT_CREATE_TITLE = "Create a Jackpot";

export const TRADING_TITLE = "Your Trades";
export const TRADING_SELECTED_TITLE = "{{tense}} {{action}} {{value}} value from this trade";
export const TRADING_ITEM_TITLE = "You {{tense}} {{action}} ({{value}})";

export const ROBUX_SHOP_TITLE = "Robux Shop";
export const MINIGAMES_TITLE = "Minigames";
