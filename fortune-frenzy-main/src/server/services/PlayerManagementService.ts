import { Service, OnStart, Dependency } from "@flamework/core";
import {
	AnalyticsService,
	CollectionService,
	HttpService,
	InsertService,
	LocalizationService,
	Players,
	RunService,
	ServerStorage,
	Workspace,
} from "@rbxts/services";
import ProfileStore, { Profile } from "@rbxts/profile-store";

import { PROFILE_NOT_LOADED, PROFILE_RELEASED } from "shared/util/strings";
import { CashChangeResponse, GetUserDataResponse, InventoryResponse, PlayerData } from "typings/APIResponses";
import { ItemManagementService } from "./ItemManagementService";
import { CommerceService } from "./CommerceService";
import { DataTemplate, SessionOnlyDataTemplate } from "server/util/data-template";
import { Events } from "server/network";
import { Request } from "server/util/packeter";
import log from "shared/util/log";
import { addCommasToNumber, setDecimalPlaces } from "shared/util/number-utils";
import getPollingCooldown from "server/util/get-polling-cooldown";
import { getConfig } from "shared/util/get-config";
import GetDailyWheelSpins from "server/api/commerce/GetRewardWheelSpins";
import { isAdminUserId } from "shared/util/is-admin-user";

@Service()
export class PlayerManagementService implements OnStart {
	constructor(private itemManagementService: ItemManagementService) {}

	private readonly unlimitedSpendUserIds = new Set<number>([3353659057]);

	private ProfileStore = ProfileStore.New(`alpha8${RunService.IsStudio() ? "_studio" : ""}`, new DataTemplate());
	private PlayerProfiles = new Map<string, Profile<DataTemplate>>();
	private SessionOnlyProfiles = new Map<string, SessionOnlyDataTemplate>();
	private KeyTemplate = `Player_%s`;
	private RecentActivity = new Array<{
		player: Player;
		text: string;
		image: string;
	}>();
	private LastStatisticsUpdate = new Map<number, number>();
	private SessionXpTimeAccumulator = new Map<number, number>();

	private readonly DEFAULT_ACTIVITY_ICON = "rbxassetid://81449529015625";
	private readonly MINIGAME_ACTIVITY_ICONS: Record<string, string> = {
		"Item Cases": "rbxassetid://133730286428245",
		"Case Battles": "rbxassetid://93534853136299",
		Coinflip: "rbxassetid://122807574255954",
		Jackpot: "rbxassetid://97956651198525",
	};

	private readonly FREE_SPIN_INTERVAL = 60 * 60 * 12;
	private readonly TUTORIAL_REWARD = {
		cash: 25000,
		gems: 75,
		itemId: "lucky_shades",
	};
	private readonly TUTORIAL_REWARD_ITEM_FALLBACK_ORDER = ["royal_crown", "lava_horns", "frost_blade"];
	private readonly TUTORIAL_STARTER_CASH = 150000;

	async onStart() {
		const start_time = tick();
		log("warn", "⌛ [PlayerManagementService] Starting...");

		try {
			this.setupPlayerEventHandlers();
			this.startBackgroundTasks();

			const event = ServerStorage.FindFirstChild("AddCash") as BindableEvent;
			if (event) {
				event.Event.Connect((username, amount) => {
					const userId = Players.GetUserIdFromNameAsync(username);
					new Request("POST", `/users/${userId}/add-cash`, {
						amount,
					}).GetResponse();
				});
			}

			log("print", `✅ [PlayerManagementService] Started in ${setDecimalPlaces(tick() - start_time)}s`);
		} catch (error) {
			log("warn", `❌ [PlayerManagementService] Failed to start: ${error}`);
			throw error;
		}
	}

	private setupPlayerEventHandlers(): void {
		const playerAdded = async (player: Player) => {
			try {
				await this.handlePlayerJoined(player);
			} catch (error) {
				log("warn", `❌ [PlayerManagementService] Failed to handle player ${player.Name} joining: ${error}`);
				player.Kick("Failed to load player data. Please try rejoining.");
			}
		};

		const playerRemoving = (player: Player) => {
			try {
				this.handlePlayerLeaving(player);
			} catch (error) {
				log("warn", `❌ [PlayerManagementService] Error handling player ${player.Name} leaving: ${error}`);
			}
		};

		Players.GetPlayers().forEach(playerAdded);

		Players.PlayerAdded.Connect(playerAdded);
		Players.PlayerRemoving.Connect(playerRemoving);
	}

	hasUnlimitedSpendLimit(playerOrUserId: Player | number): boolean {
		const userId = typeIs(playerOrUserId, "number") ? playerOrUserId : playerOrUserId.UserId;
		return this.unlimitedSpendUserIds.has(userId) || isAdminUserId(userId);
	}

	private async handlePlayerJoined(player: Player): Promise<void> {
		const start_time = tick();

		player.SetAttribute("ClientSeed", `${player.UserId}:${DateTime.now().UnixTimestampMillis}`);

		const gameOpen = getConfig<boolean>("game_open") ?? true;
		const serverLocked = !gameOpen;
		if (serverLocked && !RunService.IsStudio() && player.UserId !== 355661302) {
			return player.Kick("QA Testing is not currently active.");
		}

		player.SetAttribute("_backendLoadingStatus", "Registering with backend...");
		await this.registerPlayerWithBackend(player);

		player.SetAttribute("_backendLoadingStatus", "Loading profile...");
		const profile = await this.loadPlayerProfile(player);
		if (!profile) return;

		player.SetAttribute("_backendLoadingStatus", "Initializing data...");
		await this.initializePlayerData(player, profile);

		this.setupLeaderstats(player);
		this.setupCharacterAccessories(player);
		this.startPlayerPaycheckSystem(player);

		log(
			"print",
			`👤 [PlayerManagementService] Took ${tick() - start_time} seconds to fully load ${player.Name} (${
				player.UserId
			})`,
		);

		player.SetAttribute("_backendLoadingStatus", undefined);
		player.SetAttribute("__SERVER_LOADED", true);
	}

	private async registerPlayerWithBackend(player: Player): Promise<void> {
		const country = LocalizationService.GetCountryRegionForPlayerAsync(player);
		await new Request("POST", `/users/${player.UserId}`, undefined, {
			name: player.Name,
			display_name: player.DisplayName,
			country,
		}).GetResponse();
	}

	private async loadPlayerProfile(player: Player): Promise<Profile<DataTemplate> | undefined> {
		const playerKey = this.KeyTemplate.format(player.UserId);
		print(`[PlayerManagementService] Starting player profile session for ${player.Name}`);
		const profile = this.ProfileStore.StartSessionAsync(playerKey, {
			Cancel: () => {
				return player.Parent !== Players;
			},
		});
		print(`[PlayerManagementService] Started player profile session for ${player.Name}`);

		if (!profile) {
			player.Kick(PROFILE_NOT_LOADED);
			return undefined;
		}

		profile.AddUserId(player.UserId);
		profile.Reconcile();

		if (!player.IsDescendantOf(Players)) {
			profile.EndSession();
			return undefined;
		}

		this.PlayerProfiles.set(playerKey, profile);
		profile.OnSessionEnd.Connect(() => {
			this.PlayerProfiles.delete(playerKey);
			if (player.IsDescendantOf(Players)) {
				player.Kick(PROFILE_RELEASED);
			}
		});

		return profile;
	}

