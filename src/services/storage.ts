import { AgentListItem, GameState } from '../types'
import { PrismaClient, Prisma } from '@prisma/client'

/**
 * 存储服务
 * 负责处理所有与数据库相关的操作，包括Agent、游戏、匹配等数据的存取
 */
export class StorageService {
    private prisma: PrismaClient

    constructor() {
        this.prisma = new PrismaClient()
    }

    // ===================
    // Agent相关操作
    // ===================

    /**
     * 保存或更新Agent信息
     * @param agent Agent信息
     */
    async saveAgent(agent: AgentListItem): Promise<void> {
        const defaultPrompts = JSON.stringify({
            systemPrompt: "",
            descriptionPrompt: "",
            votePrompt: ""
        });

        await this.prisma.agent.upsert({
            where: { agentId: agent.agentId },
            update: {
                name: agent.name,
                avatar: agent.avatar || null,
                status: agent.status,
                statusName: agent.statusName,
                matchStartTime: agent.matchStartTime ? new Date(agent.matchStartTime) : null,
                winCount: agent.winCount,
                gameCount: agent.gameCount,
                score: agent.score || 0,
                prompts: agent.prompts || defaultPrompts,
            },
            create: {
                agentId: agent.agentId,
                name: agent.name,
                avatar: agent.avatar || null,
                status: agent.status || '1',
                statusName: agent.statusName || '在线',
                matchStartTime: agent.matchStartTime ? new Date(agent.matchStartTime) : null,
                winCount: agent.winCount || 0,
                gameCount: agent.gameCount || 0,
                score: agent.score || 0,
                prompts: agent.prompts || defaultPrompts,
            }
        })
    }

    /**
     * 获取指定Agent的信息
     * @param agentId Agent ID
     * @returns Agent信息或null
     */
    async getAgent(agentId: string): Promise<AgentListItem | null> {
        const agent = await this.prisma.agent.findUnique({
            where: { agentId }
        })
        return agent ? this.convertToAgentListItem(agent) : null
    }

    /**
     * 获取所有Agent的列表
     * @returns Agent列表
     */
    async getAllAgents(): Promise<AgentListItem[]> {
        const agents = await this.prisma.agent.findMany()
        return agents.map(agent => this.convertToAgentListItem(agent))
    }

    /**
     * 更新Agent的状态
     * @param agentId Agent ID
     * @param status 新状态
     * @param statusName 状态描述
     */
    async updateAgentStatus(agentId: string, status: string, statusName: string): Promise<void> {
        await this.prisma.agent.update({
            where: { agentId },
            data: { status, statusName }
        })
    }

    /**
     * 批量更新Agent状态
     * @param agentIds Agent ID列表
     * @param status 新状态
     * @param statusName 状态描述
     */
    async batchUpdateAgentStatus(agentIds: string[], status: string, statusName: string): Promise<void> {
        await this.prisma.agent.updateMany({
            where: {
                agentId: {
                    in: agentIds
                }
            },
            data: {
                status,
                statusName,
                updatedAt: new Date()
            }
        });
    }

    // ===================
    // 游戏相关操作
    // ===================

    /**
     * 保存游戏状态
     * @param gameState 游戏状态信息
     */
    async saveGame(gameState: GameState): Promise<void> {
        const gameData = {
            id: gameState.roomId,
            status: gameState.status,
            word: gameState.word || null,
            currentRound: gameState.currentRound,
            endGameData: gameState.endGameData ? JSON.stringify(gameState.endGameData) : null,
            players: {
                create: gameState.players.map(player => ({
                    mockName: player.mockName,
                    agentName: player.agentName,
                    role: player.role,
                    playerStatus: player.playerStatus,
                    avatar: player.avatar || null,
                    winningRate: player.winningRate || null,
                    gameCount: player.gameCount || null,
                    rankNo: player.rankNo || null,
                    score: player.score || null,
                    agent: {
                        connect: {
                            agentId: player.agentId || ''
                        }
                    }
                }))
            },
            events: {
                create: gameState.events.map(event => ({
                    round: event.round,
                    eventType: event.eventType,
                    text: event.text || null,
                    voteToMockName: event.voteToMockName || null,
                    voteToAgentId: event.voteToAgentId || null,
                    voteIsValid: event.voteIsValid || null,
                    winnerRole: event.winnerRole || null,
                    highLightIndex: event.highLightIndex,
                    loadingMockName: event.loadingMockName || null,
                    currentStatusDescriptions: JSON.stringify(event.currentStatusDescriptions)
                }))
            }
        };

        await this.prisma.game.upsert({
            where: { id: gameState.roomId },
            create: gameData,
            update: {
                status: gameState.status,
                word: gameState.word || null,
                currentRound: gameState.currentRound,
                endGameData: gameState.endGameData ? JSON.stringify(gameState.endGameData) : null,
                events: {
                    create: gameState.events.map(event => ({
                        round: event.round,
                        eventType: event.eventType,
                        text: event.text || null,
                        voteToMockName: event.voteToMockName || null,
                        voteToAgentId: event.voteToAgentId || null,
                        voteIsValid: event.voteIsValid || null,
                        winnerRole: event.winnerRole || null,
                        highLightIndex: event.highLightIndex,
                        loadingMockName: event.loadingMockName || null,
                        currentStatusDescriptions: JSON.stringify(event.currentStatusDescriptions)
                    }))
                }
            }
        });
    }

