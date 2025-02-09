import { GameState, RoomView, GameEvent, AgentGameStatus, AgentGameStateStore, AgentListItem, MatchingQueueInfo } from '../types'
import { ContractService } from './contract'
import { StorageService } from './storage'
import { v4 as uuidv4 } from 'uuid'

export class GameService {
    private static instance: GameService | null = null;
    private contractService: ContractService
    private storageService: StorageService
    
    // 所有全局状态改为static
    private static gameStates: AgentGameStateStore = {}
    private static isProcessingMatch = false
    private static processingMatchStartTime: number | null = null
    
    // 常量配置
    private static readonly TIMEOUTS = {
        LOCK: 30000,      // 锁超时时间
        MATCH: 30000,     // 匹配超时时间
        MAX_WAIT: 10000   // 最大等待时间
    } as const

    private static readonly GAME_CONFIG = {
        PLAYERS_PER_ROOM: 6,      // 每个房间的玩家数
        MIN_PLAYERS_TO_START: 3,  // 开始游戏的最小玩家数
        SCORE_RANGE: 50,          // 匹配分数范围
        SPY_RATIO: 1/3            // 卧底比例
    } as const

    private static readonly MOCK_NAMES = [
        '张三', '李四', '王五', '赵六', '钱七', '孙八', 
        '周九', '吴十', '郑一', '王二', '刘一', '陈二', 
        '杨三', '黄四', '周五', '吴六'
    ] as const

    private static readonly STATE_TRANSITIONS: Record<AgentGameStatus, AgentGameStatus[]> = {
        'idle': ['in_matching_queue'],
        'in_matching_queue': ['idle', 'inGame'],
        'inGame': ['idle']
    } as const

    private static checkInterval: NodeJS.Timeout | null = null;

    private constructor() {
        this.contractService = new ContractService()
        this.storageService = new StorageService()
        this.startMatchingService()
    }

    public static getInstance(): GameService {
        if (!GameService.instance) {
            GameService.instance = new GameService()
        }
        return GameService.instance
    }

    // 启动匹配服务
    private startMatchingService(): void {
        if (!GameService.checkInterval) {
            GameService.checkInterval = setInterval(() => this.checkAndMatchPlayers(), 5000)
            console.log('[服务] 匹配服务已启动')
        }
    }

    // 停止匹配服务
    public stopMatchingService(): void {
        if (GameService.checkInterval) {
            clearInterval(GameService.checkInterval)
            GameService.checkInterval = null
            console.log('[服务] 匹配服务已停止')
        }
    }

    // 为房间生成随机名字列表
    private static getRandomMockNames(count: number): string[] {
        const array = new Uint32Array(count)
        crypto.getRandomValues(array)
        return Array.from(array).map(n => GameService.MOCK_NAMES[n % GameService.MOCK_NAMES.length])
    }

    // 获取Agent状态
    private static async getAgentState(agentId: string) {
        if (!GameService.gameStates[agentId]) {
            GameService.gameStates[agentId] = {
                status: 'idle',
                roomId: null,
                lastUpdateTime: Date.now()
            };
        }
        return { ...GameService.gameStates[agentId] }; // 返回副本
    }

    // 更新Agent状态
    private static async updateAgentState(agentId: string, state: Partial<{ status: AgentGameStatus; roomId: string | null }>) {
        const currentState = await GameService.getAgentState(agentId);
        
        // 状态转换验证
        if (state.status && !GameService.STATE_TRANSITIONS[currentState.status].includes(state.status)) {
            throw new Error(`非法的状态转换: ${currentState.status} -> ${state.status}`);
        }
        
        const newState = {
            ...currentState,
            ...state,
            lastUpdateTime: Date.now()
        };
        
        GameService.gameStates[agentId] = newState;
    }