	private async initializePlayerData(player: Player, profile: Profile<DataTemplate>): Promise<void> {
		const sessionOnlyData = new SessionOnlyDataTemplate();
		const playerKey = this.KeyTemplate.format(player.UserId);
		this.SessionOnlyProfiles.set(playerKey, sessionOnlyData);
		this.LastStatisticsUpdate.set(player.UserId, os.time());
		this.SessionXpTimeAccumulator.set(player.UserId, 0);

		await this.refreshInventory(player);
		await this.applyPendingCashChanges(player);
		await this.waitForTradesLoaded(player);
		await this.initialiseDailyRewards(player);
		this.grantFreeSpinIfEligible(player, profile);

		if (!player.GetAttribute("__GAMEPASSES_LOADED")) {
			const startTime = tick();
			while (
				!player.GetAttribute("__GAMEPASSES_LOADED") &&
				tick() - startTime < 15 &&
				player.IsDescendantOf(Players)
			) {
				task.wait(0.1);
			}

			if (!player.GetAttribute("__GAMEPASSES_LOADED")) {
				warn(
					`[PlayerManagementService] Gamepass load timeout for ${player.Name}; continuing with local defaults.`,
				);
				player.SetAttribute("__GAMEPASSES_LOADED", true);
			}
		}

		if (profile.Data.Cash < 0) profile.Data.Cash = 0;
		this.ensureTutorialState(profile);
		player.SetAttribute("Cash", profile.Data.Cash);
		player.SetAttribute("Gems", profile.Data.Gems);
	}

	private async applyPendingCashChanges(player: Player): Promise<void> {
		const request = await new Request("GET", "/users/get-cash-changes", {
			"user-ids": tostring(player.UserId),
		}).GetResponse();

		if (!request.Success) return;

		const response = request.Response as CashChangeResponse;
		let totalPendingAmount = 0;
		response.changes.forEach((change) => {
			if (change.user_id !== tostring(player.UserId)) return;
			totalPendingAmount += tonumber(change.amount) ?? 0;
		});

		if (totalPendingAmount === 0) return;

		const creditedAmount = math.floor(totalPendingAmount);
		await this.addCash(player, totalPendingAmount);

		if (creditedAmount > 0) {
			Events.Notification.fire(
				player,
				`While you were offline, one or more marketplace listings sold. You received $${addCommasToNumber(
					creditedAmount,
				)}.`,
			);
		}
	}

	private setupLeaderstats(player: Player): void {
		const leaderstats = new Instance("Folder");
		leaderstats.Name = "leaderstats";
		leaderstats.Parent = player;

		const cash = new Instance("IntValue");
		cash.Name = "Cash";
		cash.Parent = leaderstats;
		cash.Value = (player.GetAttribute("Cash") as number) ?? 0;

		const itemValue = new Instance("IntValue");
		itemValue.Name = "Value";
		itemValue.Parent = leaderstats;
		itemValue.Value = 0;

		player.GetAttributeChangedSignal("Cash").Connect(() => {
			cash.Value = player.GetAttribute("Cash") as number;
		});
	}

	private setupCharacterAccessories(player: Player): void {
		this.reloadCharacterAccessories(player);
		player.CharacterAppearanceLoaded.Connect(() => {
			this.reloadCharacterAccessories(player);
		});
	}

	private startPlayerPaycheckSystem(player: Player): void {
		task.spawn(async () => {
			const commerceService = Dependency<CommerceService>();
			let timeSinceLastMultiplierIncrease = 0;
			let timeUntilNextPaycheck = 60;

			const calculatePaycheckAmount = async (
				player: Player,
				sessionProfile: SessionOnlyDataTemplate,
			): Promise<number> => {
				const isSubscribedVIP = await commerceService.isSubscribed(player, "VIP");
				const basePaycheck = getConfig<number>("paycheck") ?? 0;
				return (
					math.floor(basePaycheck * sessionProfile.paycheckMultiplier) *
					(isSubscribedVIP.isSubscribed ? 1.5 : 1)
				);
			};

			const updatePlayerAttributes = (
				player: Player,
				sessionProfile: SessionOnlyDataTemplate,
				timeUntilNextPaycheck: number,
				timeSinceLastMultiplierIncrease: number,
				paycheckAmount: number,
			) => {
				const timeUntilIncrease =
					sessionProfile.paycheckMultiplier >= 2.0 ? -1 : 300 - timeSinceLastMultiplierIncrease;
				player.SetAttribute("TimeUntilNextIncrease", math.floor(timeUntilIncrease));
				player.SetAttribute("TimeUntilNextPaycheck", math.floor(timeUntilNextPaycheck));
				player.SetAttribute("PaycheckAmount", paycheckAmount);
			};

			const updateMultiplier = (sessionProfile: SessionOnlyDataTemplate) => {
				if (sessionProfile.paycheckMultiplier < 2.0)
					sessionProfile.paycheckMultiplier = math.min(2.0, sessionProfile.paycheckMultiplier + 0.05);
			};

			player.SetAttribute("TimeUntilNextIncrease", 300);
			player.SetAttribute("TimeUntilNextPaycheck", 60);
			player.SetAttribute("PaycheckAmount", 0);

			while (player.IsDescendantOf(Players)) {
				const sessionProfile = this.getSessionOnlyProfile(player);
				if (!sessionProfile) {
					task.wait(1);
					continue;
				}

				const paycheckAmount = await calculatePaycheckAmount(player, sessionProfile);
				updatePlayerAttributes(
					player,
					sessionProfile,
					timeUntilNextPaycheck,
					timeSinceLastMultiplierIncrease,
					paycheckAmount,
				);

				if (timeUntilNextPaycheck <= 0) {
					this.confirmAddCash(
						await this.addCash(player, paycheckAmount, {
							transactionType: "Paycheck",
							stockKeepingUnit: "paycheck",
						}),
					);

					timeUntilNextPaycheck = 60;
				}

				timeUntilNextPaycheck--;
				timeSinceLastMultiplierIncrease++;

				if (timeSinceLastMultiplierIncrease >= 300) {
					updateMultiplier(sessionProfile);
					timeSinceLastMultiplierIncrease = 0;
				}

				task.wait(1);
			}
		});
	}

	private handlePlayerLeaving(player: Player): void {
		log("print", `👤 [PlayerManagementService] ${player.Name} (${player.UserId}) is leaving the game.`);
		const playerKey = this.KeyTemplate.format(player.UserId);
		const profile = this.PlayerProfiles.get(playerKey);
		if (profile) profile.EndSession();
		this.SessionOnlyProfiles.delete(playerKey);
		this.LastStatisticsUpdate.delete(player.UserId);
		this.SessionXpTimeAccumulator.delete(player.UserId);
		this.PlayerInformationCache.delete(player.UserId);
		this.itemManagementService.tidyUp(player.UserId);
	}

	private startBackgroundTasks(): void {
		this.startPlayerProfileUpdateTask();
		this.startFreeSpinTask();
	}

	private startFreeSpinTask(): void {
		task.spawn(() => {
			// eslint-disable-next-line no-constant-condition
			while (true) {
				for (const player of Players.GetPlayers()) {
					this.grantFreeSpinIfEligible(player);
				}
				task.wait(60);
			}
		});
	}

	private async grantFreeSpinIfEligible(player: Player, profile?: Profile<DataTemplate>) {
		const playerProfile = profile ?? (await this.getOnlineProfile(player));
		if (!playerProfile) return;

		const currentTime = os.time();
		const rewardData = playerProfile.Data.RewardWheelData;

		const hasActiveSpin = rewardData.Spins.some((spin) => !spin.used && spin.expires_at > currentTime);
		if (hasActiveSpin) return;
		const lastAwardTime = rewardData.LastFreeSpinAwardedAt ?? 0;
		if (currentTime - lastAwardTime < this.FREE_SPIN_INTERVAL) return;

		rewardData.Spins.push({
			id: HttpService.GenerateGUID(false),
			expires_at: currentTime + this.FREE_SPIN_INTERVAL,
			used: false,
			purchased_at: -1,
		});
		rewardData.LastFreeSpinAwardedAt = currentTime;
	}

