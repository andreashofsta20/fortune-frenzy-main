import { Networking } from "@flamework/networking";
import { HttpService } from "@rbxts/services";
import {
	Case,
	CaseBattleData,
	CaseBattleCase,
	Coinflip,
	Item,
	ItemListing,
	PlayerData,
	SubscriptionData,
	Trade,
	JackpotData,
} from "typings/APIResponses";

interface ClientToServerEvents {
	CurrentMenu: (menu: string) => void;
}

interface ServerToClientEvents {
	// Marketplace, Inventory, and Equipped Items
	InventoryUpdate: (inventory: Map<string, string[]>) => void;
	// Backward-compat alias for stale sessions with a historical typo.
	InventoryUpdae: (inventory: Map<string, string[]>) => void;
	ItemUpdate: (items: Item[]) => void;
	ItemResellersUpdate: (
		data: {
			itemId: string;
			added: ItemListing[];
			updated: ItemListing[];
			removed: string[]; // UAIDs
		}[],
	) => void;

	// Item Cases
	CaseUpdate: (cases: Case[]) => void;

	// Coinflip
	CoinflipsUpdated: ({ updated, removed }: { updated: Coinflip[]; removed: string[] }) => void;

	// Currency
	CurrencyUpdate: (currency: "Cash" | "ItemValue" | "Gems", amount: number) => void;
	Notification: (text: string, sound?: string) => void;

	// Trading
	NewTrade: (tradeId: string, trades: Record<string, Trade>) => void;
	TradeStatusUpdate: (tradeId: string, status: "pending" | "accepted" | "declined" | "cancelled" | "failed") => void;

	// Miscellanious
	SubscriptionStatusUpdate: (subscription: string, data: SubscriptionData) => void;
	GamepassStatusUpdate: (gamepass: string, status: boolean) => void;
	PurchaseConfirmed: () => void;
	SoftShutdown: (messages: { clientMessage?: string; serverMessage?: string }) => void;
	MinigamesUpdated: (
		global: Map<
			string,
			{
				last_updated: number;
				current_ccu: number;
				total_spent: number;
				total_games_played: number;
				total_wins?: number;
				total_losses?: number;
			}
		>,
		local: Record<
			string,
			{
				total_spent: number;
				total_games_played: number;
				total_wins?: number;
				total_losses?: number;
			}
		>,
	) => void;

	// Case Battles
	CaseBattlesUpdated: ({ updated, removed }: { updated: CaseBattleData[]; removed: string[] }) => void;

	// Jackpots
	JackpotsUpdated: ({ updated, removed }: { updated: JackpotData[]; removed: string[] }) => void;

	// Commerce
	RewardWheelSpinsUpdated: (spins: { spins: number; nextFreeAt: number }) => void;
}

interface ClientToServerFunctions {
	Admin: {
		GetPanelData: (userId: number) => {
			status: string;
			message?: string;
			data?: {
				player: {
					pData: PlayerData;
					recentActivity: Array<{
						image: string;
						text: string;
					}>;
					trades: Trade[];
					inventory: Map<string, string[]>;
					online: boolean;
				};
				server: {
					activePlayers: number;
					serverId: string;
					selectedUserId: string;
				};
			};
		};
		RemoveCash: (
			userId: number,
			amount: number,
		) => {
			status: string;
			message?: string;
			balance?: number;
		};
		RemoveItems: (
			userId: number,
			itemId: string,
			amount: number,
		) => {
			status: string;
			message?: string;
			removed?: number;
		};
		WipeProfile: (userId: number) => {
			status: string;
			message?: string;
		};
		BanUser: (
			userId: number,
			reason: string,
			durationSeconds: number,
		) => {
			status: string;
			message?: string;
		};
		KickUser: (
			userId: number,
			reason: string,
		) => {
			status: string;
			message?: string;
		};
	};

	// Startup Functions
	Loading: {
		GetCurrencies: () => {
			Cash: number;
			Gems: number;
			ItemValue: number;
		};
		GetTutorialState: () => {
			completed: boolean;
			reward_claimed: boolean;
			should_show: boolean;
		};
		CompleteTutorial: () => {
			status: "success" | "error";
			message?: string;
			completed: boolean;
			reward_claimed: boolean;
			reward?: {
				cash: number;
				gems: number;
				item_id?: string;
			};
		};
		GetDailyReward: () => {
			available: boolean;
			rewards: Record<string, { claimed_at: number; reward: string; reward_data: string }>;
			nextAvailableAt: number;
		};
		SetClientData: (data: { current_time: number }) => boolean;
	};

