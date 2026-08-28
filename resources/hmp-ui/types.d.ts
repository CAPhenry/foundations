export type HmpUiTone = "inform" | "success" | "warning" | "error";

export interface HmpUiNotification {
    title?: string;
    description: string;
    tone?: HmpUiTone;
    duration?: number;
}

export interface HmpUiAlert {
    title: string;
    content?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    cancel?: boolean;
    timeoutMs?: number;
}

export interface HmpUiSelectOption {
    label: string;
    value: string;
}

export interface HmpUiInputField {
    name: string;
    label: string;
    type?: "text" | "password" | "textarea" | "number" | "checkbox" | "select";
    description?: string;
    placeholder?: string;
    required?: boolean;
    default?: string | number | boolean;
    min?: number;
    max?: number;
    options?: HmpUiSelectOption[];
}

export interface HmpUiInputDialog {
    title: string;
    fields: HmpUiInputField[];
    submitLabel?: string;
    cancelLabel?: string;
    allowCancel?: boolean;
    timeoutMs?: number;
}

export type HmpUiInputValue = string | number | boolean;
export type HmpUiInputResult = Record<string, HmpUiInputValue>;

export interface HmpUiContextMetadata {
    label: string;
    value: string;
}

export interface HmpUiContextOption {
    id: string;
    title: string;
    /** Absolute http(s) or resource URL rendered as a decorative item icon. */
    icon?: string;
    description?: string;
    disabled?: boolean;
    tone?: HmpUiTone;
    metadata?: HmpUiContextMetadata[];
}

export interface HmpUiContextMenu {
    title: string;
    description?: string;
    options: HmpUiContextOption[];
    cancelLabel?: string;
    canClose?: boolean;
    timeoutMs?: number;
}

export interface HmpUiProgress {
    label: string;
    duration: number;
    canCancel?: boolean;
    cancelLabel?: string;
    timeoutMs?: number;
}

export interface HmpUiPlayer {
    id: number;
    connected?: boolean;
    emit(eventName: string, payload?: unknown): void;
}

export interface HmpUiStatus {
    pending: number;
    players: number;
    uptimeMs: number;
}

export interface HmpUiServer<P = HmpUiPlayer> {
    notify(player: P, notification: string | HmpUiNotification): boolean;
    alert(player: P, dialog: HmpUiAlert): Promise<"confirm" | "cancel" | null>;
    input(player: P, dialog: HmpUiInputDialog): Promise<HmpUiInputResult | null>;
    context(player: P, menu: HmpUiContextMenu): Promise<string | null>;
    progress(player: P, progress: HmpUiProgress): Promise<boolean>;
    close(player: P, reason?: string): boolean;
    status(): HmpUiStatus;
}

export interface HmpUiClient {
    notify(notification: string | HmpUiNotification): boolean;
    alert(dialog: HmpUiAlert): Promise<"confirm" | "cancel" | null>;
    input(dialog: HmpUiInputDialog): Promise<HmpUiInputResult | null>;
    context(menu: HmpUiContextMenu): Promise<string | null>;
    progress(progress: HmpUiProgress): Promise<boolean>;
    close(reason?: string): boolean;
    status(): { ready: boolean; queued: number; active: string | null; notificationsVisible: boolean };
}
