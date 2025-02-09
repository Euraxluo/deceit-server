import { StorageService } from './storage'
import { Agent } from '@prisma/client'
import { AtomaSDK } from 'atoma-sdk'

// Agent请求类型
interface AgentRequest {
    status: 'start' | 'distribution' | 'round' | 'vote' | 'vote_result' | 'result'
    round?: number
    word?: string
    name?: string
    message?: string
    choices?: string[]
}

// Agent响应类型
interface AgentResponse {
    success: boolean
    result?: string
    errMsg?: string
}

// Agent记忆类型
interface AgentMemory {
    name: string
    word: string
    history: string[]
    variables: Map<string, unknown>
}

// 提示词配置类型
interface GamePrompts {
    [key: string]: string
}

interface PromptsConfig {
    [gameType: string]: GamePrompts
}

export class AgentService {
    private static instance: AgentService | null = null
    private storageService: StorageService
    private atomaSDK: AtomaSDK
    private model: string
    private memories: Map<string, AgentMemory>

    private constructor() {
        this.storageService = new StorageService()
        this.atomaSDK = new AtomaSDK({
            bearerAuth: process.env.ATOMA_API_KEY || ''
        })
        this.model = process.env.ATOMA_MODEL || 'meta-llama/Llama-3.3-70B-Instruct'
        this.memories = new Map()
    }

    public static getInstance(): AgentService {
        if (!AgentService.instance) {
            AgentService.instance = new AgentService()
        }
        return AgentService.instance
    }

    // 初始化Agent的记忆
    private initMemory(agentId: string, name: string): void {
        this.memories.set(agentId, {
            name,
            word: '',
            history: [],
            variables: new Map()
        })
    }

    // 清理Agent的记忆
    private clearMemory(agentId: string): void {
        this.memories.delete(agentId)
    }

    // 获取Agent的记忆
    private getMemory(agentId: string): AgentMemory | undefined {
        return this.memories.get(agentId)
    }

    // 更新Agent的记忆
    private updateMemory(agentId: string, update: Partial<AgentMemory>): void {
        const memory = this.getMemory(agentId)
        if (memory) {
            Object.assign(memory, update)
            this.memories.set(agentId, memory)
        }
    }

    // 添加历史记录
    private appendHistory(agentId: string, message: string): void {
        const memory = this.getMemory(agentId)
        if (memory) {
            memory.history.push(message)
        }
    }

    // 获取Agent的提示词配置
    private getPrompts(agent: Agent): PromptsConfig {
        try {
            return JSON.parse(agent.prompts)
        } catch (err) {
            console.error('解析提示词配置失败:', err)
            return {}
        }
    }

    // 调用LLM生成内容
    private async llmCall(prompt: string): Promise<string> {
        try {
            const completion = await this.atomaSDK.chat.create({
                messages: [
                    { role: 'user', content: prompt }
                ],
                model: this.model
            })

            return completion.choices[0]?.message?.content || ''
        } catch (err) {
            console.error('LLM调用失败:', err)
            throw err
        }
    }

    // 处理Agent的感知
    public async perceive(agentId: string, req: AgentRequest): Promise<void> {
        const agent = await this.storageService.getAgentById(agentId)
        if (!agent) {
            throw new Error('Agent not found')
        }

        let memory = this.getMemory(agentId)
        if (!memory) {
            this.initMemory(agentId, agent.name)
            memory = this.getMemory(agentId)
        }

        switch (req.status) {
            case 'start':
                this.clearMemory(agentId)
                this.initMemory(agentId, agent.name)
                this.appendHistory(agentId, 'Host: Game started, welcome to "Who is the Spy"!')
                break
            case 'distribution':
                if (req.word) {
                    this.updateMemory(agentId, { word: req.word })
                    this.appendHistory(agentId, `Host: ${agent.name}, your word is: ${req.word}`)
                }
                break
            case 'round':
                if (req.name && req.message) {
                    this.appendHistory(agentId, `${req.name}: ${req.message}`)
                } else if (req.round) {
                    this.appendHistory(agentId, `Host: Round ${req.round} begins`)
                }
                break
            case 'vote':
                if (req.name && req.message) {
                    this.appendHistory(agentId, `${req.name}: Votes for ${req.message}`)
                }
                break
            case 'vote_result':
                if (req.message) {
                    this.appendHistory(agentId, `Host: ${req.message}`)
                }
                break
            case 'result':
                if (req.message) {
                    this.appendHistory(agentId, req.message)
                }
                break
        }
    }

    // 生成Agent的行为
    public async interact(agentId: string, req: AgentRequest): Promise<AgentResponse> {
        const agent = await this.storageService.getAgentById(agentId)
        if (!agent) {
            return { success: false, errMsg: 'Agent not found' }
        }

        const memory = this.getMemory(agentId)
        if (!memory) {
            return { success: false, errMsg: 'Memory not initialized' }
        }

        try {
            switch (req.status) {
                case 'round':
                    return await this.generateDescription(agent, memory)
                case 'vote':
                    return await this.generateVote(agent, memory, req.choices || [])
                default:
                    return { success: false, errMsg: 'Unsupported status' }
            }
        } catch (err) {
            console.error('Failed to generate agent behavior:', err)
            return { success: false, errMsg: 'Failed to generate behavior' }
        }
    }

    // 生成描述
    private async generateDescription(agent: Agent, memory: AgentMemory): Promise<AgentResponse> {
        const prompts = this.getPrompts(agent)
        const descPrompt = prompts.spy?.description
        if (!descPrompt) {
            return { success: false, errMsg: 'Description template not set' }
        }

        const prompt = descPrompt
            .replace('{name}', memory.name)
            .replace('{word}', memory.word)
            .replace('{history}', memory.history.join('\n'))

        try {
            const result = await this.llmCall(prompt)
            return { success: true, result }
        } catch (err) {
            console.error('Failed to generate description:', err)
            return { success: false, errMsg: 'Failed to generate description' }
        }
    }

    // 生成投票
    private async generateVote(agent: Agent, memory: AgentMemory, choices: string[]): Promise<AgentResponse> {
        const prompts = this.getPrompts(agent)
        const votePrompt = prompts.spy?.vote
        if (!votePrompt) {
            return { success: false, errMsg: 'Vote strategy template not set' }
        }

        const prompt = votePrompt
            .replace('{name}', memory.name)
            .replace('{choices}', choices.join(', '))
            .replace('{history}', memory.history.join('\n'))

        try {
            const result = await this.llmCall(prompt)
            return { success: true, result }
        } catch (err) {
            console.error('Failed to generate vote:', err)
            return { success: false, errMsg: 'Failed to generate vote' }
        }
    }

    // 更新Agent的提示词配置
    public async updatePrompts(agentId: string, config: PromptsConfig): Promise<void> {
        await this.storageService.updateAgent(agentId, {
            prompts: JSON.stringify(config)
        })
    }
}

// 导出单例实例
export const agentService = AgentService.getInstance()