	// Marketplace, Inventory, and Equipped Items
	Marketplace: {
		GetInventory: () => Map<string, string[]>;
		GetEntireMarketplace: () => Map<string, Item>;
		GetMarketplaceItem: (itemId: string) => Item | undefined;
		GetAllListings: () => Map<string, ItemListing[]>;
		GetListingsForItem: (itemId: string) => ItemListing[];
		GetEquippedItems: () => string[];
		ToggleEquip: (itemId: string) => boolean; // Returns true if the item was equipped, false if it was unequipped
		BuyListedItem: (targetId: string) => { status: string; message?: string; code?: number | string };
		ListItemForSale: (uaid: string, price?: number) => { status: string; message?: string; code?: number | string };
	};

	// Item Cases
	ItemCases: {
		GetCases: () => Map<string, Case>;
		OpenCase: (
			caseId: string,
			flag?: "lucky" | "robux",
		) => { status: string; message?: string; code?: number | string };
	};

	// Coinflip
	Coinflip: {
		CreateCoinflip: (
			items: { [itemId: string]: number },
			coin?: string,
		) => {
			status: string;
			message?: string;
			code?: number | string;
		};
		CancelCoinflip: (coinflipId: string) => { status: string; message?: string; code?: number | string };
		CallBotCoinflip: (coinflipId: string) => { status: string; message?: string; code?: number | string };
		JoinCoinflip: (
			coinflipId: string,
			items: { [itemId: string]: number },
		) => { status: string; message?: string; code?: number | string };
		GetCoinflips: () => Coinflip[];
	};

	Trading: {
		CreateTrade: (
			receiver_id: number,
			initiatorItems: { [itemId: string]: number },
			receiverItems: { [itemId: string]: number },
		) => { status: string; message?: string; code?: number | string };
		AcceptTrade: (tradeId: string) => { status: string; message?: string; code?: number | string };
		CancelTrade: (tradeId: string) => { status: string; message?: string; code?: number | string };
		GetTrades: () => Record<string, Trade>;
	};

	Users: {
		GetPlayerInformation: (user_id: number) => {
			status: string;
			data?: {
				pData: PlayerData;
				recentActivity: Array<{
					image: string;
					text: string;
				}>;
			};
		};
		SearchPlayers: (
			query: string,
			sortOrder?: "value_high" | "value_low" | "name_a-z" | "name_z-a",
		) =>
			| {
					id: string;
					name: string;
					display_name: string;
					current_cash: number;
					current_value: number;
			  }[]
			| undefined;
		GetUserInventory: (userId: number) => Map<string, string[]>;
	};

	Commerce: {
		GetRobuxProducts: () => {
			DeveloperProducts: Map<string, string>;
			Gamepasses: Map<string, string>;
			Subscriptions: Map<string, string>;
		};
		GetSubscriptionStatuses: () => Map<string, SubscriptionData>;
		GetGamepassStatuses: () => Map<string, boolean>;
		ClaimDailyReward: () => {
			available: boolean;
			rewards: Record<
				string,
				{
					claimed_at: number;
					reward: string;
					reward_data: string;
				}
			>;
			nextAvailableAt?: number;
		};
		GetRewardWheelSpins: () => {
			status: string;
			message?: string;
			code?: number | string;
			spins: number;
			nextFreeAt: number;
		};
		SpinRewardWheel: () => {
			status: string;
			message?: string;
			code?: number | string;
			reward_data?: string;
		};
	};

	CaseBattles: {
		GetCases: () => Array<CaseBattleCase>;
		GetBattles: () => Array<CaseBattleData>;
		CreateBattle: (
			cases: string[],
			mode: CaseBattleData["mode"],
			crazy: boolean,
			fast_mode: boolean,
			team_mode: CaseBattleData["team_mode"],
		) => { status: string; message?: string; code?: number | string };
		JoinBattle: (
			battleId: string,
			position: number,
		) => { status: string; message?: string; code?: number | string };
	};

	Jackpot: {
		GetPots: () => JackpotData[];
		CreatePot: (
			value_range: string,
			max_players: number,
			start_delay: number,
		) => { status: string; message?: string; code?: number | string };
		JoinPot: (
			jackpotId: string,
			items: { [itemId: string]: number },
		) => {
			status: string;
			message?: string;
			code?: number | string;
		};
		LeavePot: (jackpotId: string) => { status: string; message?: string; code?: number | string };
	};

	Items: {
		FindItemsInRange: (minValue: number, maxValue: number, minItems: number, maxItems: number) => string[];
	};
}

interface ServerToClientFunctions {}

export const GlobalEvents = Networking.createEvent<ClientToServerEvents, ServerToClientEvents>();
export const GlobalFunctions = Networking.createFunction<ClientToServerFunctions, ServerToClientFunctions>();

GlobalFunctions.registerHandler("onBadResponse", (player, data) =>
	warn(player, `returned a bad response for ${data.networkInfo.name}`, HttpService.JSONEncode(data.value)),
);