    // 统一错误处理
    private static async handleServiceError(operation: string, error: unknown): Promise<void> {
        const errorMessage = error instanceof Error ? error.message : '未知错误'
        const errorStack = error instanceof Error ? error.stack : ''
        const errorTime = new Date().toISOString()
        
        // 构建结构化的错误日志
        const errorLog = {
            operation,
            error: {
                message: errorMessage,
                stack: errorStack,
                time: errorTime
            },
            context: {
                isProcessingMatch: GameService.isProcessingMatch,
                processingMatchStartTime: GameService.processingMatchStartTime
            }
        }
        
        console.error('[错误]', JSON.stringify(errorLog, null, 2))
        throw error
    }

    // 开始匹配
    async startMatching(agentId: string): Promise<void> {
        try {
            // 1. 先检查 agent 是否存在
            const agent = await this.contractService.getAgentById(agentId)
            if (!agent) {
                throw new Error('Agent不存在')
            }

            // 2. 再检查状态
            const currentState = await GameService.getAgentState(agentId)
            if (currentState.status !== 'idle') {
                throw new Error(`Agent当前状态(${currentState.status})不允许开始匹配`)
            }

            // 3. 更新状态并加入匹配队列
            await this.startMatchingTransaction(agent)
        } catch (error) {
            await GameService.handleServiceError('开始匹配', error)
        }
    }

    // 开始匹配事务
    private async startMatchingTransaction(agent: AgentListItem): Promise<void> {
        try {
            // 1. 更新内存状态为匹配队列中
            await GameService.updateAgentState(agent.agentId, { status: 'in_matching_queue' })
            
            // 2. 加入匹配队列
            await this.storageService.addToMatching(agent.agentId, agent.score || 0)
        } catch (error) {
            // 如果任何步骤失败,回滚所有更改
            await GameService.updateAgentState(agent.agentId, { status: 'idle' })
            await this.storageService.removeFromMatching(agent.agentId).catch(e => {
                console.error('回滚移除匹配队列失败:', e)
            })
            throw error
        }
    }

    // 取消匹配
    async cancelMatching(agentId: string): Promise<void> {
        const currentState = await GameService.getAgentState(agentId)
        if (currentState.status !== 'in_matching_queue') {
            throw new Error(`Agent当前状态(${currentState.status})不允许取消匹配`)
        }

        try {
            // 从匹配队列中移除
            await this.storageService.removeFromMatching(agentId)
            
            // 更新内存状态为空闲
            await GameService.updateAgentState(agentId, { status: 'idle', roomId: null })
        } catch (error) {
            console.error(`[匹配] 取消Agent ${agentId} 匹配失败:`, error)
            throw error
        }
    }

    // 检查匹配状态
    async checkMatchStatus(agentId: string): Promise<{ gameStatus: AgentGameStatus, roomId: string | null }> {
        const state = await GameService.getAgentState(agentId)
        return {
            gameStatus: state.status,
            roomId: state.roomId
        }
    }

    // 获取当前匹配队列信息
    public async getMatchingQueueInfo(): Promise<MatchingQueueInfo> {
        const matchingPlayers = await this.storageService.getAllMatchingPlayers()
        return {
            count: matchingPlayers.length,
            items: matchingPlayers.map(p => ({
                agentId: p.agentId,
                isHuman: p.isHuman
            }))
        }
    }

    // 获取房间视图
    async getRoomView(roomId: string): Promise<RoomView> {
        const gameState = await this.storageService.getGame(roomId)
        if (!gameState) {
            throw new Error('游戏房间不存在')
        }

        return {
            word: gameState.word || '',
            eventList: gameState.events,
            initialPlayerList: gameState.players,
            currentStatusDescriptions: gameState.events.length > 0 
                ? gameState.events[gameState.events.length - 1].currentStatusDescriptions
                : [],
            roomId: gameState.roomId,
            highLightIndex: gameState.events.length > 0 
                ? gameState.events[gameState.events.length - 1].highLightIndex
                : 0,
            endGameData: gameState.endGameData
        }
    }