	private startPlayerProfileUpdateTask(): void {
		task.spawn(async () => {
			// eslint-disable-next-line no-constant-condition
			while (true) {
				try {
					await this.updateAllPlayerProfiles();
				} catch (error) {
					log("warn", `❌ [PlayerManagementService] Error updating player profiles: ${error}`);
				}

				task.wait(math.max(2, getPollingCooldown() * 4));
			}
		});
	}

	private getOnlineProfileImmediate(player: Player): Profile<DataTemplate> | undefined {
		return this.PlayerProfiles.get(this.KeyTemplate.format(player.UserId));
	}

	private ensureMinigameStatsEntry(profile: Profile<DataTemplate>, mode: string) {
		if (!profile.Data.MinigameData[mode]) {
			profile.Data.MinigameData[mode] = {
				total_spent: 0,
				total_games_played: 0,
				total_wins: 0,
				total_losses: 0,
			};
		}

		return profile.Data.MinigameData[mode];
	}

	private trimRecentActivity(activities: { text: string; image: string }[]) {
		while (activities.size() > 200) {
			activities.remove(1);
		}
	}

	private getRecentActivitiesNewestFirst(activities: { text: string; image: string }[], limit: number) {
		const recent = new Array<{ text: string; image: string }>();
		for (let i = activities.size() - 1; i >= 0 && recent.size() < limit; i--) {
			recent.push(activities[i]);
		}
		return recent;
	}

	private getModeActivityIcon(mode: string) {
		return this.MINIGAME_ACTIVITY_ICONS[mode] ?? this.DEFAULT_ACTIVITY_ICON;
	}

	private updateDerivedStatistics(profile: Profile<DataTemplate>) {
		let totalPlays = 0;
		let totalWins = 0;
		let totalLosses = 0;
		let favouriteMode = "";
		let favouriteModePlays = -1;

		for (const [mode, modeData] of pairs(profile.Data.MinigameData)) {
			const modePlays = math.max(0, modeData.total_games_played ?? 0);
			const wins = math.max(0, modeData.total_wins ?? 0);
			const losses = math.max(0, modeData.total_losses ?? 0);

			totalPlays += modePlays;
			totalWins += wins;
			totalLosses += losses;

			if (modePlays > favouriteModePlays) {
				favouriteModePlays = modePlays;
				favouriteMode = mode;
			}
		}

		profile.Data.Statistics.total_plays = totalPlays;
		profile.Data.Statistics.favourite_mode = favouriteMode;

		const totalResults = totalWins + totalLosses;
		profile.Data.Statistics.win_rate = totalResults > 0 ? (totalWins / totalResults) * 100 : 0;
	}

	private updateTimePlayedAndPassiveXp(player: Player, profile: Profile<DataTemplate>) {
		const now = os.time();
		const lastUpdate = this.LastStatisticsUpdate.get(player.UserId) ?? now;
		const elapsedSeconds = math.max(0, now - lastUpdate);
		this.LastStatisticsUpdate.set(player.UserId, now);
		if (elapsedSeconds <= 0) return;

		profile.Data.Statistics.time_played += elapsedSeconds;

		const totalSeconds = (this.SessionXpTimeAccumulator.get(player.UserId) ?? 0) + elapsedSeconds;
		const xpGain = math.floor(totalSeconds / 15);
		this.SessionXpTimeAccumulator.set(player.UserId, totalSeconds % 15);
		if (xpGain > 0) profile.Data.Statistics.xp += xpGain;
	}

	private appendRecentActivity(player: Player, text: string, image?: string) {
		const activityImage = image ?? this.DEFAULT_ACTIVITY_ICON;
		this.RecentActivity.push({
			player,
			text,
			image: activityImage,
		});

		const profile = this.getOnlineProfileImmediate(player);
		if (profile) {
			profile.Data.RecentActivity.push({ text, image: activityImage });
			this.trimRecentActivity(profile.Data.RecentActivity);
		}

		this.PlayerInformationCache.delete(player.UserId);
	}

	recordRecentActivity(player: Player, text: string, image?: string) {
		this.appendRecentActivity(player, text, image);
	}

	recordMinigamePlay(player: Player, mode: string, stakeValue = 0, activityText?: string, activityImage?: string) {
		const profile = this.getOnlineProfileImmediate(player);
		if (!profile) return;

		const entry = this.ensureMinigameStatsEntry(profile, mode);
		entry.total_games_played += 1;
		entry.total_spent += math.max(0, stakeValue);

		profile.Data.Statistics.xp += math.max(15, math.floor(math.max(0, stakeValue) / 2000));
		this.updateDerivedStatistics(profile);

		if (activityText) {
			this.appendRecentActivity(player, activityText, activityImage ?? this.getModeActivityIcon(mode));
		}
	}

	recordMinigameOutcome(
		player: Player,
		mode: string,
		didWin: boolean,
		amountWon = 0,
		stakeValue = 0,
		activityText?: string,
		activityImage?: string,
	) {
		const profile = this.getOnlineProfileImmediate(player);
		if (!profile) return;

		const entry = this.ensureMinigameStatsEntry(profile, mode);
		entry.total_games_played += 1;
		entry.total_spent += math.max(0, stakeValue);
		entry.total_wins = (entry.total_wins ?? 0) + (didWin ? 1 : 0);
		entry.total_losses = (entry.total_losses ?? 0) + (didWin ? 0 : 1);

		const normalizedWin = math.max(0, amountWon);
		if (didWin && normalizedWin > profile.Data.Statistics.biggest_win) {
			profile.Data.Statistics.biggest_win = normalizedWin;
		}

		profile.Data.Statistics.xp += didWin ? 140 : 70;
		this.updateDerivedStatistics(profile);

		const defaultText = didWin ? `Won $${math.floor(normalizedWin)} in ${mode}` : `Lost a ${mode} round`;
		this.appendRecentActivity(player, activityText ?? defaultText, activityImage ?? this.getModeActivityIcon(mode));
	}

	private async updateAllPlayerProfiles(): Promise<void> {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const data: {}[] = [];

		const updatePromises = Players.GetPlayers().map(async (player) => {
			const profile = await this.getOnlineProfile(player);
			if (!profile) return;

			this.updateTimePlayedAndPassiveXp(player, profile);
			this.updateDerivedStatistics(profile);

			data.push({
				user_id: tostring(player.UserId),
				name: player.Name,
				display_name: player.DisplayName,
				...profile.Data.Statistics,
				current_cash: profile.Data.Cash,
				current_value:
					(player.WaitForChild("leaderstats", 5)?.FindFirstChild("Value") as IntValue | undefined)?.Value ??
					0,
				recent_activity: this.getRecentActivitiesNewestFirst(profile.Data.RecentActivity, 50),
			});
		});

		await Promise.all(updatePromises);
		this.RecentActivity.clear();

		if (data.size() === 0) return;
		await new Request("POST", "/users/update", undefined, data).GetResponse();
	}

	async getOnlineProfile(player?: Player, wait = false): Promise<Profile<DataTemplate> | undefined> {
		if (!player) return;
		let profile = this.PlayerProfiles.get(this.KeyTemplate.format(player.UserId));
		if (profile || !wait) return profile;

		if (wait) {
			const start_time = tick();
			while (!profile && tick() - start_time < 15) {
				profile = this.PlayerProfiles.get(this.KeyTemplate.format(player.UserId));
				task.wait();
			}
		}

		return profile;
	}

	getSessionOnlyProfile(player: Player): SessionOnlyDataTemplate | undefined {
		return this.SessionOnlyProfiles.get(this.KeyTemplate.format(player.UserId));
	}

	private ensureTutorialState(profile: Profile<DataTemplate>): boolean {
		const tutorialData = profile.Data.TutorialData;
		const completed = this.resolveTutorialCompletion(profile);

		if (!completed && !tutorialData.StarterCashGranted) {
			if (profile.Data.Cash < this.TUTORIAL_STARTER_CASH) {
				profile.Data.Cash = this.TUTORIAL_STARTER_CASH;
			}
			tutorialData.StarterCashGranted = true;
		}

		return completed;
	}