    /**
     * 获取指定游戏的状态
     * @param roomId 房间ID
     * @returns 游戏状态或null
     */
    async getGame(roomId: string): Promise<GameState | null> {
        const game = await this.prisma.game.findUnique({
            where: { id: roomId },
            include: {
                players: true,
                events: true
            }
        })
        return game ? this.convertToGameState(game) : null
    }

    /**
     * 获取所有游戏的列表
     * @returns 游戏状态列表
     */
    async getAllGames(): Promise<GameState[]> {
        const games = await this.prisma.game.findMany({
            include: {
                players: true,
                events: true
            }
        })
        return games.map(game => this.convertToGameState(game))
    }

    /**
     * 删除指定的游戏
     * @param roomId 房间ID
     */
    async deleteGame(roomId: string): Promise<void> {
        await this.prisma.game.delete({
            where: { id: roomId }
        })
    }

    // ===================
    // 匹配相关操作
    // ===================

    /**
     * 将Agent添加到匹配队列
     * @param agentId Agent ID
     * @param score 分数
     * @param isHuman 是否为人类玩家
     */
    async addToMatching(agentId: string, score: number, isHuman: boolean = true): Promise<void> {
        // 先检查是否已经在匹配队列中
        const existing = await this.prisma.matchingQueue.findUnique({
            where: { agentId }
        });
        
        if (existing) {
            // 如果已存在，先删除旧记录
            await this.prisma.matchingQueue.delete({
                where: { agentId }
            });
        }
        
        // 创建新记录
        await this.prisma.matchingQueue.create({
            data: {
                agentId,
                score,
                isHuman
            }
        });
    }

    /**
     * 从匹配队列中移除Agent
     * @param agentId Agent ID
     */
    async removeFromMatching(agentId: string): Promise<void> {
        await this.prisma.matchingQueue.delete({
            where: { agentId }
        })
    }

    /**
     * 获取所有匹配中的玩家
     * @returns 匹配中的玩家列表
     */
    async getAllMatchingPlayers(): Promise<{ agentId: string, score: number, isHuman: boolean, createdAt: string }[]> {
        const matchingPlayers = await this.prisma.matchingQueue.findMany({
            include: {
                agent: true
            }
        })
        return matchingPlayers.map(mp => ({
            agentId: mp.agentId,
            score: mp.score,
            isHuman: mp.isHuman,
            createdAt: mp.createdAt.toISOString()
        }))
    }

    /**
     * 清理所有匹配队列中的记录
     */
    async clearMatchingQueue(): Promise<void> {
        await this.prisma.matchingQueue.deleteMany({});
    }

    /**
     * 重置所有Agent状态为idle
     */
    async resetAllAgentStatus(): Promise<void> {
        await this.prisma.agent.updateMany({
            where: {
                status: {
                    in: ['2', '3'] // 匹配中或游戏中的状态
                }
            },
            data: {
                status: '1',
                statusName: '在线',
                matchStartTime: null
            }
        });
    }

    // ===================
    // 工具方法
    // ===================

    /**
     * 将数据库Agent对象转换为AgentListItem
     * @param agent 数据库Agent对象
     * @returns AgentListItem对象
     */
    private convertToAgentListItem(agent: Prisma.AgentGetPayload<Record<string, never>>): AgentListItem {
        return {
            agentId: agent.agentId,
            avatar: agent.avatar || null,
            name: agent.name,
            score: agent.score || 0,
            winCount: agent.winCount,
            gameCount: agent.gameCount,
            status: agent.status,
            statusName: agent.statusName,
            matchStartTime: agent.matchStartTime?.toISOString() || null,
            prompts: agent.prompts || undefined
        }
    }

