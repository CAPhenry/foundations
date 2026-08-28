import type { HmpAudioPlayOptions } from "../types";

export interface NativeClientAudio {
    playSound(event: string, options?: Omit<HmpAudioPlayOptions, "range" | "bank" | "held">): number;
    playSoundAt(event: string, x: number, y: number, z: number, options?: Omit<HmpAudioPlayOptions, "range" | "bank" | "held">): number;
    stopSound(playingId: number): boolean;
    stopEventFor(event: string): string;
    bankFor(event: string): string;
    loadBank(bank: string): boolean;
    unloadBank(bank: string): boolean;
}
