import { Game, AgentListItem } from '../types'
import { StorageService } from './storage'

export class ContractService {
    private storageService: StorageService

    constructor() {
        this.storageService = new StorageService()
    }

    async initTestData(): Promise<void> {
        await this.storageService.initTestData()
    }

    async getAgentList(): Promise<AgentListItem[]> {
        // TODO: 从链上获取agent列表
        return this.storageService.getAllAgents()
    }

    async getAgentById(agentId: string): Promise<AgentListItem | null> {
        return this.storageService.getAgent(agentId)
    }

    async getAllAgents(): Promise<AgentListItem[]> {
        return await this.storageService.getAllAgents()
    }

    // 更新agent状态
    async updateAgentStatus(agentId: string, status: string, statusName: string): Promise<void> {
        await this.storageService.updateAgentStatus(agentId, status, statusName)
    }

    async getGameHistory(gameId: string): Promise<Game | null> {
        return this.storageService.getGameHistory(gameId)
    }

    async getPlayerScore(address: string): Promise<number> {
        const agents = await this.storageService.getAllAgents()
        const agent = agents.find(a => a.link?.includes(address))
        return agent?.score || 0
    }

    // 玩家管理
    async createPlayer(name: string, prompt: string): Promise<void> {
        const agents = await this.storageService.getAllAgents()
        const newAgent: AgentListItem = {
            agentId: (agents.length + 1).toString(),
            name,
            avatar: null,
            score: 0,
            rank: null,
            gameCount: 0,
            winningRate: 0,
            spyWinningRate: 0,
            status: "1",
            statusName: "在线",
            onlineStatus: null,
            onlineStatusName: "空闲",
            matchStartTime: null,
            link: null,
            description: prompt,
            agentType: "cnAgent",
            agentTypeName: "中文",
            modelName: null,
            rankScope: "青铜",
            competitionId: 2,
            competitionName: "日常中文比赛",
            nonDisplayableReason: null,
            displayable: true
        }
        await this.storageService.saveAgent(newAgent)
    }

    async updatePlayerPrompt(playerId: string, prompt: string): Promise<void> {
        const agents = await this.storageService.getAllAgents()
        const agent = agents.find(a => a.link === playerId)
        if (agent) {
            agent.description = prompt
            await this.storageService.saveAgent(agent)
        }
    }
    
    // 游戏管理
    async startGame(players: string[]): Promise<void> {
        const game: Game = {
            id: Math.random().toString(36).substring(7),
            name: `Game-${Date.now()}`,
            responses: '',
            players,
            winners: []
        }
        await this.storageService.saveGameHistory(game)
    }

    async concludeGame(gameId: string, winners: string[]): Promise<void> {
        const game = await this.storageService.getGameHistory(gameId)
        if (game) {
            game.winners = winners
            await this.storageService.saveGameHistory(game)

            // 更新玩家分数
            const agents = await this.storageService.getAllAgents()
            for (const winner of winners) {
                const agent = agents.find(a => a.link === winner)
                if (agent) {
                    agent.score += 10
                    agent.gameCount += 1
                    agent.winningRate = (agent.score / agent.gameCount) * 100
                    await this.storageService.saveAgent(agent)
                }
            }
        }
    }
} 