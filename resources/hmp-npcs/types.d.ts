export type HmpNpcDisposition = "hostile" | "friendly";

export interface HmpNpcVector3 {
    x: number;
    y: number;
    z: number;
}

export interface HmpNpcCatalogEntry {
    id: string;
    label: string;
}

export interface HmpNpcSpawnInput {
    resource: string;
    enemyId: string;
    position: HmpNpcVector3;
    disposition?: HmpNpcDisposition;
    ownerId?: number;
    maxHealth?: number;
    scale?: number;
}

export interface HmpNpcSnapshot {
    id: number;
    enemyId: string;
    resource: string;
    disposition: HmpNpcDisposition;
    ownerId?: number;
    alive: boolean;
    health: number;
    maxHealth: number;
    scale: number;
}

export interface HmpNpcStatus {
    state: "ready" | "stopped";
    managed: number;
    resources: Record<string, number>;
    catalogSize: number;
    maximumManagedNpcs: number;
    maximumPerResource: number;
}

export interface HmpNpcs {
    catalog: {
        get(id: string): HmpNpcCatalogEntry | null;
        has(id: string): boolean;
        list(): HmpNpcCatalogEntry[];
    };
    spawn(input: HmpNpcSpawnInput): HmpNpcSnapshot;
    destroy(id: number, resource: string): boolean;
    clear(resource: string): number;
    get(id: number): HmpNpcSnapshot | null;
    list(resource?: string): HmpNpcSnapshot[];
    status(): HmpNpcStatus;
}
