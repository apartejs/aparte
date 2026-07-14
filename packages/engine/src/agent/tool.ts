/**
 * tool.ts — Tool interface + Registry pour agent loop.
 *
 * Pattern : tools are first-class citizens registered centrally.
 * Tool name → handler function. Agent loop dispatches by name.
 *
 * Markers : chaque tool a un mode d'activation aligné sur l'UX user :
 *   - mandatory_always   : toujours exposé au LLM (ask_question, run_code basics)
 *   - auto_when_available: exposé conditionnellement (retrieve_file si fichiers, etc.)
 *   - user_optional      : exposé seulement si user a coché (settings)
 *   - disabled           : jamais exposé (user opt-out OU pas wired V1)
 *
 * getActiveDescriptors(ctx) filtre selon les markers + état runtime.
 * Inspired by Anthropic tool use, OpenAI function calling, Claude Agent SDK.
 */

/**
 * Tool argument schema — JSON Schema subset.
 * Aligned with OpenAI function calling parameters.
 */
export interface ToolParameterSchema {
    type: 'object';
    properties: Record<string, {
        type: 'string' | 'number' | 'boolean' | 'object' | 'array';
        description?: string;
        enum?: readonly string[];
        items?: object;
        minItems?: number;
        maxItems?: number;
    }>;
    required?: readonly string[];
}

/**
 * Tool descriptor exposed to the LLM.
 */
export interface ToolDescriptor {
    /** Unique tool name — must match LLM-output tool calls. */
    name: string;
    /** Description used by LLM to decide when to call (Anthropic Skills format recommended). */
    description: string;
    /** JSON Schema for arguments. */
    parameters: ToolParameterSchema;
}

/**
 * Tool execution context — passed to handlers and to marker availability checks.
 */
export interface ToolContext {
    /** AbortSignal — tools should honor for cancellation. */
    signal?: AbortSignal;
    /** Conversation ID — useful for storage scoping. */
    conversationId?: string;
    /** User message that triggered this run — useful for context. */
    userMessage?: string;
    /**
     * User preferences (from settings UI).
     * Used by getActiveDescriptors() to filter user_optional tools.
     */
    preferences?: {
        /** Set of tool names the user has explicitly enabled (user_optional mode). */
        enabledTools?: Set<string>;
        /** Set of skill names currently active (used by skill-related tools). */
        activeSkills?: Set<string>;
    };
}

/**
 * Marker = how / when this tool is exposed to the LLM.
 *
 * Tools without an explicit marker default to `mandatory_always`.
 */
export type ToolMarker =
    /** Always in tools[] array. User cannot disable. (e.g. ask_question, run_code) */
    | { mode: 'mandatory_always' }
    /**
     * Conditionally in tools[] based on runtime context.
     * Provide a `reason` for the user-facing settings UI.
     * (e.g. retrieve_file only if files attached, retrieve_skill only if skill enabled)
     */
    | { mode: 'auto_when_available'; reason: string }
    /**
     * Opt-in by user via settings. Default may be enabled or not.
     * (e.g. remember_fact, future MCP tools)
     */
    | { mode: 'user_optional'; defaultEnabled?: boolean }
    /** Never exposed. Useful to keep a tool in registry but hide it (debug, deprecation). */
    | { mode: 'disabled' };

/**
 * Tool handler — invoked by the agent loop with parsed args.
 * Returns string content fed back to the LLM as TOOL_CALL_RESULT.
 *
 * Errors should be returned as a string starting with "FAILED:" rather
 * than thrown — the agent loop treats them as tool failures (not crashes).
 */
export type ToolHandler = (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>;

/**
 * Full tool definition — descriptor + handler + optional marker / availability check.
 */
export interface Tool {
    descriptor: ToolDescriptor;
    handler: ToolHandler;
    /**
     * Marker (default = mandatory_always if omitted).
     * Filtered by ToolRegistry.getActiveDescriptors(ctx) before LLM call.
     */
    marker?: ToolMarker;
    /**
     * Optional runtime check : returns true if tool should be exposed given ctx.
     * Used in conjunction with `auto_when_available` marker.
     * If omitted, `auto_when_available` falls back to always-available.
     */
    isAvailable?: (ctx: ToolContext) => boolean | Promise<boolean>;
}

/**
 * Tool registry — register/lookup/list tools.
 * Single instance per agent run (or per app, depending on use case).
 */
export class ToolRegistry {
    private tools = new Map<string, Tool>();

    register(tool: Tool): void {
        if (this.tools.has(tool.descriptor.name)) {
            throw new Error(`Tool "${tool.descriptor.name}" already registered`);
        }
        this.tools.set(tool.descriptor.name, tool);
    }

    unregister(name: string): boolean {
        return this.tools.delete(name);
    }

    get(name: string): Tool | undefined {
        return this.tools.get(name);
    }

    has(name: string): boolean {
        return this.tools.has(name);
    }

    list(): Tool[] {
        return [...this.tools.values()];
    }

    /**
     * Build descriptors array — RAW, no filtering. Use sparingly (debug, full export).
     * For LLM calls, prefer getActiveDescriptors(ctx).
     */
    descriptors(): ToolDescriptor[] {
        return [...this.tools.values()].map(t => t.descriptor);
    }

    /**
     * Build descriptors array filtered by markers + runtime availability.
     * This is what should be passed to the LLM in apply_chat_template({ tools }).
     *
     * Filtering rules :
     *   - No marker → exposed (default = mandatory_always)
     *   - mandatory_always → always exposed
     *   - auto_when_available → exposed if isAvailable(ctx) === true (default true if no check)
     *   - user_optional → if the user has a preferences set it is authoritative
     *     (exposed iff enabledTools.has(name)); with NO set, falls back to defaultEnabled
     *   - disabled → never exposed
     */
    async getActiveDescriptors(ctx: ToolContext = {}): Promise<ToolDescriptor[]> {
        const active: ToolDescriptor[] = [];
        for (const tool of this.tools.values()) {
            const marker = tool.marker ?? { mode: 'mandatory_always' };

            switch (marker.mode) {
                case 'mandatory_always':
                    active.push(tool.descriptor);
                    break;
                case 'auto_when_available': {
                    const available = tool.isAvailable
                        ? await tool.isAvailable(ctx)
                        : true;  // no check defined → assume available
                    if (available) active.push(tool.descriptor);
                    break;
                }
                case 'user_optional': {
                    const userEnabled = ctx.preferences?.enabledTools?.has(tool.descriptor.name);
                    const enabled = userEnabled ?? marker.defaultEnabled ?? false;
                    if (enabled) active.push(tool.descriptor);
                    break;
                }
                case 'disabled':
                    break;  // skip
            }
        }
        return active;
    }

    /** Convenience: register multiple at once. */
    registerAll(tools: Tool[]): void {
        for (const t of tools) this.register(t);
    }

    clear(): void {
        this.tools.clear();
    }
}
