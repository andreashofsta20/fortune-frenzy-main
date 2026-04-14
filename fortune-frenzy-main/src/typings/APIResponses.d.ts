export interface Item {
	id: string;
	asset_id: string;
	name: string;
	creator: string;
	description: string;
	/** Mean price of active marketplace listings (cash). 0 when none listed. */
	average_price: number;
	total_unboxed: number;
	maximum_copies: number;
	/** Rolimons value */
	value: number;
	/** Rows in item_copies for this catalog id */
	copies_in_circulation?: number;
	created_at: string;
	updated_at: string;
	color: string;
	category: string;
	/** 1 (or true) = quick-buy allowed; 0 (or false) = cases / trading / resellers only. API uses 0/1 for reliable replication. */
	allow_direct_shop_purchase?: boolean | number;
}

export interface InventoryResponse {
	status: string;
	// item_id, user_asset_id, serial_number, copy_id
	inventory: [string, string, string, string][];
}

export interface MarketplaceItemsDataResponse {
	status: string;
	data: Item[];
}

export interface MarketplaceItemDataResponse {
	status: string;
	data: Item;
}

interface CashChangeResponse {
	status: string;
	changes: Array<{
		user_id: string;
		amount: string;
	}>;
}

interface ItemListingResponse {
	status: string;
	error?: string;
}

interface ItemListing {
	user_asset_id: string;
	seller_id: string;
	currency: string;
	created_at: string;
	expires_at: string | undefined;
	price: string;
	item_id: string;
	username: string;
	display_name: string;
}

interface AllItemListingResponse {
	status: string;
	listings: ItemListing[];
}

interface ItemCopy {
	copy_id: string;
	item_id: string;
	owner_id: string;
	user_asset_id: string;
	acquired_at: string;
	serial_number: number;
	username: string;
	display_name: string;
}

interface ItemCopiesResponse {
	status: string;
	owners: ItemCopy[];
}

interface PurchaseResponse {
	status: string;
	error?: string;
	item: Item;
}

interface Case {
	price: number;
	items: {
		id: string;
		chance: number;
		claimed: number;
		/** Rolimons value from server (expected-value pricing) */
		value?: number;
	}[];
	next_rotation: string;
	id: string;
	ui_data: {
		primary: string;
		colour: string;
	};
	opened_count: number;
	min_value: number;
	max_value: number;
	available_for_gems: boolean;
	dev_product: string;
}

interface CasesResponse {
	status: string;
	data: Case[];
}

interface OpenCaseResponse {
	status: string;
	result?: { id: string; chance: number; claimed: number };
	case: Case;
	error?: string;
}

interface Coinflip {
	id: string;
	player1: {
		id: string;
		username: string;
		display_name: string;
	};
	player2?: {
		id: string;
		username: string;
		display_name: string;
	};
	player1_items: string[];
	player2_items?: string[];
	status: "waiting_for_player" | "awaiting_confirmation" | "completed" | "failed";
	transfer_id?: string;
	type: "server" | "global" | "friends";
	server_id: string;
	player1_coin: 1 | 2;
	winning_coin?: 1 | 2;
	locked?: boolean;
	auto_id?: number;
}

interface CreateCoinflipResponse {
	status: string;
	data: Coinflip;
}

interface GetCoinflipsResponse {
	status: string;
	coinflips: Coinflip[];
}

interface Trade {
	trade_id: number;
	initiator: {
		user_id: string;
		username: string;
		display_name: string;
		items: string[];
	};
	receiver: {
		user_id: string;
		username: string;
		display_name: string;
		items: string[];
	};
	status: "pending" | "accepted" | "declined" | "cancelled" | "failed";
	created_at: string;
	updated_at: string;
	transfer_id: string | undefined;
}

interface GetTradesResponse {
	status: string;
	trades: Trade[];
}

interface CreateTradeResponse {
	status: string;
	data: Trade;
	error?: string;
}

interface AcceptTradeResponse {
	status: string;
	tradeStatus: "pending" | "accepted" | "declined" | "cancelled";
}

interface CancelTradeResponse {
	status: string;
	tradeStatus: "pending" | "accepted" | "declined" | "cancelled";
}