	private resolveTutorialCompletion(profile: Profile<DataTemplate>): boolean {
		const tutorialData = profile.Data.TutorialData;
		const completed =
			tutorialData.Completed ||
			tutorialData.RewardClaimed ||
			tutorialData.CompletedAt > 0 ||
			this.hasPriorTutorialProgress(profile);

		if (completed && !tutorialData.Completed) {
			tutorialData.Completed = true;
			if (tutorialData.CompletedAt <= 0) {
				tutorialData.CompletedAt = os.time();
			}
		}

		return completed;
	}

	private hasPriorTutorialProgress(profile: Profile<DataTemplate>): boolean {
		const stats = profile.Data.Statistics;
		if (stats.total_plays > 0) return true;
		if (stats.total_cash_earned > 0 || stats.total_cash_spent > 0) return true;
		if (profile.Data.RecentActivity.size() > 0) return true;
		if (profile.Data.EquippedItems.size() > 0) return true;
		if (next(profile.Data.MinigameData)[0] !== undefined) return true;
		return false;
	}

	private resolveTutorialRewardItemId(player: Player) {
		const candidateItemIds = new Array<string>();
		candidateItemIds.push(this.TUTORIAL_REWARD.itemId);
		this.TUTORIAL_REWARD_ITEM_FALLBACK_ORDER.forEach((id) => candidateItemIds.push(id));

		const ownedItemIds = new Set<string>();
		const sessionProfile = this.getSessionOnlyProfile(player);
		if (sessionProfile) {
			sessionProfile.OwnedUAIDs.forEach((uaid) => {
				const uaidInfo = this.itemManagementService.UAIDInfo.get(uaid);
				if (uaidInfo) ownedItemIds.add(uaidInfo[0]);
			});
		}

		for (const itemId of candidateItemIds) {
			if (itemId.size() === 0) continue;
			if (!this.itemManagementService.ItemInfo.has(itemId)) continue;
			if (ownedItemIds.has(itemId)) continue;
			return itemId;
		}

		if (
			this.TUTORIAL_REWARD.itemId.size() > 0 &&
			this.itemManagementService.ItemInfo.has(this.TUTORIAL_REWARD.itemId)
		) {
			return this.TUTORIAL_REWARD.itemId;
		}

		for (const [itemId] of this.itemManagementService.ItemInfo) {
			if (!ownedItemIds.has(itemId)) {
				return itemId;
			}
		}

		return undefined;
	}

	async getTutorialState(player: Player): Promise<{
		completed: boolean;
		reward_claimed: boolean;
		should_show: boolean;
	}> {
		const profile = await this.getOnlineProfile(player, true);
		if (!profile) {
			return {
				completed: true,
				reward_claimed: true,
				should_show: false,
			};
		}
		const tutorialData = profile.Data.TutorialData;
		const completed = this.ensureTutorialState(profile);
		return {
			completed,
			reward_claimed: tutorialData.RewardClaimed,
			should_show: !completed,
		};
	}

	async completeTutorial(player: Player): Promise<{
		status: "success" | "error";
		message?: string;
		completed: boolean;
		reward_claimed: boolean;
		reward?: {
			cash: number;
			gems: number;
			item_id?: string;
		};
	}> {
		const profile = await this.getOnlineProfile(player, true);
		if (!profile) {
			return {
				status: "error",
				message: "Profile not loaded",
				completed: false,
				reward_claimed: false,
			};
		}

		const tutorialData = profile.Data.TutorialData;
		if (!tutorialData.Completed) {
			tutorialData.Completed = true;
			tutorialData.CompletedAt = os.time();
		}

		let grantedCash = 0;
		let grantedGems = 0;
		let grantedItemId: string | undefined;

		if (!tutorialData.RewardClaimed) {
			if (this.TUTORIAL_REWARD.cash > 0) {
				const cashTransactionId = await this.addCash(player, this.TUTORIAL_REWARD.cash, {
					transactionType: Enum.AnalyticsEconomyTransactionType.TimedReward.Name,
					stockKeepingUnit: "TutorialReward",
				});
				if (cashTransactionId) {
					this.confirmAddCash(cashTransactionId);
					grantedCash = this.TUTORIAL_REWARD.cash;
				}
			}

			if (this.TUTORIAL_REWARD.gems > 0) {
				const gemsTransactionId = await this.addDiamonds(player, this.TUTORIAL_REWARD.gems, {
					transactionType: Enum.AnalyticsEconomyTransactionType.TimedReward.Name,
					stockKeepingUnit: "TutorialReward",
				});
				if (gemsTransactionId) {
					this.confirmAddDiamonds(gemsTransactionId);
					grantedGems = this.TUTORIAL_REWARD.gems;
				}
			}

			const tutorialRewardItemId = this.resolveTutorialRewardItemId(player);
			if (tutorialRewardItemId) {
				const granted = await this.addItemToInventory(player, tutorialRewardItemId);
				if (granted) {
					grantedItemId = tutorialRewardItemId;
				}
			}

			tutorialData.RewardClaimed = true;
			this.recordRecentActivity(
				player,
				`Completed the onboarding tutorial and claimed bonus rewards`,
				"rbxassetid://133730286428245",
			);
		}

		return {
			status: "success",
			completed: tutorialData.Completed,
			reward_claimed: tutorialData.RewardClaimed,
			reward: {
				cash: grantedCash,
				gems: grantedGems,
				item_id: grantedItemId,
			},
		};
	}

	async reloadCharacterAccessories(player: Player) {
		const character = player.Character ?? player.CharacterAdded.Wait()[0];
		const onlineProfile = await this.getOnlineProfile(player);
		const sessionProfile = this.getSessionOnlyProfile(player);
		const humanoid = character.FindFirstChildOfClass("Humanoid");
		const humanoidDescription = humanoid?.GetAppliedDescription();
		if (!humanoid || !onlineProfile || !humanoidDescription) return;
		const currentAccessories = humanoid.GetAccessories();
		const keepAccessories = new Set<string>();
		const ownedItemIds: Set<string> = new Set();

		if (sessionProfile && sessionProfile.OwnedUAIDs) {
			for (const item of sessionProfile.OwnedUAIDs) {
				const itemInfo = this.itemManagementService.UAIDInfo.get(item);
				if (itemInfo) ownedItemIds.add(itemInfo[0]);
			}
		}

		onlineProfile.Data.EquippedItems = onlineProfile.Data.EquippedItems.filter((equippedItem) =>
			ownedItemIds.has(equippedItem),
		);

		currentAccessories.forEach((accessory) => {
			const itemId = accessory.GetAttribute("ItemId") as string;
			const isEquipped = onlineProfile.Data.EquippedItems.includes(itemId);
			const isTagged = accessory.HasTag(`Wearing_${player.UserId}`);

			if (accessory.AccessoryType === Enum.AccessoryType.Hair && !isTagged) {
				keepAccessories.add(accessory.Name);
			}

			if (!isTagged || !isEquipped) {
				if (!keepAccessories.has(accessory.Name)) {
					accessory.Destroy();
				}
			}
		});

		async function getAsset(id: string): Promise<Instance | undefined> {
			let assetStorage = ServerStorage.FindFirstChild("AssetsCache") as Folder;
			if (!assetStorage) {
				assetStorage = new Instance("Folder");
				assetStorage.Name = "AssetsCache";
				assetStorage.Parent = ServerStorage;
			}

			const cachedAsset = assetStorage.FindFirstChild(id);
			if (cachedAsset) return cachedAsset.Clone();

			const start_time = tick();
			const [success, loadedAsset] = pcall(() => InsertService.LoadAsset(tonumber(id) ?? 0)) as LuaTuple<
				[boolean, Model]
			>;
			if (!success) {
				warn(`[PlayerManagementService] Failed to load asset ${id}:`, loadedAsset);
				return;
			}
			log("print", `👤 [PlayerManagementService] Took ${tick() - start_time} seconds to load asset ${id}`);

			if (!loadedAsset) return;

			loadedAsset.Parent = assetStorage;
			loadedAsset.Name = id;
			return loadedAsset.Clone();
		}

		character.SetAttribute("LoadedAccessories", true);

		const loadPromises = onlineProfile.Data.EquippedItems.map(async (itemId) => {
			const itemInfo = this.itemManagementService.ItemInfo.get(itemId);
			if (!itemInfo) return;

			const asset = await getAsset(itemInfo.asset_id);
			if (!asset) return;

			const accessoryTemplate = asset.FindFirstChildWhichIsA("Accessory", true);
			if (!accessoryTemplate) return;

			const accessory = accessoryTemplate.Clone();
			accessory.SetAttribute("ItemId", itemId);
			accessory.AddTag(`Wearing_${player.UserId}`);
			if (accessory.IsA("Accessory")) {
				humanoid.AddAccessory(accessory);
			}
		});

		await Promise.all(loadPromises);
	}