    // 处理游戏动作
    async processGameAction(roomId: string, action: { agentId: string, action: string, content: string, voteToMockName?: string }): Promise<void> {
        const gameState = await this.storageService.getGame(roomId)
        if (!gameState) {
            throw new Error('游戏房间不存在')
        }

        switch (action.action) {
            case 'speech':
                await this.processSpeech(gameState, { agentId: action.agentId, content: action.content })
                break
            case 'vote':
                if (!action.voteToMockName) {
                    throw new Error('投票目标不能为空')
                }
                await this.processVote(gameState, { agentId: action.agentId, voteToMockName: action.voteToMockName })
                break
            default:
                throw new Error(`不支持的动作类型: ${action.action}`)
        }

        await this.storageService.saveGame(gameState)
    }

    // 处理发言
    private async processSpeech(gameState: GameState, action: { agentId: string, content: string }): Promise<void> {
        const player = gameState.players.find(p => p.agentId === action.agentId)
        if (!player) {
            throw new Error('玩家不存在')
        }

        if (player.playerStatus === 'dead') {
            throw new Error('死亡玩家不能发言')
        }

        const event: GameEvent = {
            round: gameState.currentRound,
            eventType: 'speech',
            text: action.content,
            highLightIndex: gameState.players.findIndex(p => p.agentId === action.agentId),
            currentStatusDescriptions: this.generateStatusDescriptions(gameState),
            playerList: gameState.players
        }

        gameState.events.push(event)
    }

    // 处理投票
    private async processVote(gameState: GameState, action: { agentId: string, voteToMockName: string }): Promise<void> {
        const player = gameState.players.find(p => p.agentId === action.agentId)
        if (!player) {
            throw new Error('玩家不存在')
        }

        if (player.playerStatus === 'dead') {
            throw new Error('死亡玩家不能投票')
        }

        const targetPlayer = gameState.players.find(p => p.mockName === action.voteToMockName)
        if (!targetPlayer) {
            throw new Error('投票目标不存在')
        }

        const event: GameEvent = {
            round: gameState.currentRound,
            eventType: 'vote',
            voteToMockName: action.voteToMockName,
            voteToAgentId: targetPlayer.agentId || undefined,
            voteIsValid: true,
            highLightIndex: gameState.players.findIndex(p => p.agentId === action.agentId),
            currentStatusDescriptions: this.generateStatusDescriptions(gameState),
            playerList: gameState.players
        }

        gameState.events.push(event)

        // 检查是否所有活着的玩家都已投票
        const alivePlayersCount = gameState.players.filter(p => p.playerStatus === 'alive').length
        const currentRoundVotes = gameState.events.filter(e => 
            e.round === gameState.currentRound && 
            e.eventType === 'vote' && 
            e.voteIsValid
        ).length

        if (currentRoundVotes === alivePlayersCount) {
            await this.processRoundEnd(gameState)
        }
    }

    // 处理回合结束
    private async processRoundEnd(gameState: GameState): Promise<void> {
        // 统计投票
        const votes = new Map<string, number>()
        const currentRoundVotes = gameState.events.filter(e => 
            e.round === gameState.currentRound && 
            e.eventType === 'vote' && 
            e.voteIsValid
        )

        for (const vote of currentRoundVotes) {
            if (vote.voteToMockName) {
                votes.set(
                    vote.voteToMockName, 
                    (votes.get(vote.voteToMockName) || 0) + 1
                )
            }
        }

        // 找出票数最多的玩家
        let maxVotes = 0
        let votedOutPlayers: string[] = []
        for (const [mockName, voteCount] of votes.entries()) {
            if (voteCount > maxVotes) {
                maxVotes = voteCount
                votedOutPlayers = [mockName]
            } else if (voteCount === maxVotes) {
                votedOutPlayers.push(mockName)
            }
        }

        // 处理投票结果
        if (votedOutPlayers.length === 1) {
            const votedOutPlayer = gameState.players.find(p => p.mockName === votedOutPlayers[0])
            if (votedOutPlayer) {
                votedOutPlayer.playerStatus = 'dead'
            }
        }

        // 检查游戏是否结束
        if (this.checkGameOver(gameState)) {
            await this.endGame(gameState)
        } else {
            // 进入下一回合
            gameState.currentRound++
        }
    }

