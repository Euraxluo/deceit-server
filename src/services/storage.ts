import { AgentListItem, GameState } from '../types'
import { PrismaService } from './prisma'
import { PrismaClient, Prisma } from '@prisma/client'

/**
 * 存储服务
 * 负责处理所有与数据库相关的操作，包括Agent、游戏、匹配等数据的存取
 */
export class StorageService {
    private prisma: PrismaClient

    constructor() {
        this.prisma = PrismaService.getInstance().getClient()
    }

    // ===================
    // Agent相关操作
    // ===================

    /**
     * 保存或更新Agent信息
     * @param agent Agent信息
     */
    async saveAgent(agent: AgentListItem): Promise<void> {
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
            },
            create: {
                agentId: agent.agentId,
                name: agent.name,
                avatar: agent.avatar || null,
                status: agent.status,
                statusName: agent.statusName,
                matchStartTime: agent.matchStartTime ? new Date(agent.matchStartTime) : null,
                winCount: agent.winCount,
                gameCount: agent.gameCount,
                score: agent.score || 0,
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
        await this.prisma.matchingQueue.create({
            data: {
                agentId,
                score,
                isHuman
            }
        })
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
    async getAllMatchingPlayers(): Promise<{ agentId: string, score: number, isHuman: boolean }[]> {
        const matchingPlayers = await this.prisma.matchingQueue.findMany({
            include: {
                agent: true
            }
        })
        return matchingPlayers.map(mp => ({
            agentId: mp.agentId,
            score: mp.score,
            isHuman: mp.isHuman
        }))
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
            matchStartTime: agent.matchStartTime?.toISOString() || null
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
        const testAgents: AgentListItem[] = [
            {
                agentId: "test_agent_1",
                avatar: "https://img.alicdn.com/imgextra/i1/O1CN01yCnY2D1YS9kn1IyLJ_!!6000000003057-0-tps-300-300.jpg",
                name: "测试Agent1",
                score: 173.2,
                winCount: 90,
                gameCount: 219,
                status: "1",
                statusName: "在线",
                matchStartTime: new Date().toISOString()
            },
            {
                agentId: "test_agent_2",
                avatar: "https://img.alicdn.com/imgextra/i2/O1CN01yCnY2D1YS9kn1IyLJ_!!6000000003057-0-tps-300-300.jpg",
                name: "测试Agent2",
                score: 185.5,
                winCount: 94,
                gameCount: 180,
                status: "1",
                statusName: "在线",
                matchStartTime: new Date().toISOString()
            },
            {
                agentId: "test_agent_3",
                avatar: "https://img.alicdn.com/imgextra/i3/O1CN01yCnY2D1YS9kn1IyLJ_!!6000000003057-0-tps-300-300.jpg",
                name: "测试Agent3",
                score: 195.8,
                winCount: 72,
                gameCount: 150,
                status: "1",
                statusName: "在线",
                matchStartTime: new Date().toISOString()
            },
            {
                agentId: "test_agent_4",
                avatar: "https://img.alicdn.com/imgextra/i4/O1CN01yCnY2D1YS9kn1IyLJ_!!6000000003057-0-tps-300-300.jpg",
                name: "测试Agent4",
                score: 200.0,
                winCount: 50,
                gameCount: 100,
                status: "1",
                statusName: "在线",
                matchStartTime: new Date().toISOString()
            },
            {
                agentId: "test_agent_5",
                avatar: "https://img.alicdn.com/imgextra/i5/O1CN01yCnY2D1YS9kn1IyLJ_!!6000000003057-0-tps-300-300.jpg",
                name: "测试Agent5",
                score: 210.5,
                winCount: 66,
                gameCount: 120,
                status: "1",
                statusName: "在线",
                matchStartTime: new Date().toISOString()
            },
            {
                agentId: "test_agent_6",
                avatar: "https://img.alicdn.com/imgextra/i6/O1CN01yCnY2D1YS9kn1IyLJ_!!6000000003057-0-tps-300-300.jpg",
                name: "测试Agent6",
                score: 220.8,
                winCount: 78,
                gameCount: 130,
                status: "1",
                statusName: "在线",
                matchStartTime: new Date().toISOString()
            }
        ];

        for (const agent of testAgents) {
            await this.saveAgent(agent);
        }
        console.log('[初始化] 测试数据初始化完成');
    }
} 