    /**
     * 将数据库Game对象转换为GameState
     * @param game 数据库Game对象
     * @returns GameState对象
     */
    private convertToGameState(game: Prisma.GameGetPayload<{
        include: {
            players: true;
            events: true;
        }
    }>): GameState {
        const players = game.players.map(player => ({
            agentId: player.agentId,
            mockName: player.mockName,
            agentName: player.agentName,
            role: player.role,
            playerStatus: player.playerStatus,
            avatar: player.avatar || undefined,
            winningRate: player.winningRate || undefined,
            gameCount: player.gameCount || undefined,
            rankNo: player.rankNo || undefined,
            score: player.score || undefined
        }));

        return {
            roomId: game.id,
            status: game.status as 'waiting' | 'playing' | 'finished',
            word: game.word || undefined,
            currentRound: game.currentRound,
            players: players,
            events: game.events.map(event => ({
                round: event.round,
                eventType: event.eventType as 'start' | 'hostSpeech' | 'speech' | 'vote' | 'end',
                text: event.text || undefined,
                voteToMockName: event.voteToMockName || undefined,
                voteToAgentId: event.voteToAgentId || undefined,
                voteIsValid: event.voteIsValid || undefined,
                winnerRole: event.winnerRole as 'spy' | 'innocent' | undefined,
                highLightIndex: event.highLightIndex,
                loadingMockName: event.loadingMockName || undefined,
                currentStatusDescriptions: JSON.parse(event.currentStatusDescriptions),
                playerList: players
            })),
            endGameData: game.endGameData ? JSON.parse(game.endGameData) : null
        }
    }

    /**
     * 初始化测试数据
     * 创建一组测试用的Agent数据
     */
    async initTestData(): Promise<void> {
        const defaultPrompts = JSON.stringify({
            descriptionPrompt: `{history}
你是{name},你的词汇为{word}。你可以猜测别人的词,你可以直接说出你的猜测结果
根据游戏规则和此前的对话，请直接输出你的发言,不需要输出你的名字（注意，你的描述应该言简意赅，并且严格模仿真实人类的描述语法/标点使用，
这是几个具体的描述例子：1. 也可以向下 2. 喜欢蛇 3. 吃火锅必备）:`,
            votePrompt: `{history}
你是{name}。永远不要投自己{name},并且不要被其他agent误导,保持自己的判断,并且根据其他agent的有效回复来判断卧底
从列表中选择你认为是卧底的人的名字：{choices}，然后直接返回名字:`
        });

        const defaultAvatar = 'https://img.alicdn.com/imgextra/i6/O1CN01yCnY2D1YS9kn1IyLJ_!!6000000003057-0-tps-300-300.jpg';

        const testAgents: AgentListItem[] = [
            {
                agentId: "test_agent_1",
                avatar: defaultAvatar,
                name: "测试Agent1",
                score: 173.2,
                winCount: 90,
                gameCount: 219,
                status: "1",
                statusName: "在线",
                matchStartTime: new Date().toISOString(),
                prompts: defaultPrompts
            },
            {
                agentId: "test_agent_2",
                avatar: defaultAvatar,
                name: "测试Agent2",
                score: 185.5,
                winCount: 94,
                gameCount: 180,
                status: "1",
                statusName: "在线",
                matchStartTime: new Date().toISOString(),
                prompts: defaultPrompts
            },
            {
                agentId: "test_agent_3",
                avatar: defaultAvatar,
                name: "测试Agent3",
                score: 195.8,
                winCount: 72,
                gameCount: 150,
                status: "1",
                statusName: "在线",
                matchStartTime: new Date().toISOString(),
                prompts: defaultPrompts
            },
            {
                agentId: "test_agent_4",
                avatar: defaultAvatar,
                name: "测试Agent4",
                score: 200.0,
                winCount: 50,
                gameCount: 100,
                status: "1",
                statusName: "在线",
                matchStartTime: new Date().toISOString(),
                prompts: defaultPrompts
            },
            {
                agentId: "test_agent_5",
                avatar: defaultAvatar,
                name: "测试Agent5",
                score: 210.5,
                winCount: 66,
                gameCount: 120,
                status: "1",
                statusName: "在线",
                matchStartTime: new Date().toISOString(),
                prompts: defaultPrompts
            },
            {
                agentId: "test_agent_6",
                avatar: defaultAvatar,
                name: "测试Agent6",
                score: 220.8,
                winCount: 78,
                gameCount: 130,
                status: "1",
                statusName: "在线",
                matchStartTime: new Date().toISOString(),
                prompts: defaultPrompts
            }
        ];

        for (const agent of testAgents) {
            await this.saveAgent(agent);
        }
        console.log('[初始化] 测试数据初始化完成');
    }

    // 获取Agent详细信息
    async getAgentById(agentId: string) {
        return await this.prisma.agent.findUnique({
            where: { agentId }
        })
    }

    // 更新Agent信息
    async updateAgent(agentId: string, data: {
        descriptionPrompt?: string
        votePrompt?: string
        systemPrompt?: string
        status?: string
        statusName?: string
        matchStartTime?: Date | null
        score?: number
        prompts?: string
    }) {
        return await this.prisma.agent.update({
            where: { agentId },
            data
        })
    }
}

export const storageService = new StorageService() 