    // 检查游戏是否结束
    private checkGameOver(gameState: GameState): boolean {
        const alivePlayers = gameState.players.filter(p => p.playerStatus === 'alive')
        const aliveSpies = alivePlayers.filter(p => p.role === 'spy').length
        const aliveInnocents = alivePlayers.filter(p => p.role === 'innocent').length

        return aliveSpies === 0 || aliveSpies >= aliveInnocents
    }

    // 结束游戏
    private async endGame(gameState: GameState): Promise<void> {
        const alivePlayers = gameState.players.filter(p => p.playerStatus === 'alive')
        const aliveSpies = alivePlayers.filter(p => p.role === 'spy').length
        const winnerRole = aliveSpies === 0 ? 'innocent' : 'spy'

        // 更新游戏状态
        gameState.status = 'finished'
        gameState.endGameData = {
            winnerRole,
            winners: gameState.players.filter(p => p.role === winnerRole),
            scores: []
        }

        // 添加游戏结束事件
        const event: GameEvent = {
            round: gameState.currentRound,
            eventType: 'end',
            winnerRole,
            highLightIndex: 0,
            currentStatusDescriptions: this.generateStatusDescriptions(gameState),
            playerList: gameState.players
        }
        gameState.events.push(event)

        // 更新获胜者状态
        const winnerIds = gameState.players
            .filter(p => p.role === winnerRole)
            .map(p => p.agentId)
            .filter((id): id is string => id !== undefined)

        await this.contractService.concludeGame(gameState.roomId, winnerIds)
    }

    // 生成状态描述
    private generateStatusDescriptions(gameState: GameState): string[] {
        const descriptions: string[] = []
        for (const player of gameState.players) {
            descriptions.push(`${player.mockName}(${player.playerStatus})`)
        }
        return descriptions
    }

    // 检查并匹配玩家
    private async checkAndMatchPlayers(): Promise<void> {
        if (GameService.isProcessingMatch) {
            // 如果上一次匹配还在进行中，检查是否超时
            if (GameService.processingMatchStartTime && 
                Date.now() - GameService.processingMatchStartTime > GameService.TIMEOUTS.LOCK) {
                GameService.isProcessingMatch = false
            } else {
                return
            }
        }
        const corid = uuidv4()
        try {
            console.log(corid,'[匹配] 执行匹配流程开始')
            GameService.isProcessingMatch = true
            GameService.processingMatchStartTime = Date.now()

            const matchingPlayers = await this.storageService.getAllMatchingPlayers()
            if (matchingPlayers.length < GameService.GAME_CONFIG.MIN_PLAYERS_TO_START) {
                return
            }

            // 按分数排序
            matchingPlayers.sort((a, b) => a.score - b.score)

            // 尝试匹配玩家
            for (let i = 0; i < matchingPlayers.length; i++) {
                const currentPlayer = matchingPlayers[i]
                const matchedPlayers = [currentPlayer]

                // 在分数范围内寻找其他玩家
                for (let j = 0; j < matchingPlayers.length; j++) {
                    if (i === j) continue

                    const otherPlayer = matchingPlayers[j]
                    if (Math.abs(currentPlayer.score - otherPlayer.score) <= GameService.GAME_CONFIG.SCORE_RANGE) {
                        matchedPlayers.push(otherPlayer)
                    }

                    if (matchedPlayers.length === GameService.GAME_CONFIG.PLAYERS_PER_ROOM) {
                        break
                    }
                }

                // 如果找到足够的玩家，创建房间
                if (matchedPlayers.length >= GameService.GAME_CONFIG.MIN_PLAYERS_TO_START) {
                    await this.createRoomWithTransaction(matchedPlayers)
                    // 从匹配列表中移除已匹配的玩家
                    matchingPlayers.splice(0, matchedPlayers.length)
                    i = -1 // 重新开始匹配
                }
            }
        } finally {
            GameService.isProcessingMatch = false
            GameService.processingMatchStartTime = null
            console.log(corid,'[匹配] 执行匹配流程结束')
        }
    }

