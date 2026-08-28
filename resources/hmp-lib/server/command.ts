const COMMAND_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;
import type {
    HmpCommandApi,
    HmpCommandContext,
    HmpCommandDescription,
    HmpCommandRouter,
    HmpLogger,
    HmpPlayerApi,
    HmpPlayerLike,
} from "../types";

type CommandHandler<P extends HmpPlayerLike> = (context: HmpCommandContext<P>) => unknown;
interface CommandSpec<P extends HmpPlayerLike> {
    aliases?: string[];
    description?: string;
    usage?: string;
    guard?: (context: HmpCommandContext<P>) => true | false | string | Promise<true | false | string>;
    errorMessage?: string | false;
}
interface CommandEntry<P extends HmpPlayerLike> extends HmpCommandDescription {
    guard: CommandSpec<P>["guard"] | null;
    errorMessage: string | false;
    handler: CommandHandler<P>;
}

function normalizeName(value: unknown): string {
    const name = String(value || "").trim().toLowerCase();
    if (!COMMAND_PATTERN.test(name)) throw new TypeError(`invalid command name '${value}'`);
    return name;
}

function createCommandApi<P extends HmpPlayerLike>(options: {
    player: HmpPlayerApi<P>;
    logger?: Pick<HmpLogger, "error">;
}): HmpCommandApi<P> {
    const playerApi = options.player;
    if (!playerApi || typeof playerApi.resolve !== "function") throw new TypeError("command API requires the player API");
    const defaultLogger = options.logger || console;

    function createRouter(routerOptions: { prefix?: string; logger?: Pick<HmpLogger, "error"> } = {}): HmpCommandRouter<P> {
        const commands = new Map<string, CommandEntry<P>>();
        const aliases = new Map<string, string>();
        const logger = routerOptions.logger || defaultLogger;
        const prefix = routerOptions.prefix ? String(routerOptions.prefix) : "";

        function replyTo(player: P, message: unknown): boolean {
            if (!player || typeof player.sendChat !== "function") return false;
            player.sendChat(prefix ? `${prefix} ${message}` : String(message));
            return true;
        }

        function register(name: string, handler: CommandHandler<P>): () => boolean;
        function register(name: string, spec: CommandSpec<P>, handler: CommandHandler<P>): () => boolean;
        function register(name: string, specOrHandler: CommandSpec<P> | CommandHandler<P>, suppliedHandler?: CommandHandler<P>): () => boolean {
            const canonical = normalizeName(name);
            const spec = typeof specOrHandler === "function" ? {} : specOrHandler;
            const handler = typeof specOrHandler === "function" ? specOrHandler : suppliedHandler;
            if (typeof handler !== "function") throw new TypeError(`handler for '${canonical}' must be a function`);
            if (commands.has(canonical) || aliases.has(canonical)) throw new Error(`command '${canonical}' is already registered`);

            const names = Array.from(new Set((spec.aliases || []).map(normalizeName)));
            for (const alias of names) {
                if (alias === canonical || commands.has(alias) || aliases.has(alias)) {
                    throw new Error(`command alias '${alias}' is already registered`);
                }
            }

            const errorMessage: string | false = spec.errorMessage === false ? false : String(spec.errorMessage || "The command could not be completed.");
            const entry: CommandEntry<P> = {
                name: canonical,
                aliases: names,
                description: String(spec.description || ""),
                usage: String(spec.usage || `/${canonical}`),
                guard: typeof spec.guard === "function" ? spec.guard : null,
                errorMessage,
                handler,
            };
            commands.set(canonical, entry);
            for (const alias of names) aliases.set(alias, canonical);

            return () => unregister(canonical);
        }

        function unregister(name: string): boolean {
            const requested = normalizeName(name);
            const canonical = aliases.get(requested) || requested;
            const entry = commands.get(canonical);
            if (!entry) return false;
            commands.delete(canonical);
            for (const alias of entry.aliases) aliases.delete(alias);
            return true;
        }

        function lookup(name: string): CommandEntry<P> | null {
            const requested = String(name || "").toLowerCase();
            return commands.get(aliases.get(requested) || requested) || null;
        }

        function describe(entry: CommandEntry<P> | null): HmpCommandDescription | null {
            if (!entry) return null;
            return {
                name: entry.name,
                aliases: [...entry.aliases],
                description: entry.description,
                usage: entry.usage,
            };
        }

        function get(name: string): HmpCommandDescription | null {
            return describe(lookup(name));
        }

        async function handle(player: P, message: string, command: string, args: string[]): Promise<boolean> {
            const entry = lookup(command);
            if (!entry) return false;
            const values = Array.isArray(args) ? args.map(String) : [];
            const context = {
                player,
                message: String(message || ""),
                command: entry.name,
                invokedAs: String(command || "").toLowerCase(),
                args: values,
                usage: entry.usage,
                reply: (text: unknown) => replyTo(player, text),
                resolvePlayer: (query: string | number | P, resolveOptions?: { allowSelf?: boolean; caseSensitive?: boolean }) => playerApi.resolve(query, player, resolveOptions),
                findPlayer: (query: string | number | P, resolveOptions?: { allowSelf?: boolean; caseSensitive?: boolean }) => playerApi.find(query, player, resolveOptions),
            };

            try {
                if (entry.guard) {
                    const verdict = await entry.guard(context);
                    if (verdict !== true) {
                        if (typeof verdict === "string" && verdict) context.reply(verdict);
                        return true;
                    }
                }
                await entry.handler(context);
            } catch (error) {
                const messageText = error instanceof Error ? error.message : String(error);
                if (logger && typeof logger.error === "function") logger.error(`/${entry.name} failed: ${messageText}`);
                if (entry.errorMessage !== false) context.reply(entry.errorMessage);
            }
            return true;
        }

        function list(): HmpCommandDescription[] {
            return [...commands.values()].map((entry) => describe(entry) as HmpCommandDescription);
        }

        return Object.freeze({ register, unregister, get, handle, list });
    }

    return Object.freeze({ createRouter });
}

export = { createCommandApi };
// TypeScript source.
