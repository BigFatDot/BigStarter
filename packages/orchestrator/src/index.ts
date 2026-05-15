import Anthropic from '@anthropic-ai/sdk'
import type {
  OrchestratorPhase,
  OrchestratorContext,
  AgentTask,
  EscalationRequest,
  ProofBundle,
  SubAgentType,
} from './types.js'

const TICK_INTERVAL_MS = 5 * 60 * 1000  // 5 min

export class ProjectOrchestrator {
  private ctx: OrchestratorContext
  private claude: Anthropic
  private timer?: ReturnType<typeof setInterval>

  constructor(ctx: OrchestratorContext) {
    this.ctx = ctx
    this.claude = new Anthropic()
  }

  start(): void {
    this.timer = setInterval(() => this.tick().catch(console.error), TICK_INTERVAL_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
  }

  async tick(): Promise<void> {
    switch (this.ctx.phase) {
      case 'idle':
        await this.phaseIdle()
        break
      case 'planning':
        await this.phasePlanning()
        break
      case 'executing':
        await this.phaseExecuting()
        break
      case 'verifying':
        await this.phaseVerifying()
        break
      case 'reporting':
        await this.phaseReporting()
        break
      case 'waiting_community':
        await this.phaseWaitingCommunity()
        break
    }
  }

  // ------------------------------------
  // Phase handlers
  // ------------------------------------

  private async phaseIdle(): Promise<void> {
    const backlog = await this.ctx.pkg.getFeaturesByStatus('accepted')
    if (backlog.length > 0) {
      this.transition('planning')
    }
  }

  private async phasePlanning(): Promise<void> {
    // Build task dependency graph from accepted features
    const features = await this.ctx.pkg.getFeaturesByStatus('accepted')
    const tasks = await this.decomposeFeatures(features.map(f => f.id))
    this.ctx.taskQueue = tasks
    this.transition('executing')
  }

  private async phaseExecuting(): Promise<void> {
    const ready = this.ctx.taskQueue.filter(
      t => t.status === 'pending' && this.areDepsComplete(t),
    )

    await Promise.allSettled(ready.map(t => this.dispatchTask(t)))

    const allDone = this.ctx.taskQueue.every(
      t => t.status === 'complete' || t.status === 'failed' || t.status === 'skipped',
    )
    if (allDone) this.transition('verifying')
  }

  private async phaseVerifying(): Promise<void> {
    const built = this.ctx.taskQueue.filter(
      t => t.type === 'build' && t.status === 'complete',
    )
    for (const task of built) {
      await this.dispatchSubAgent('verifier', {
        taskId: task.id,
        featureId: task.featureId,
        result: task.result,
      })
    }
    this.transition('reporting')
  }

  private async phaseReporting(): Promise<void> {
    await this.dispatchSubAgent('reporter', {
      sprint: this.ctx.activeSprint,
      completedTasks: this.ctx.taskQueue.filter(t => t.status === 'complete'),
    })
    this.transition('waiting_community')
  }

  private async phaseWaitingCommunity(): Promise<void> {
    const signals = await this.ctx.pkg.getPendingSignals()
    if (signals.length > 0) {
      await this.dispatchSubAgent('po', { signals })
      this.transition('planning')
    }
  }

  // ------------------------------------
  // Task dispatch
  // ------------------------------------

  private async dispatchTask(task: AgentTask): Promise<void> {
    task.status = 'running'
    task.startedAt = new Date()

    try {
      const agentType: SubAgentType = task.type === 'build' ? 'builder' : task.type as SubAgentType
      task.result = await this.dispatchSubAgent(agentType, task.input)
      task.status = 'complete'
      task.completedAt = new Date()
    } catch (err) {
      task.retries++
      if (task.retries < task.maxRetries) {
        task.status = 'pending'
      } else {
        task.status = 'failed'
        task.errorMessage = err instanceof Error ? err.message : String(err)
        await this.escalate({
          title: `Task failed after ${task.maxRetries} retries`,
          context: `Task ${task.id} (${task.type}) failed: ${task.errorMessage}`,
          options: [
            { label: 'Retry manually', description: 'Reset task and retry', pros: ['Simple'], cons: ['May fail again'] },
            { label: 'Skip', description: 'Mark as skipped and continue', pros: ['Unblocks pipeline'], cons: ['Feature incomplete'] },
          ],
          recommendation: 'Skip and continue if not blocking',
          urgency: 'medium',
          impact_if_timeout: 'Task remains failed, sprint continues without this feature',
          timeout_action: 'proceed',
          timeout_hours: 24,
        })
      }
    }
  }

  private async dispatchSubAgent(
    type: SubAgentType,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const agentContext = await this.ctx.pkg.buildAgentContext(
      `${type} agent for project ${this.ctx.projectId}`,
    )

    const systemPrompt = `You are the ${type} agent for project ${this.ctx.projectId}.
Sprint: ${this.ctx.activeSprint}
Context summary: ${agentContext.context_summary}
Task: ${JSON.stringify(input)}`

    const response = await this.claude.messages.create({
      model: type === 'verifier' ? 'claude-sonnet-4-6' : 'claude-opus-4-7',
      max_tokens: 8096,
      system: systemPrompt,
      messages: [{ role: 'user', content: `Execute your role. Input: ${JSON.stringify(input)}` }],
    })

    return { response: response.content, type, input }
  }

  // ------------------------------------
  // Escalation
  // ------------------------------------

  async escalate(req: EscalationRequest): Promise<string> {
    // POST to KAP API — handled by MCP server in practice
    console.log(`[ESCALATE] ${req.title}`)
    return `escalation-${Date.now()}`
  }

  // ------------------------------------
  // Helpers
  // ------------------------------------

  private async decomposeFeatures(featureIds: string[]): Promise<AgentTask[]> {
    return featureIds.map(id => ({
      id: `task-${id}-${Date.now()}`,
      type: 'build' as const,
      projectId: this.ctx.projectId,
      featureId: id,
      input: { featureId: id },
      status: 'pending' as const,
      retries: 0,
      maxRetries: 3,
      deps: [],
    }))
  }

  private areDepsComplete(task: AgentTask): boolean {
    return task.deps.every(depId => {
      const dep = this.ctx.taskQueue.find(t => t.id === depId)
      return dep?.status === 'complete'
    })
  }

  private transition(phase: OrchestratorPhase): void {
    console.log(`[${this.ctx.projectId}] ${this.ctx.phase} → ${phase}`)
    this.ctx.phase = phase
  }
}

export type { OrchestratorContext, AgentTask, EscalationRequest, ProofBundle }