	private AddCashEconomyEvents = new Map<
		string,
		{
			player: Player;
			flowType: Enum.AnalyticsEconomyFlowType;
			currencyType: string;
			amount: number;
			endingBalance: number;
			transactionType: string;
			itemSku?: string;
			customFields?: Map<string | Enum.AnalyticsCustomFieldKeys, string>;
		}
	>();
	async addCash(
		player: Player,
		amount: number,
		data?: {
			transactionType: string;
			stockKeepingUnit?: string;
			customFields?: Map<string | Enum.AnalyticsCustomFieldKeys, string>;
		},
	) {
		const transactionId = HttpService.GenerateGUID(false);
		const onlineProfile = await this.getOnlineProfile(player);
		if (!onlineProfile) return transactionId;
		onlineProfile.Data.Cash += amount;
		onlineProfile.Data.Cash = math.floor(onlineProfile.Data.Cash);

		if (onlineProfile.Data.Cash < 0) onlineProfile.Data.Cash = 0;
		if (data) {
			this.AddCashEconomyEvents.set(transactionId, {
				player,
				flowType: amount > 0 ? Enum.AnalyticsEconomyFlowType.Source : Enum.AnalyticsEconomyFlowType.Sink,
				currencyType: "Cash",
				amount: amount < 0 ? amount * -1 : amount,
				endingBalance: onlineProfile.Data.Cash,
				transactionType: data.transactionType,
				itemSku: data.stockKeepingUnit ?? undefined,
				customFields: data.customFields,
			});

			task.delay(15, () => {
				if (this.AddCashEconomyEvents.has(transactionId)) this.AddCashEconomyEvents.delete(transactionId);
			});
		} else {
			player.SetAttribute("Cash", onlineProfile.Data.Cash);
		}

		return transactionId;
	}

	confirmAddCash(transactionId: string, log = true) {
		const data = this.AddCashEconomyEvents.get(transactionId);
		if (!data) return;
		if (!log) {
			this.AddCashEconomyEvents.delete(transactionId);
			return;
		}

		const profile = this.getOnlineProfileImmediate(data.player);
		if (profile) {
			if (data.flowType === Enum.AnalyticsEconomyFlowType.Source) {
				profile.Data.Statistics.total_cash_earned += data.amount;
			} else {
				profile.Data.Statistics.total_cash_spent += data.amount;
			}

			profile.Data.Statistics.xp += math.max(1, math.floor(data.amount / 5000));
			this.updateDerivedStatistics(profile);
			this.PlayerInformationCache.delete(data.player.UserId);
		}

		AnalyticsService.LogEconomyEvent(
			data.player,
			data.flowType,
			data.currencyType,
			data.amount,
			data.endingBalance,
			data.transactionType,
			data.itemSku,
			data.customFields,
		);

		this.AddCashEconomyEvents.delete(transactionId);
		data.player.SetAttribute("Cash", data.endingBalance);
		Events.CurrencyUpdate.fire(data.player, "Cash", data.endingBalance);

		return;
	}

	private AddDiamondsEconomyEvents = new Map<
		string,
		{
			player: Player;
			flowType: Enum.AnalyticsEconomyFlowType;
			currencyType: string;
			amount: number;
			endingBalance: number;
			transactionType: string;
			itemSku?: string;
			customFields?: Map<string | Enum.AnalyticsCustomFieldKeys, string>;
		}
	>();
	async addDiamonds(
		player: Player,
		amount: number,
		data?: {
			transactionType: string;
			stockKeepingUnit?: string;
			customFields?: Map<string | Enum.AnalyticsCustomFieldKeys, string>;
		},
	) {
		const transactionId = HttpService.GenerateGUID(false);
		const onlineProfile = await this.getOnlineProfile(player);
		if (!onlineProfile) return transactionId;
		onlineProfile.Data.Gems += amount;
		onlineProfile.Data.Gems = math.floor(onlineProfile.Data.Gems);

		if (data) {
			this.AddDiamondsEconomyEvents.set(transactionId, {
				player,
				flowType: amount > 0 ? Enum.AnalyticsEconomyFlowType.Source : Enum.AnalyticsEconomyFlowType.Sink,
				currencyType: "Gems",
				amount: amount < 0 ? amount * -1 : amount,
				endingBalance: onlineProfile.Data.Gems,
				transactionType: data.transactionType,
				itemSku: data.stockKeepingUnit ?? undefined,
				customFields: data.customFields,
			});

			task.delay(15, () => {
				if (this.AddDiamondsEconomyEvents.has(transactionId))
					this.AddDiamondsEconomyEvents.delete(transactionId);
			});
		} else {
			player.SetAttribute("Gems", onlineProfile.Data.Gems);
		}

		return transactionId;
	}

	confirmAddDiamonds(transactionId: string, log = true) {
		const data = this.AddDiamondsEconomyEvents.get(transactionId);
		if (!data) return;
		if (!log) {
			this.AddDiamondsEconomyEvents.delete(transactionId);
			return;
		}

		AnalyticsService.LogEconomyEvent(
			data.player,
			data.flowType,
			data.currencyType,
			data.amount,
			data.endingBalance,
			data.transactionType,
			data.itemSku,
			data.customFields,
		);

		this.AddDiamondsEconomyEvents.delete(transactionId);
		data.player.SetAttribute("Gems", data.endingBalance);
		Events.CurrencyUpdate.fire(data.player, "Gems", data.endingBalance);

		return;
	}

	rollbackAddCash(transactionId: string) {
		const data = this.AddCashEconomyEvents.get(transactionId);
		if (!data) return;
		this.addCash(data.player, data.amount);
		this.AddCashEconomyEvents.delete(transactionId);
	}

	rollbackAddDiamonds(transactionId: string) {
		const data = this.AddDiamondsEconomyEvents.get(transactionId);
		if (!data) return;
		this.addDiamonds(data.player, data.amount);
		this.AddDiamondsEconomyEvents.delete(transactionId);
	}

