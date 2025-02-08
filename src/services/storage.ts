import { AgentListItem, GameState, Game } from '../types'
import { PrismaService } from './prisma'
import { PrismaClient, Prisma } from '@prisma/client'

export class StorageService {
    private prisma: PrismaClient

    constructor() {
        this.prisma = PrismaService.getInstance().getClient()
    }

    // Agent相关操作
    async saveAgent(agent: AgentListItem): Promise<void> {
        await this.prisma.agent.upsert({
            where: { agentId: agent.agentId },
            update: {
                name: agent.name,
                avatar: agent.avatar || null,
                token: agent.token || null,
                score: agent.score,
                rank: agent.rank || null,
                gameCount: agent.gameCount,
                winningRate: agent.winningRate,
                spyWinningRate: agent.spyWinningRate,
                status: agent.status,
                statusName: agent.statusName,
                onlineStatus: agent.onlineStatus || null,
                onlineStatusName: agent.onlineStatusName,
                matchStartTime: null, // 需要转换时间格式
                link: agent.link || null,
                description: agent.description || null,
                agentType: agent.agentType,
                agentTypeName: agent.agentTypeName,
                modelName: agent.modelName || null,
                rankScope: agent.rankScope,
                competitionId: agent.competitionId,
                competitionName: agent.competitionName,
                displayable: agent.displayable,
                organization: agent.organization || null,
                nonDisplayableReason: null
            },
            create: {
                agentId: agent.agentId,
                name: agent.name,
                avatar: agent.avatar || null,
                token: agent.token || null,
                score: agent.score,
                rank: agent.rank || null,
                gameCount: agent.gameCount,
                winningRate: agent.winningRate,
                spyWinningRate: agent.spyWinningRate,
                status: agent.status,
                statusName: agent.statusName,
                onlineStatus: agent.onlineStatus || null,
                onlineStatusName: agent.onlineStatusName,
                matchStartTime: null,
                link: agent.link || null,
                description: agent.description || null,
                agentType: agent.agentType,
                agentTypeName: agent.agentTypeName,
                modelName: agent.modelName || null,
                rankScope: agent.rankScope,
                competitionId: agent.competitionId,
                competitionName: agent.competitionName,
                displayable: agent.displayable,
                organization: agent.organization || null
            }
        })
    }

    async getAgent(agentId: string): Promise<AgentListItem | null> {
        const agent = await this.prisma.agent.findUnique({
            where: { agentId }
        })
        return agent ? this.convertToAgentListItem(agent) : null
    }

    async getAllAgents(): Promise<AgentListItem[]> {
        const agents = await this.prisma.agent.findMany()
        return agents.map(agent => this.convertToAgentListItem(agent))
    }

    async updateAgentStatus(agentId: string, status: string, statusName: string): Promise<void> {
        await this.prisma.agent.update({
            where: { agentId },
            data: { status, statusName }
        })
    }

    // 游戏相关操作
    async saveGame(gameState: GameState): Promise<void> {
        await this.prisma.game.upsert({
            where: { id: gameState.roomId },
            update: {
                name: `Game-${gameState.roomId}`,
                status: gameState.status,
                word: gameState.word || null,
                currentRound: gameState.currentRound,
                endGameData: gameState.endGameData ? JSON.stringify(gameState.endGameData) : null,
                players: {
                    deleteMany: {},
                    create: gameState.players.map(player => ({
                        mockName: player.mockName,
                        agentName: player.agentName,
                        role: player.role || null,
                        playerStatus: player.playerStatus,
                        avatar: player.avatar || null,
                        winningRate: player.winningRate || 0,
                        spyWinningRate: player.spyWinningRate || 0,
                        modelName: player.modelName || null,
                        organization: player.organization || null,
                        score: player.score || 0,
                        gameCount: player.gameCount || 0,
                        rankNo: player.rankNo || 0,
                        overallRating: player.overallRating || 0,
                        agentId: player.agentId || '',
                        agent: {
                            connect: {
                                agentId: player.agentId || ''
                            }
                        }
                    }))
                },
                events: {
                    deleteMany: {},
                    create: gameState.events.map(event => ({
                        round: event.round,
                        eventType: event.eventType,
                        text: event.text || null,
                        voteToMockName: event.voteToMockName || null,
                        voteToAgentId: event.voteToAgentId?.toString() || null,
                        voteIsValid: event.voteIsValid || null,
                        winnerRole: event.winnerRole || null,
                        highLightIndex: event.highLightIndex,
                        loadingMockName: event.loadingMockName || null,
                        currentStatusDescriptions: JSON.stringify(event.currentStatusDescriptions)
                    }))
                }
            },
            create: {
                id: gameState.roomId,
                name: `Game-${gameState.roomId}`,
                status: gameState.status,
                word: gameState.word || null,
                currentRound: gameState.currentRound,
                endGameData: gameState.endGameData ? JSON.stringify(gameState.endGameData) : null,
                players: {
                    create: gameState.players.map(player => ({
                        mockName: player.mockName,
                        agentName: player.agentName,
                        role: player.role || null,
                        playerStatus: player.playerStatus,
                        avatar: player.avatar || null,
                        winningRate: player.winningRate || 0,
                        spyWinningRate: player.spyWinningRate || 0,
                        modelName: player.modelName || null,
                        organization: player.organization || null,
                        score: player.score || 0,
                        gameCount: player.gameCount || 0,
                        rankNo: player.rankNo || 0,
                        overallRating: player.overallRating || 0,
                        agentId: player.agentId || '',
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
                        voteToAgentId: event.voteToAgentId?.toString() || null,
                        voteIsValid: event.voteIsValid || null,
                        winnerRole: event.winnerRole || null,
                        highLightIndex: event.highLightIndex,
                        loadingMockName: event.loadingMockName || null,
                        currentStatusDescriptions: JSON.stringify(event.currentStatusDescriptions)
                    }))
                }
            }
        })
    }

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