    // 创建房间事务
    private async createRoomWithTransaction(matchedPlayers: { agentId: string, score: number, isHuman: boolean }[]): Promise<void> {
        const roomId = uuidv4()
        const gameState: GameState = {
            roomId,
            status: 'waiting',
            currentRound: 1,
            players: [],
            events: []
        }

        // 检查所有玩家的当前状态
        for (const player of matchedPlayers) {
            const state = await GameService.getAgentState(player.agentId)
            if (state.status !== 'in_matching_queue') {
                throw new Error(`玩家 ${player.agentId} 状态异常: ${state.status}，期望状态: in_matching_queue`)
            }
        }

        const cleanupStates = async () => {
            for (const player of gameState.players) {
                if (player.agentId) {
                    try {
                        const currentState = await GameService.getAgentState(player.agentId)
                        // 只有当玩家在匹配队列中时才清理状态
                        if (currentState.status === 'in_matching_queue') {
                            await GameService.updateAgentState(player.agentId, {
                                status: 'idle',
                                roomId: null
                            })
                        }
                    } catch (error: unknown) {
                        console.error(`清理玩家 ${player.agentId} 状态失败:`, error)
                    }
                }
            }
        }

        try {
            // 为本房间生成随机名字
            const mockNames = GameService.getRandomMockNames(matchedPlayers.length)
            
            // 获取玩家信息并分配角色
            for (let i = 0; i < matchedPlayers.length; i++) {
                const matchedPlayer = matchedPlayers[i]
                const agent = await this.contractService.getAgentById(matchedPlayer.agentId)
                if (!agent) {
                    throw new Error(`玩家 ${matchedPlayer.agentId} 不存在`)
                }
                
                gameState.players.push({
                    agentId: agent.agentId,
                    mockName: mockNames[i],
                    agentName: agent.name,
                    role: 'innocent',
                    playerStatus: 'alive',
                    avatar: agent.avatar || undefined,
                    winningRate: undefined,
                    gameCount: agent.gameCount,
                    rankNo: undefined,
                    score: agent.score
                })
            }

            // 分配角色
            const spyCount = Math.floor(gameState.players.length * GameService.GAME_CONFIG.SPY_RATIO)
            const playerIndices = Array.from({ length: gameState.players.length }, (_, i) => i)
            const array = new Uint32Array(spyCount)
            crypto.getRandomValues(array)
            
            for (let i = 0; i < spyCount; i++) {
                const randomIndex = array[i] % playerIndices.length
                const playerIndex = playerIndices.splice(randomIndex, 1)[0]
                if (gameState.players[playerIndex]) {
                    gameState.players[playerIndex].role = 'spy'
                }
            }

            // 保存游戏状态
            await this.storageService.saveGame(gameState)

            // 更新玩家状态前再次检查
            for (const player of gameState.players) {
                if (player.agentId) {
                    const currentState = await GameService.getAgentState(player.agentId)
                    if (currentState.status === 'in_matching_queue') {
                        await GameService.updateAgentState(player.agentId, {
                            status: 'inGame',
                            roomId
                        })
                        await this.storageService.removeFromMatching(player.agentId)
                    } else {
                        throw new Error(`玩家 ${player.agentId} 状态已改变: ${currentState.status}，无法加入游戏`)
                    }
                }
            }

            // 添加游戏开始事件
            const event: GameEvent = {
                round: 1,
                eventType: 'start',
                highLightIndex: 0,
                currentStatusDescriptions: this.generateStatusDescriptions(gameState),
                playerList: gameState.players
            }
            gameState.events.push(event)
            await this.storageService.saveGame(gameState)

        } catch (error) {
            await cleanupStates()
            throw error
        }
    }
}

// 创建单例实例
export const gameService = GameService.getInstance() 