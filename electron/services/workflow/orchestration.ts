/**
 * Workflow orchestration for agent execution and channel delivery.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RpcFunction = <T = unknown>(method: string, params?: unknown, timeoutMs?: number) => Promise<T>;

export interface AgentExecutionRequest {
  agentId: string;
  message: string;
  sessionKey?: string;
  timeoutMs?: number;
  idempotencyKey?: string;
}

export interface AgentExecutionResult {
  success: boolean;
  response?: string;
  runId?: string;
  error?: string;
  durationMs?: number;
}

export interface ChannelDeliveryRequest {
  channelType: string;
  channelAccountId?: string;
  deliveryTarget?: string;
  agentId: string;
  message: string;
  timeoutMs?: number;
}

export interface ChannelDeliveryResult {
  success: boolean;
  delivered: boolean;
  runId?: string;
  response?: string;
  error?: string;
}

export interface ChannelStatusInfo {
  channelType: string;
  accountId?: string;
  configured: boolean;
  connected: boolean;
  name?: string;
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((block: Record<string, unknown>) => block.type === 'text' && block.text)
      .map((block: Record<string, unknown>) => String(block.text))
      .join('\n');
  }
  if (content && typeof content === 'object') {
    const obj = content as Record<string, unknown>;
    if (typeof obj.text === 'string') return obj.text;
  }
  return content ? String(content) : '';
}

function extractAssistantResponse(historyData: unknown): string {
  if (!historyData || typeof historyData !== 'object') return '';

  const data = historyData as Record<string, unknown>;
  const rawMessages = data.messages ?? data.payload ?? (Array.isArray(data) ? data : null);
  const messages = Array.isArray(rawMessages)
    ? rawMessages as Array<Record<string, unknown>>
    : null;

  if (!messages) return '';

  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      return extractTextFromContent(messages[i].content);
    }
  }

  return '';
}

async function waitForGatewayRun(
  rpc: RpcFunction,
  runId: string | undefined,
  timeoutMs: number,
  label: string,
): Promise<void> {
  if (!runId) return;

  const waitResult = await rpc<{ status?: string; error?: string }>(
    'agent.wait',
    { runId, timeoutMs },
    timeoutMs + 5000,
  );

  if (waitResult?.status && waitResult.status !== 'ok') {
    throw new Error(
      waitResult.error
        ? `${label} failed: ${waitResult.error}`
        : `${label} finished with status "${waitResult.status}"`,
    );
  }
}

function buildRelayMessage(originalMessage: string): string {
  if (!originalMessage || originalMessage.trim() === '' || originalMessage === '{}') {
    return 'No message content available.';
  }

  return `Reply with ONLY the following content, no commentary:\n\n${originalMessage}`;
}

export class WorkflowOrchestrator {
  private rpc: RpcFunction | null = null;

  setRpc(rpc: RpcFunction): void {
    this.rpc = rpc;
  }

  async executeAgent(req: AgentExecutionRequest): Promise<AgentExecutionResult> {
    if (!this.rpc) {
      return {
        success: false,
        response: `[Simulated - Gateway offline] Agent "${req.agentId}" execution skipped`,
        error: 'Gateway not connected',
      };
    }

    const sessionKey = req.sessionKey ?? `agent:${req.agentId}:orchestrated-${Date.now()}`;
    const startedAt = Date.now();

    try {
      const timeoutMs = req.timeoutMs ?? 120000;
      const result = await this.rpc<{ runId?: string }>(
        'chat.send',
        {
          sessionKey,
          message: req.message,
          deliver: false,
          idempotencyKey: req.idempotencyKey ?? `orch-${Date.now()}`,
        },
        timeoutMs,
      );

      await waitForGatewayRun(
        this.rpc,
        result?.runId,
        timeoutMs,
        `Agent "${req.agentId}"`,
      );

      const historyData = await this.rpc<Record<string, unknown>>(
        'chat.history',
        { sessionKey, limit: 30 },
        15000,
      );
      const response = extractAssistantResponse(historyData);

      return {
        success: true,
        response: response || `Agent "${req.agentId}" executed successfully`,
        runId: result?.runId,
        durationMs: Date.now() - startedAt,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startedAt,
      };
    }
  }

  async deliverToChannel(req: ChannelDeliveryRequest): Promise<ChannelDeliveryResult> {
    if (!this.rpc) {
      return {
        success: false,
        delivered: false,
        error: 'Gateway not connected',
      };
    }

    const timeoutMs = req.timeoutMs ?? 120000;
    const relayMessage = buildRelayMessage(req.message);
    const cronJobName = `wf-deliver-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    try {
      const deliveryConfig = {
        mode: 'announce' as const,
        channel: req.channelType,
        ...(req.deliveryTarget ? { to: req.deliveryTarget } : {}),
        ...(req.channelAccountId ? { accountId: req.channelAccountId } : {}),
      };

      console.log(`[Orchestrator] Delivering to channel "${req.channelType}" via cron one-shot, agent="${req.agentId}"`);
      console.log(`[Orchestrator] Delivery config:`, JSON.stringify(deliveryConfig));
      console.log(`[Orchestrator] Relay message (${relayMessage.length} chars):`, relayMessage.slice(0, 200));

      // Step 1: Create a one-shot cron job with explicit channel delivery
      const cronJob = await this.rpc<{ id?: string }>('cron.add', {
        name: cronJobName,
        schedule: { kind: 'cron', expr: '0 0 1 1 *' }, // far future, never auto-fires
        payload: { kind: 'agentTurn', message: relayMessage },
        delivery: deliveryConfig,
        agentId: req.agentId,
        enabled: true,
        wakeMode: 'next-heartbeat',
        sessionTarget: 'isolated',
      }, 30000);

      const cronJobId = cronJob?.id;
      if (!cronJobId) {
        throw new Error('cron.add did not return an id');
      }

      // Step 2: Force-run immediately
      console.log(`[Orchestrator] Running cron task "${cronJobId}" for channel "${req.channelType}"`);
      const runResult = await this.rpc<unknown>('cron.run', { id: cronJobId, mode: 'force' }, timeoutMs);
      console.log(`[Orchestrator] cron.run result:`, JSON.stringify(runResult));

      // Step 3: Clean up
      try {
        await this.rpc<unknown>('cron.remove', { id: cronJobId }, 10000);
        console.log(`[Orchestrator] Cleaned up cron task "${cronJobId}"`);
      } catch (cleanupErr) {
        console.warn(`[Orchestrator] Cleanup of cron task "${cronJobId}" failed (non-fatal):`, cleanupErr);
      }

      return {
        success: true,
        delivered: true,
        runId: cronJobId,
        response: req.message,
      };
    } catch (err) {
      return {
        success: false,
        delivered: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async getChannelStatuses(): Promise<ChannelStatusInfo[]> {
    if (!this.rpc) return [];

    try {
      const data = await this.rpc<{
        channelOrder?: string[];
        channels?: Record<string, { configured?: boolean; running?: boolean }>;
        channelAccounts?: Record<string, Array<{
          accountId?: string;
          configured?: boolean;
          connected?: boolean;
          running?: boolean;
          name?: string;
          linked?: boolean;
        }>>;
      }>('channels.status', { probe: true });

      if (!data) return [];

      const result: ChannelStatusInfo[] = [];
      const order = data.channelOrder || Object.keys(data.channels || {});

      for (const chType of order) {
        const accounts = data.channelAccounts?.[chType] || [];
        const configuredAccounts = accounts.filter((account) => account.configured === true);

        if (configuredAccounts.length > 0) {
          for (const account of configuredAccounts) {
            result.push({
              channelType: chType,
              accountId: account.accountId,
              configured: true,
              connected: account.connected === true || account.linked === true || account.running === true,
              name: account.name,
            });
          }
        } else {
          const summary = data.channels?.[chType];
          if (summary?.configured || summary?.running) {
            result.push({
              channelType: chType,
              configured: true,
              connected: !!summary.running,
            });
          }
        }
      }

      return result;
    } catch {
      return [];
    }
  }
}

export const orchestrator = new WorkflowOrchestrator();