    async getAllGames(): Promise<GameState[]> {
        const games = await this.prisma.game.findMany({
            include: {
                players: true,
                events: true
            }
        })
        return games.map(this.convertToGameState)
    }

    async deleteGame(roomId: string): Promise<void> {
        await this.prisma.game.delete({
            where: { id: roomId }
        })
    }

    // 匹配相关操作
    async addToMatching(agentId: string, score: number): Promise<void> {
        await this.prisma.matchingQueue.create({
            data: {
                agentId,
                score
            }
        })
    }

    async removeFromMatching(agentId: string): Promise<void> {
        await this.prisma.matchingQueue.delete({
            where: { agentId }
        })
    }

    async getAllMatchingPlayers(): Promise<{ agentId: string, score: number }[]> {
        const matchingPlayers = await this.prisma.matchingQueue.findMany({
            include: {
                agent: true
            }
        })
        return matchingPlayers.map(mp => ({
            agentId: mp.agentId,
            score: mp.score
        }))
    }

    // 游戏历史相关操作
    async saveGameHistory(game: Game): Promise<void> {
        await this.prisma.game.update({
            where: { id: game.id },
            data: {
                responses: game.responses,
                winners: {
                    create: game.winners.map((winnerId: string) => ({
                        score: 10, // 默认分数
                        player: {
                            connect: {
                                id: parseInt(winnerId)
                            }
                        }
                    }))
                }
            }
        })
    }

    async getGameHistory(gameId: string): Promise<Game | null> {
        const game = await this.prisma.game.findUnique({
            where: { id: gameId },
            include: {
                players: true,
                winners: {
                    include: {
                        player: true
                    }
                }
            }
        })
        
        if (!game) return null

        return {
            id: game.id,
            name: game.name,
            responses: game.responses,
            players: game.players.map(p => p.agentId),
            winners: game.winners.map(w => w.player.agentId)
        }
    }

    // 工具方法
    private convertToAgentListItem(agent: Prisma.AgentGetPayload<Record<string, never>>): AgentListItem {
        return {
            agentId: agent.agentId,
            name: agent.name,
            avatar: agent.avatar,
            token: agent.token || undefined,
            score: agent.score,
            rank: agent.rank,
            gameCount: agent.gameCount,
            winningRate: agent.winningRate,
            spyWinningRate: agent.spyWinningRate,
            status: agent.status,
            statusName: agent.statusName,
            onlineStatus: (agent.onlineStatus as 'online' | 'offline' | 'playing' | null),
            onlineStatusName: agent.onlineStatusName,
            matchStartTime: agent.matchStartTime?.toISOString() || null,
            link: agent.link,
            description: agent.description,
            agentType: (agent.agentType as 'cnAgent' | 'enAgent'),
            agentTypeName: agent.agentTypeName,
            modelName: agent.modelName,
            rankScope: agent.rankScope,
            competitionId: agent.competitionId,
            competitionName: agent.competitionName,
            nonDisplayableReason: agent.nonDisplayableReason,
            displayable: agent.displayable,
            organization: agent.organization || undefined
        }
    }

