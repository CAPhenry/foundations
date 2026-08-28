import type { HmpAudioPlayOptions, HmpAudioPlayer } from "../types";

export interface NativeServerAudio<P extends HmpAudioPlayer> {
    playSoundAt(event: string, x: number, y: number, z: number, options?: Omit<HmpAudioPlayOptions, "held">): number;
    playSoundOnPlayer(player: P, event: string, options?: Omit<HmpAudioPlayOptions, "held">): number;
    playSoundForPlayer(player: P, event: string, options?: Omit<HmpAudioPlayOptions, "range" | "held">): number;
    playSoundForAll(event: string, options?: Omit<HmpAudioPlayOptions, "range" | "held">): number;
    stopSound(soundId: number): boolean;
    stopEventFor(event: string): string;
    bankFor(event: string): string;
    loadBank(bank: string): void;
    unloadBank(bank: string): void;
}

export interface AudioConfig {
    aliases: Record<string, string>;
    defaultRange: number;
    maxActivePerOwner: number;
    oneShotHandleMs: number;
    enableCommands: boolean;
    command: string;
}

export interface AudioEvents {
    emit(eventName: string, payload?: unknown): void;
}
