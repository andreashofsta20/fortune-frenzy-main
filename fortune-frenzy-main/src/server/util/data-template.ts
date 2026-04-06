import { Trade } from "typings/APIResponses";

export class DataTemplate {
	Cash = 150000; // soft currency
	Gems = 0; // hard currency (premium)

	EquippedItems: string[] = [];
	Trades: Record<string, Trade> = {};

	UserData = {
		TimezoneDifferenceFromUTC: 0,
		TimezoneDifferenceFromUTC_LastUpdated: 0,
	};

	TutorialData = {
		Completed: false,
		CompletedAt: 0,
		RewardClaimed: false,
		StarterCashGranted: false,
	};

	RecentActivity: {
		text: string;
		image: string;
	}[] = [];
	Statistics = {
		total_cash_earned: 0 as number,
		total_cash_spent: 0 as number,
		win_rate: 0 as number,
		biggest_win: 0 as number,
		total_plays: 0 as number,
		favourite_mode: "" as string,
		time_played: 0 as number,
		xp: 0 as number,
	};

	SubscriptionData = {
		VIP: {
			NewBillingCycle: false,
			State: "NeverSubscribed" as
				| "NeverSubscribed"
				| "SubscribedWillRenew"
				| "SubscribedWillNotRenew"
				| "SubscribedRenewalPaymentPending"
				| "Expired",
			NextRenewTime: undefined as undefined | string,
			ExpireTime: undefined as undefined | string,
			ExpirationDetails: {
				ExpirationReason: undefined as
					| "ProductInactive"
					| "ProductDeleted"
					| "SubscriberCancelled"
					| "SubscriberRefunded"
					| "Lapsed"
					| undefined,
			},
		},
	};

	GamepassData: Record<string, boolean> = {};
	PurchaseIdCache: string[] = [];

	MinigameData: Record<
		string,
		{
			total_spent: number;
			total_games_played: number;
			total_wins?: number;
			total_losses?: number;
		}
	> = {};

	DailyRewards: Record<
		string,
		{
			claimed_at: number;
			reward: "Gems" | "Cash" | "Item";
			reward_data: string;
		}
	> = {};

	RewardWheelData: {
		Spins: {
			id: string;
			expires_at: number;
			used: boolean;
			purchased_at: number;
			reward_data?: string;
		}[];
		LastSpinTime: number;
		// Timestamp (Unix seconds) of when the most recent free spin was awarded. Used to enforce a 12-hour cooldown.
		LastFreeSpinAwardedAt: number;
	} = {
		Spins: [],
		LastSpinTime: 0,
		LastFreeSpinAwardedAt: 0,
	};
}

export class SessionOnlyDataTemplate {
	OwnedUAIDs: string[] = [];
	TotalItemValue = 0;
	paycheckMultiplier = 1;
}