    private convertToGameState(game: Prisma.GameGetPayload<{
        include: {
            players: true;
            events: true;
        }
    }>): GameState {
        return {
            roomId: game.id,
            status: game.status as 'waiting' | 'playing' | 'finished',
            word: game.word || undefined,
            players: game.players.map((p) => ({
                agentId: p.agentId,
                mockName: p.mockName,
                agentName: p.agentName,
                role: (p.role as 'spy' | 'innocent' | undefined),
                playerStatus: p.playerStatus as 'alive' | 'dead',
                avatar: p.avatar || undefined,
                winningRate: Number(p.winningRate || 0),
                spyWinningRate: Number(p.spyWinningRate || 0),
                modelName: p.modelName || undefined,
                organization: p.organization || undefined,
                score: Number(p.score || 0),
                gameCount: Number(p.gameCount || 0),
                rankNo: Number(p.rankNo || 0),
                overallRating: Number(p.overallRating || 0)
            })),
            events: game.events.map((e) => ({
                round: e.round,
                eventType: e.eventType as 'start' | 'hostSpeech' | 'speech' | 'vote' | 'end',
                text: e.text || undefined,
                voteToMockName: e.voteToMockName || undefined,
                voteToAgentId: e.voteToAgentId?.toString() || undefined,
                voteIsValid: e.voteIsValid || undefined,
                winnerRole: (e.winnerRole as 'spy' | 'innocent' | undefined),
                playerList: game.players.map((p) => ({
                    agentId: p.agentId,
                    mockName: p.mockName,
                    agentName: p.agentName,
                    role: (p.role as 'spy' | 'innocent' | undefined),
                    playerStatus: p.playerStatus as 'alive' | 'dead',
                    avatar: p.avatar || undefined,
                    winningRate: Number(p.winningRate || 0),
                    spyWinningRate: Number(p.spyWinningRate || 0),
                    modelName: p.modelName || undefined,
                    organization: p.organization || undefined,
                    score: Number(p.score || 0),
                    gameCount: Number(p.gameCount || 0),
                    rankNo: Number(p.rankNo || 0),
                    overallRating: Number(p.overallRating || 0)
                })),
                currentStatusDescriptions: JSON.parse(e.currentStatusDescriptions),
                highLightIndex: e.highLightIndex,
                loadingMockName: e.loadingMockName || undefined
            })),
            currentRound: game.currentRound,
            endGameData: game.endGameData ? JSON.parse(game.endGameData) : null
        }
    }

    // 初始化测试数据
    async initTestData(): Promise<void> {
        const testAgents: AgentListItem[] = [
            {
                agentId: "test_agent_1",
                avatar: "https://img.alicdn.com/imgextra/i1/O1CN01yCnY2D1YS9kn1IyLJ_!!6000000003057-0-tps-300-300.jpg",
                name: "测试Agent1",
                token: "hf_test_token_1",
                score: 173.2,
                rank: null,
                gameCount: 219,
                winningRate: 0.4109589,
                spyWinningRate: 0.10810811,
                status: "1",
                statusName: "在线",
                onlineStatus: null,
                onlineStatusName: "空闲",
                matchStartTime: new Date().toISOString(),
                link: "test/agent1",
                description: "测试agent1",
                agentType: "cnAgent" as const,
                agentTypeName: "中文",
                modelName: "deepseek-chat",
                rankScope: "青铜",
                competitionId: 2,
                competitionName: "日常中文比赛",
                nonDisplayableReason: null,
                displayable: true,
            },
            {
                agentId: "test_agent_2",
                avatar: "https://img.alicdn.com/imgextra/i2/O1CN01yCnY2D1YS9kn1IyLJ_!!6000000003057-0-tps-300-300.jpg",
                name: "测试Agent2",
                token: "hf_test_token_2",
                score: 185.5,
                rank: null,
                gameCount: 180,
                winningRate: 0.52,
                spyWinningRate: 0.15,
                status: "1",
                statusName: "在线",
                onlineStatus: null,
                onlineStatusName: "空闲",
                matchStartTime: new Date().toISOString(),
                link: "test/agent2",
                description: "测试agent2",
                agentType: "cnAgent" as const,
                agentTypeName: "中文",
                modelName: "deepseek-chat",
                rankScope: "白银",
                competitionId: 2,
                competitionName: "日常中文比赛",
                nonDisplayableReason: null,
                displayable: true,
            },
            {
                agentId: "test_agent_3",
                avatar: "https://img.alicdn.com/imgextra/i3/O1CN01yCnY2D1YS9kn1IyLJ_!!6000000003057-0-tps-300-300.jpg",
                name: "测试Agent3",
                token: "hf_test_token_3",
                score: 195.8,
                rank: null,
                gameCount: 150,
                winningRate: 0.48,
                spyWinningRate: 0.12,
                status: "1",
                statusName: "在线",
                onlineStatus: null,
                onlineStatusName: "空闲",
                matchStartTime: new Date().toISOString(),
                link: "test/agent3",
                description: "测试agent3",
                agentType: "cnAgent" as const,
                agentTypeName: "中文",
                modelName: "deepseek-chat",
                rankScope: "黄金",
                competitionId: 2,
                competitionName: "日常中文比赛",
                nonDisplayableReason: null,
                displayable: true,
            }
        ];

        for (const agent of testAgents) {
            await this.saveAgent(agent);
        }
        console.log('[初始化] 测试数据初始化完成');
    }
} 