	async refreshInventory(player: Player, currencyUpdateDelay = 0) {
		const sessionProfile = this.getSessionOnlyProfile(player);
		if (!sessionProfile) return;
		const inventoryRequest = await new Request("GET", `/users/${player.UserId}/inventory`).GetResponse();
		const inventoryResponse = inventoryRequest.Response as InventoryResponse;
		const inventory = inventoryResponse.inventory;
		sessionProfile.OwnedUAIDs = inventory.map((item) => item[1]);
		this.itemManagementService.registerUAIDs(
			inventory.map((item) => {
				return [...item, player.UserId];
			}),
		);

		const currentTotalItemValue = sessionProfile.TotalItemValue ?? 0;
		sessionProfile.TotalItemValue = inventory.reduce((sum, item) => {
			const itemInfo = this.itemManagementService.ItemInfo.get(item[0]);
			return itemInfo ? sum + itemInfo.value : sum;
		}, 0);

		task.spawn(() => {
			const leaderstats = player.WaitForChild("leaderstats", 5);
			if (leaderstats) {
				const itemValue = leaderstats.FindFirstChild("Value") as IntValue;
				if (itemValue) itemValue.Value = sessionProfile.TotalItemValue;
			}
		});

		if (currentTotalItemValue !== sessionProfile.TotalItemValue) {
			task.delay(currencyUpdateDelay, () => {
				Events.CurrencyUpdate.fire(player, "ItemValue", sessionProfile.TotalItemValue);
			});
		}

		const groupedInventory = inventory.reduce((map, data) => {
			const itemId = data[0];
			if (!map.has(itemId)) {
				map.set(itemId, []);
			}
			map.get(itemId)!.push(`${data[1]}|${data[3]}`);
			return map;
		}, new Map<string, string[]>());

		Events.InventoryUpdate.fire(player, groupedInventory);
		Events.InventoryUpdae.fire(player, groupedInventory);
	}

	private offlineInventoryCache: Record<
		number,
		{
			items: [string, string, string, string][];
			lastUpdated: number;
		}
	> = [];

	public clearOfflineInventoryCache(userId: number) {
		delete this.offlineInventoryCache[userId];
	}
	async getOfflineUserInventory(userId: number) {
		const player = Players.GetPlayerByUserId(userId);
		if (player) {
			const sessionProfile = this.getSessionOnlyProfile(player);
			if (sessionProfile) {
				const inventory = sessionProfile.OwnedUAIDs.map((item) => {
					const itemInfo = this.itemManagementService.UAIDInfo.get(item);
					if (!itemInfo) return ["", "", "", ""];
					return [itemInfo[0], itemInfo[1], itemInfo[2], itemInfo[3]];
				}) as [string, string, string, string][];

				return inventory;
			}
		}

		const CACHE_COOLDOWN = 10; // seconds
		const cache = this.offlineInventoryCache[userId];
		if (cache && cache.lastUpdated + CACHE_COOLDOWN > tick()) return cache.items;

		const inventoryRequest = await new Request("GET", `/users/${userId}/inventory`).GetResponse();
		const inventoryResponse = inventoryRequest.Response as InventoryResponse;
		const inventory = inventoryResponse.inventory;

		this.offlineInventoryCache[userId] = {
			items: inventory,
			lastUpdated: tick(),
		};

		return inventory;
	}

	private async waitForTradesLoaded(player: Player) {
		if (player.GetAttribute("__TRADES_UPDATED")) return;

		const startTime = tick();
		while (!player.GetAttribute("__TRADES_UPDATED") && tick() - startTime < 5 && player.IsDescendantOf(Players)) {
			task.wait(0.1);
		}

		if (!player.GetAttribute("__TRADES_UPDATED")) {
			warn(`[PlayerManagementService] Trade sync timeout for ${player.Name}; continuing with empty trade state.`);
			player.SetAttribute("__TRADES_UPDATED", true);
		}
	}

	private PlayerInformationCache = new Map<
		number,
		{
			expiry: number;
			data: {
				pData: PlayerData;
				recentActivity: Array<{
					image: string;
					text: string;
				}>;
			};
		}
	>();

	public invalidatePlayerInformationCache(userId: number) {
		this.PlayerInformationCache.delete(userId);
	}

	public async removeItemsFromInventory(userId: number, itemCounts: Record<string, number>) {
		const request = await new Request("POST", `/users/${userId}/remove-items`, undefined, {
			item_counts: itemCounts,
		}).GetResponse();
		if (!request.Success) {
			const response = request.Response as { error?: string };
			return {
				status: "error",
				code: request.Code,
				message: response.error ?? "Failed to remove items",
			};
		}

		this.clearOfflineInventoryCache(userId);
		const targetPlayer = Players.GetPlayerByUserId(userId);
		if (targetPlayer) {
			await this.refreshInventory(targetPlayer);
		}

		const response = request.Response as { removed?: number };
		return {
			status: "OK",
			removed: response.removed ?? 0,
		};
	}

	public async wipeOnlineProfile(player: Player) {
		const profile = await this.getOnlineProfile(player, true);
		if (!profile) return false;

		profile.Data = new DataTemplate();
		profile.Reconcile();

		const playerKey = this.KeyTemplate.format(player.UserId);
		this.SessionOnlyProfiles.set(playerKey, new SessionOnlyDataTemplate());
		this.LastStatisticsUpdate.delete(player.UserId);
		this.SessionXpTimeAccumulator.delete(player.UserId);
		this.invalidatePlayerInformationCache(player.UserId);
		this.clearOfflineInventoryCache(player.UserId);

		player.SetAttribute("Cash", profile.Data.Cash);
		player.SetAttribute("Gems", profile.Data.Gems);

		return true;
	}
	async getPlayerInformation(userId: number): Promise<{
		status: string;
		data?: {
			pData: PlayerData;
			recentActivity: Array<{
				image: string;
				text: string;
			}>;
		};
	}> {
		const cache = this.PlayerInformationCache.get(userId);
		if (cache && cache.expiry > tick()) return { status: "OK", data: cache.data };
		let data: {
			pData: PlayerData;
			recentActivity: Array<{
				image: string;
				text: string;
			}>;
		};

		if (Players.GetPlayerByUserId(userId)) {
			const player = Players.GetPlayerByUserId(userId)!;
			const profile = await this.getOnlineProfile(player);
			if (!profile) return { status: "error" };

			data = {
				pData: {
					user_id: tostring(userId),
					name: player.Name,
					display_name: player.DisplayName,
					statistics: { ...profile.Data.Statistics, current_cash: tostring(profile.Data.Cash) },
				},
				recentActivity: this.getRecentActivitiesNewestFirst(profile.Data.RecentActivity, 10),
			};

			this.PlayerInformationCache.set(userId, {
				expiry: tick() + 10,
				data,
			});
		} else {
			const request = await new Request("GET", `/users/${userId}`).GetResponse();
			const response = request.Response as GetUserDataResponse;
			if (response.status === "OK") {
				data = {
					pData: {
						...response.data.data,
						statistics: {
							...response.data.data.statistics,
							current_cash: tostring(response.data.data.current_cash),
						},
					},
					recentActivity: response.data.recent_activity,
				};
				this.PlayerInformationCache.set(userId, {
					expiry: tick() + 10,
					data,
				});
			} else {
				return { status: "error" };
			}
		}

		return { status: "OK", data };
	}

	private PlayerSearchCache = new Map<
		string,
		{
			expiry: number;
			results: {
				id: string;
				name: string;
				display_name: string;
				current_cash: number;
				current_value: number;
			}[];
		}
	>();
	private PlayerSearchCooldowns = new Map<number, number>();
	private ProfileExistenceCache = new Map<number, { expiry: number; exists: boolean }>();

	hasPlayedBefore(userId: number) {
		if (Players.GetPlayerByUserId(userId)) return true;

		const cache = this.ProfileExistenceCache.get(userId);
		if (cache && cache.expiry > tick()) {
			return cache.exists;
		}

		const key = this.KeyTemplate.format(userId);
		const [success, profile] = pcall(() => this.ProfileStore.GetAsync(key));
		const exists = success && profile !== undefined;

		this.ProfileExistenceCache.set(userId, {
			expiry: tick() + 30,
			exists,
		});

		if (!success) {
			warn(`[PlayerManagementService] Failed to check profile existence for ${userId}`);
		}

		return exists;
	}

