export interface HmpDuelPlayer {
    id: number;
    nickname: string;
    connected?: boolean;
    virtualWorld?: number;
    location?(): { areaId: string; regionId: string } | null;
    emit(eventName: string, payload?: unknown): void;
    sendChat?(message: string): void;
}

export interface HmpDuelChallenge { sessionId: string; invitationId: string; challengerId: number; targetId: number; expiresAt: string }
export interface HmpDuelsStatus { state: "ready" | "stopped"; pending: number; countdowns: number; live: number; uptimeMs: number }

export interface HmpDuels<P = HmpDuelPlayer> {
    challenge(challenger: P, target: P): Promise<HmpDuelChallenge>;
    accept(target: P): Promise<boolean>;
    decline(target: P, reason?: string): Promise<boolean>;
    cancel(challenger: P): Promise<boolean>;
    forfeit(player: P): Promise<boolean>;
    status(): HmpDuelsStatus;
}