interface GetUserDataResponse {
	status: string;
	data: {
		data: {
			user_id: string;
			created_at: string;
			updated_at: string;
			name: string;
			display_name: string;
			statistics: {
				total_cash_earned: number;
				total_cash_spent: number;
				win_rate: number;
				biggest_win: number;
				total_plays: number;
				favourite_mode: string;
				time_played: number;
				xp: number;
			};
			current_cash: string;
		};
		recent_activity: {
			image: string;
			text: string;
		}[];
	};
}

interface PlayerData {
	user_id: string;
	name: string;
	display_name: string;
	statistics: {
		total_cash_earned: number;
		total_cash_spent: number;
		win_rate: number;
		biggest_win: number;
		total_plays: number;
		favourite_mode: string;
		time_played: number;
		xp: number;
		current_cash: string;
	};
}

interface SubscriptionData {
	NewBillingCycle: boolean;
	State:
		| "NeverSubscribed"
		| "SubscribedWillRenew"
		| "SubscribedWillNotRenew"
		| "SubscribedRenewalPaymentPending"
		| "Expired";
	NextRenewTime: undefined | string;
	ExpireTime: undefined | string;
	ExpirationDetails: {
		ExpirationReason?:
			| "ProductInactive"
			| "ProductDeleted"
			| "SubscriberCancelled"
			| "SubscriberRefunded"
			| "Lapsed"
			| undefined;
	};
}

export interface CaseBattleData {
	id: string;
	server_id: string;
	server_seed: string;
	team_mode: "1v1" | "1v1v1" | "1v1v1v1" | "2v2";
	crazy: boolean;
	mode: "Standard" | "Randomized" | "Showdown" | "Group";
	fast_mode: boolean;
	players: {
		id: string;
		username: string;
		display_name: string;
		position: number;
		bot: boolean;
		client_seed: string;
	}[];
	cases: string[];
	player_pulls: {
		[player_id: string]: {
			items: {
				id: number;
				case_index: number;
				roll: string;
				hash: string;
				value: number;
			}[];
			total_value: number;
		};
	};
	current_spin_data: {
		current_case_index: number;
		case_id: string;
		/** Round index as string ("1", "2", …) — matches local backend; may also be "1/N" from older APIs. */
		progress: string;
	};
	/** Go backend: full resolved pulls + payout totals while in progress (optional; client can ignore). */
	resolved_pulls?: CaseBattleData["player_pulls"];
	resolved_winners?: {
		player_id: string;
		amount_won: number;
	}[];
	winners_info?: {
		player_id: string;
		amount_won: number;
	}[];
	status: "waiting_for_players" | "in_progress" | "completed";
	next_step_at?: number;
	created_at: number;
	started_at: number;
	completed_at: number;
	updated_at: number;
}

interface CaseBattleItem {
	id: number;
	case_id: string;
	asset_id: string;
	asset_type: string;
	name: string;
	value: number;
	image: string;
	min_ticket: number;
	max_ticket: number;
}

interface CaseBattleCase {
	id: string;
	name: string;
	slug: string;
	image: string;
	price: number;
	total_opened: number;
	created_at: string;
	items: {
		id: number;
		case_id: string;
		asset_id: string;
		asset_type: string;
		name: string;
		value: number;
		image: string;
		min_ticket: number;
		max_ticket: number;
	}[];
}

export interface JackpotPotsResponse {
	status: string;
	pots: JackpotData[];
}

export interface JackpotData {
	id: string;
	server_id: string;
	server_seed: string;
	creator: { id: string; username: string; display_name: string };
	value_cap: number;
	joinable: boolean;
	leaveable: boolean;
	status: "countdown" | "waiting_for_start" | "in_progress" | "complete";
	members: {
		player: { id: string; username: string; display_name: string };
		total_value: number;
		items: string[];
		client_seed: string;
	}[];
	winning_data?: {
		player: { id: string; username: string; display_name: string };
	};
	countdown_end_at: number;
	created_at: number;
	updated_at: number;
	transfer_id?: string;
	is_system_pot?: boolean;
	auto_start_at?: number;
	value_floor?: number;
	max_players?: number;
}