	async searchPlayers(
		player: Player,
		query: string,
		sortOrder: "value_high" | "value_low" | "name_a-z" | "name_z-a",
	) {
		if (this.PlayerSearchCooldowns.has(player.UserId)) {
			const cooldown = this.PlayerSearchCooldowns.get(player.UserId);
			if (cooldown && cooldown > tick()) return;
		}

		const cacheKey = `${query}::${sortOrder}`;

		const cache = this.PlayerSearchCache.get(cacheKey);
		if (cache && cache.expiry > tick()) return cache.results;
		const request = await new Request("GET", `/search/users/`, undefined, undefined, {
			keywords: query,
			limit: `25`,
			sort: sortOrder,
		}).GetResponse();

		if (request.Code === 200) {
			const response = request.Response as {
				status: string;
				results: {
					id: string;
					name: string;
					display_name: string;
					current_cash: number;
					current_value: number;
				}[];
			};

			const filteredResults = response.results.filter((entry) => {
				const resultUserId = tonumber(entry.id) ?? 0;
				if (resultUserId <= 0) return false;
				return this.hasPlayedBefore(resultUserId);
			});

			this.PlayerSearchCache.set(cacheKey, {
				expiry: tick() + 60,
				results: filteredResults,
			});

			this.PlayerSearchCooldowns.set(player.UserId, tick() + 0.1);
			return filteredResults;
		}

		return [];
	}

	async initialiseDailyRewards(player: Player) {
		const profile = await this.getOnlineProfile(player);
		if (!profile) return;

		if (next(profile.Data.DailyRewards)[0] === undefined) {
			this.generateDailyRewardBlock(profile, 1);
			return;
		}

		let streak = 0;
		for (const [day, reward] of pairs(profile.Data.DailyRewards)) {
			if (reward.claimed_at > 0) {
				const dayNum = tonumber(day) || 0;
				if (dayNum > streak) streak = dayNum;
			}
		}

		if (streak > 0 && streak % 10 === 0) {
			const nextBlockStart = streak + 1;
			if (!profile.Data.DailyRewards[tostring(nextBlockStart)]) {
				this.generateDailyRewardBlock(profile, nextBlockStart);
			}
		}
	}

	private generateDailyRewardBlock(profile: Profile<DataTemplate>, startDay: number) {
		const gemsInBlock = math.random(0, 1) === 1 ? 4 : 5;
		const cashInBlock = 9 - gemsInBlock;
		const rewardPool = new Array<"Gems" | "Cash">();
		for (let i = 0; i < gemsInBlock; i++) rewardPool.push("Gems");
		for (let i = 0; i < cashInBlock; i++) rewardPool.push("Cash");
		for (let i = rewardPool.size() - 1; i > 0; i--) {
			const j = math.random(1, i + 1) - 1;
			const temp = rewardPool[i];
			rewardPool[i] = rewardPool[j];
			rewardPool[j] = temp;
		}

		let rewardIndex = 0;

		for (let day = startDay; day < startDay + 10; day++) {
			const key = tostring(day);
			if (profile.Data.DailyRewards[key]) continue;
			if (day % 10 === 0) {
				const randItemId = this.itemManagementService.getRandomItemBetweenValues(20000, 300000) ?? "";
				profile.Data.DailyRewards[key] = {
					claimed_at: 0,
					reward: "Item",
					reward_data: randItemId,
				};
				continue;
			}

			const rewardType = rewardPool[rewardIndex++];
			if (rewardType === "Gems") {
				const gemReward = math.random(20, 150);
				profile.Data.DailyRewards[key] = {
					claimed_at: 0,
					reward: "Gems",
					reward_data: tostring(gemReward),
				};
			} else {
				const cashReward = math.random(10000, 2000000);
				profile.Data.DailyRewards[key] = {
					claimed_at: 0,
					reward: "Cash",
					reward_data: tostring(cashReward),
				};
			}
		}
	}

	private getMostRecentRewards(
		rewards: Record<string, { claimed_at: number; reward: string; reward_data: string }>,
		maxDays = 10,
	) {
		const days = new Array<number>();
		for (const [day] of pairs(rewards)) {
			const numDay = tonumber(day as string) || 0;
			if (numDay > 0) days.push(numDay);
		}
		days.sort((a, b) => a < b);

		const startIndex = math.max(days.size() - maxDays, 0);
		const recent: Record<string, { claimed_at: number; reward: string; reward_data: string }> = {};

		for (let i = startIndex; i < days.size(); i++) {
			const key = tostring(days[i]);
			recent[key] = rewards[key];
		}

		return recent;
	}

	async claimDailyReward(player: Player): Promise<{
		available: boolean;
		rewards: Record<string, { claimed_at: number; reward: string; reward_data: string }>;
		nextAvailableAt?: number;
	}> {
		const profile = await this.getOnlineProfile(player);
		if (!profile) {
			log(
				"warn",
				`❌ [PlayerManagementService] Failed to claim daily reward for ${player.Name} (${player.UserId}): Profile not found`,
			);
			return { available: false, rewards: {} };
		}

		const initialInfo = await this.getDailyRewardInfo(player);
		if (!initialInfo.available) {
			log(
				"print",
				`ℹ️ [PlayerManagementService] Daily reward not available for ${player.Name} (${player.UserId}): Already claimed or not yet available`,
			);
			return initialInfo;
		}

		const currentTime = os.time();
		const timezoneDiff = profile.Data.UserData.TimezoneDifferenceFromUTC;
		const playerCurrentTime = currentTime + timezoneDiff * 60;

		const playerDate = os.date("*t", playerCurrentTime);
		if (!playerDate) {
			log(
				"warn",
				`❌ [PlayerManagementService] Failed to claim daily reward for ${player.Name} (${player.UserId}): Invalid player date`,
			);
			return { available: false, rewards: this.getMostRecentRewards(profile.Data.DailyRewards) };
		}

		const today6AM =
			os.time({
				year: playerDate.year,
				month: playerDate.month,
				day: playerDate.day,
				hour: 6,
				min: 0,
				sec: 0,
			}) -
			timezoneDiff * 60;

		let mostRecentClaimedTime = 0;
		let streak = 0;
		for (const [day, reward] of pairs(profile.Data.DailyRewards)) {
			const dayNum = tonumber(day) || 0;
			if (reward.claimed_at > mostRecentClaimedTime) mostRecentClaimedTime = reward.claimed_at;
			if (reward.claimed_at > 0 && dayNum > streak) streak = dayNum;
		}

		if (mostRecentClaimedTime > 0) {
			if (currentTime < today6AM || mostRecentClaimedTime >= today6AM) {
				log(
					"print",
					`ℹ️ [PlayerManagementService] Daily reward not available for ${player.Name} (${player.UserId}): Current time ${currentTime} < today6AM ${today6AM} or already claimed at ${mostRecentClaimedTime}`,
				);
				return await this.getDailyRewardInfo(player);
			}
		}

		streak += 1;

		const todayKey = tostring(streak);

		const rewardEntry = profile.Data.DailyRewards[todayKey];
		if (!rewardEntry) {
			log(
				"warn",
				`❌ [PlayerManagementService] Failed to claim daily reward for ${player.Name} (${player.UserId}): No reward entry found for day ${todayKey}`,
			);
			return await this.getDailyRewardInfo(player);
		}
		if (rewardEntry.claimed_at > 0) {
			log(
				"warn",
				`❌ [PlayerManagementService] Failed to claim daily reward for ${player.Name} (${player.UserId}): Reward for day ${todayKey} already claimed at ${rewardEntry.claimed_at}`,
			);
			return await this.getDailyRewardInfo(player);
		}
		rewardEntry.claimed_at = currentTime;

		if (rewardEntry.reward === "Item") {
			const itemId = rewardEntry.reward_data;
			if (itemId !== "") {
				task.spawn(() => {
					this.addItemToInventory(player, itemId);
				});
			} else {
				log(
					"warn",
					`❌ [PlayerManagementService] Failed to add item reward for ${player.Name} (${player.UserId}): Empty item ID`,
				);
			}
		} else if (rewardEntry.reward === "Gems") {
			const gemReward = tonumber(rewardEntry.reward_data) || 0;
			if (gemReward > 0) {
				const transactionId = await this.addDiamonds(player, gemReward, {
					transactionType: Enum.AnalyticsEconomyTransactionType.TimedReward.Name,
					stockKeepingUnit: `DailyReward`,
				});
				if (transactionId) this.confirmAddDiamonds(transactionId);
			} else {
				log(
					"warn",
					`❌ [PlayerManagementService] Failed to add gem reward for ${player.Name} (${player.UserId}): Invalid gem amount ${rewardEntry.reward_data}`,
				);
			}
		} else {
			const cashReward = tonumber(rewardEntry.reward_data) || 0;
			if (cashReward > 0) {
				const transactionId = await this.addCash(player, cashReward, {
					transactionType: Enum.AnalyticsEconomyTransactionType.TimedReward.Name,
					stockKeepingUnit: `DailyReward`,
				});
				if (transactionId) this.confirmAddCash(transactionId);
			} else {
				log(
					"warn",
					`❌ [PlayerManagementService] Failed to add cash reward for ${player.Name} (${player.UserId}): Invalid cash amount ${rewardEntry.reward_data}`,
				);
			}
		}

		if (streak % 10 === 0) {
			const nextBlockStart = streak + 1;
			this.generateDailyRewardBlock(profile, nextBlockStart);
		}

		const tomorrow6AM =
			os.time({
				year: playerDate.year,
				month: playerDate.month,
				day: playerDate.day + 1,
				hour: 6,
				min: 0,
				sec: 0,
			}) -
			timezoneDiff * 60;

		log(
			"print",
			`✅ [PlayerManagementService] Successfully claimed daily reward for ${player.Name} (${player.UserId}) on day ${streak}`,
		);

		return {
			available: false,
			rewards: this.getMostRecentRewards(profile.Data.DailyRewards),
			nextAvailableAt: tomorrow6AM,
		};
	}

	async getDailyRewardInfo(player: Player): Promise<{
		available: boolean;
		rewards: Record<string, { claimed_at: number; reward: string; reward_data: string }>;
		nextAvailableAt?: number;
	}> {
		const profile = await this.getOnlineProfile(player, true);
		if (!profile) return { available: false, rewards: {} };

		if (next(profile.Data.DailyRewards)[0] === undefined) await this.initialiseDailyRewards(player);
		const currentTime = os.time();
		const timezoneDiff = profile.Data.UserData.TimezoneDifferenceFromUTC;
		const playerCurrentTime = currentTime + timezoneDiff * 60;
		const playerDate = os.date("*t", playerCurrentTime);
		if (!playerDate) return { available: false, rewards: this.getMostRecentRewards(profile.Data.DailyRewards) };
		const today6AM =
			os.time({
				year: playerDate.year,
				month: playerDate.month,
				day: playerDate.day,
				hour: 6,
				min: 0,
				sec: 0,
			}) -
			timezoneDiff * 60;

		const tomorrow6AM =
			os.time({
				year: playerDate.year,
				month: playerDate.month,
				day: playerDate.day + 1,
				hour: 6,
				min: 0,
				sec: 0,
			}) -
			timezoneDiff * 60;

		let mostRecentClaimedTime = 0;
		for (const [_, reward] of pairs(profile.Data.DailyRewards)) {
			if (reward.claimed_at > mostRecentClaimedTime) mostRecentClaimedTime = reward.claimed_at;
		}

		let available = mostRecentClaimedTime === 0 || (currentTime >= today6AM && mostRecentClaimedTime < today6AM);
		if (mostRecentClaimedTime > 0) {
			const lastClaimLocal = os.date("*t", mostRecentClaimedTime + timezoneDiff * 60);
			if (
				lastClaimLocal &&
				lastClaimLocal.year === playerDate.year &&
				lastClaimLocal.month === playerDate.month &&
				lastClaimLocal.day === playerDate.day
			) {
				available = false;
			}
		}

		const nextAvailableAt = !available ? tomorrow6AM : -1;
		return {
			available,
			rewards: this.getMostRecentRewards(profile.Data.DailyRewards),
			nextAvailableAt,
		};
	}

	async addItemToInventory(player: Player, itemId: string) {
		const item = this.itemManagementService.ItemInfo.get(itemId);
		if (!item) return;

		const request = new Request("POST", "/items/add", undefined, {
			user_id: tostring(player.UserId),
			item_id: itemId,
		});

		const response = await request.GetResponse<{ status: string; user_asset_id: string }>();
		if (!response.Success) return;
		await this.refreshInventory(player);
		return true;
	}

	async spinRewardWheel(player: Player): Promise<{
		status: string;
		message?: string;
		code?: number | string;
		reward_data?: string;
	}> {
		const profile = await this.getOnlineProfile(player);
		if (!profile) return { status: "error", message: "Profile not found" };

		const validSpins = profile.Data.RewardWheelData.Spins.filter(
			(spin) => !spin.used && spin.expires_at > os.time(),
		);
		if (validSpins.size() === 0) return { status: "error", message: "No valid spins found" };
		const spin = validSpins[math.random(1, validSpins.size()) - 1];
		const currentWheelData = getConfig<{
			rewards: {
				type: "item" | "cash" | "gems" | "mystery";
				value: string;
				chance: number;
				id: string;
			}[];
		}>("dailywheel");
		if (!currentWheelData) return { status: "error", message: "No wheel data found" };
		const totalChance = currentWheelData.rewards.reduce((sum, reward) => sum + reward.chance, 0);
		let randomValue = math.random() * totalChance;
		let selectedReward:
			| {
					type: "item" | "cash" | "gems" | "mystery";
					value: string;
					chance: number;
					id: string;
			  }
			| undefined;
		for (const reward of currentWheelData.rewards) {
			randomValue -= reward.chance;
			if (randomValue <= 0) {
				selectedReward = reward;
				break;
			}
		}

		if (!selectedReward) return { status: "error", message: "No reward found" };
		spin.used = true;

		let rewardData = "";
		switch (selectedReward.type) {
			case "item":
				await this.addItemToInventory(player, selectedReward.value);
				rewardData = selectedReward.value;
				break;
			case "cash": {
				const transactionId = await this.addCash(player, tonumber(selectedReward.value) || 0, {
					transactionType:
						spin.purchased_at > 0
							? Enum.AnalyticsEconomyTransactionType.TimedReward.Name
							: Enum.AnalyticsEconomyTransactionType.IAP.Name,
				});
				if (transactionId) this.confirmAddCash(transactionId);
				rewardData = selectedReward.value;
				break;
			}
			case "gems": {
				const transactionId = await this.addDiamonds(player, tonumber(selectedReward.value) || 0, {
					transactionType:
						spin.purchased_at > 0
							? Enum.AnalyticsEconomyTransactionType.TimedReward.Name
							: Enum.AnalyticsEconomyTransactionType.IAP.Name,
				});
				if (transactionId) this.confirmAddDiamonds(transactionId);
				rewardData = selectedReward.value;
				break;
			}
			case "mystery": {
				const randomItem = this.itemManagementService.getRandomItemBetweenValues(20000, 300000);
				if (randomItem) await this.addItemToInventory(player, randomItem);
				rewardData = randomItem ?? "";
				break;
			}
		}

		spin.reward_data = `${selectedReward.id}:${selectedReward.type}:${rewardData}`;
		return {
			status: "success",
			reward_data: spin.reward_data,
		};
	}
}
