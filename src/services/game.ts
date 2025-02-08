import { GameState, RoomView, GameEvent, Player } from '../types'
import { ContractService } from './contract'
import { StorageService } from './storage'

interface MatchingPlayer {
    agentId: string
    score: number
    timestamp: number
    isHuman: boolean
}

export class GameService {
    private contractService: ContractService
    private storageService: StorageService
    // 使用 static 确保匹配队列在所有实例间共享
    private static matchingPlayers: MatchingPlayer[] = [] // 匹配队列
    private readonly MATCH_TIMEOUT = 30000 // 30秒超时
    private readonly PLAYERS_PER_ROOM = 6 // 每个房间的玩家数
    private readonly SCORE_RANGE = 50 // 分数匹配范围
    private readonly MIN_PLAYERS_TO_START = 3 // 开始匹配的最小玩家数
    private readonly MAX_WAIT_TIME = 10000 // 最长等待时间，10秒
    private readonly CHINESE_NAMES = ['张三', '李四', '王五', '赵六', '钱七', '孙八', '周九', '吴十',
        '郑一', '王二', '刘一', '陈二', '杨三', '黄四', '周五', '吴六']

    constructor() {
        this.contractService = new ContractService()
        this.storageService = new StorageService()
        // 启动定期检查匹配的定时器
        if (!GameService.checkInterval) {
            GameService.checkInterval = setInterval(() => this.checkAndMatchPlayers(), 5000)
        }
    }

    private static checkInterval: NodeJS.Timeout | null = null;

    // 开始匹配
    async startMatching(agentId: string): Promise<void> {
        const agent = await this.contractService.getAgentById(agentId)
        if (!agent) {
            throw new Error('Agent不存在')
        }

        // 检查是否已经在匹配队列中
        const existingPlayer = GameService.matchingPlayers.find(p => p.agentId === agentId)
        if (existingPlayer) {
            console.log(`[匹配] Agent ${agentId} 已在匹配队列中`)
            return
        }

        console.log(`[匹配] Agent ${agentId} 开始匹配, 当前分数: ${agent.score}`)

        // 更新agent状态为匹配中
        await this.contractService.updateAgentStatus(agentId, '2', '匹配中')

        // 加入匹配队列
        GameService.matchingPlayers.push({
            agentId,
            score: agent.score,
            timestamp: Date.now(),
            isHuman: true // 标记为真实玩家
        })
        
        console.log(`[匹配] 当前匹配队列人数: ${GameService.matchingPlayers.length}/${this.PLAYERS_PER_ROOM}, 队列:`, 
            JSON.stringify(GameService.matchingPlayers.map(p => ({
                agentId: p.agentId,
                isHuman: p.isHuman
            })))
        )
    }

    // 取消匹配
    async cancelMatching(agentId: string): Promise<void> {
        console.log(`[匹配] Agent ${agentId} 请求取消匹配`)
        
        // 检查玩家是否在匹配队列中
        const playerIndex = GameService.matchingPlayers.findIndex(p => p.agentId === agentId)
        if (playerIndex === -1) {
            console.log(`[匹配] Agent ${agentId} 不在匹配队列中`)
            return
        }
        
        // 从匹配队列中移除
        GameService.matchingPlayers.splice(playerIndex, 1)
        
        // 更新agent状态为在线
        try {
            await this.contractService.updateAgentStatus(agentId, '1', '在线')
            console.log(`[匹配] Agent ${agentId} 状态已更新为在线`)
        } catch (error) {
            console.error(`[匹配] 更新Agent ${agentId} 状态失败:`, error)
            throw error
        }
        
        console.log(`[匹配] Agent ${agentId} 已从匹配队列中移除，当前队列人数: ${GameService.matchingPlayers.length}/${this.PLAYERS_PER_ROOM}`)
    }

    // 检查匹配状态
    async checkMatchStatus(agentId: string): Promise<{ gameStatus: string, roomId: string | null }> {
        // 检查是否在匹配队列中
        const isMatching = GameService.matchingPlayers.some(p => p.agentId === agentId)
        if (isMatching) {
            return {
                gameStatus: 'waiting',
                roomId: null
            }
        }

        // 检查是否在游戏中
        const games = await this.storageService.getAllGames()
        for (const game of games) {
            if (game.players.some(p => p.agentId === agentId)) {
                return {
                    gameStatus: 'inGame',
                    roomId: game.roomId
                }
            }
        }

        return {
            gameStatus: 'idle',
            roomId: null
        }
    }

    // 获取房间视图
    async getRoomView(roomId: string): Promise<RoomView> {
        const gameState = await this.storageService.getGame(roomId)
        if (!gameState) {
            throw new Error('房间不存在')
        }

        return {
            word: gameState.word || '',
            eventList: gameState.events,
            initialPlayerList: gameState.players,
            currentStatusDescriptions: gameState.players.map(p => `${p.mockName}正在发言`),
            roomType: 'entertainmentCn',
            roomId,
            highLightIndex: 0,
            endGameData: gameState.endGameData
        }
    }

    // 处理游戏动作
    async processGameAction(roomId: string, action: { agentId: string, action: string, content: string, voteToMockName?: string }): Promise<void> {
        const gameState = await this.storageService.getGame(roomId)
        if (!gameState) {
            throw new Error('房间不存在')
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
                throw new Error('未知的游戏动作')
        }

        // 保存游戏状态
        await this.storageService.saveGame(gameState)
    }

    // 处理发言
    private async processSpeech(gameState: GameState, action: { agentId: string, content: string }): Promise<void> {
        const event: GameEvent = {
            round: gameState.currentRound,
            eventType: 'speech',
            agentId: action.agentId,
            text: action.content,
            playerList: gameState.players,
            currentStatusDescriptions: gameState.players.map(p => `${p.mockName}正在发言`),
            highLightIndex: gameState.players.findIndex(p => p.agentId === action.agentId)
        }
        gameState.events.push(event)

        // 检查是否所有玩家都发言完毕
        const speechEvents = gameState.events.filter(e => 
            e.eventType === 'speech' && e.round === gameState.currentRound
        )
        if (speechEvents.length === gameState.players.length) {
            // 开始投票环节
            const hostEvent: GameEvent = {
                round: gameState.currentRound,
                eventType: 'hostSpeech',
                text: `第${gameState.currentRound}轮 投票 开始啦！`,
                playerList: gameState.players,
                currentStatusDescriptions: gameState.players.map(p => `${p.mockName}正在投票`),
                highLightIndex: 0
            }
            gameState.events.push(hostEvent)
        }

        // 保存游戏状态
        await this.storageService.saveGame(gameState)
    }

    // 处理投票
    private async processVote(gameState: GameState, action: { agentId: string, voteToMockName: string }): Promise<void> {
        const voter = gameState.players.find(p => p.agentId === action.agentId)
        const voteTo = gameState.players.find(p => p.mockName === action.voteToMockName)
        
        if (!voter || !voteTo || voter.playerStatus === 'dead') {
            return
        }

        const event: GameEvent = {
            round: gameState.currentRound,
            eventType: 'vote',
            agentId: action.agentId,
            voteToMockName: action.voteToMockName,
            voteToAgentId: voteTo.agentId || undefined,
            voteIsValid: true,
            playerList: gameState.players,
            currentStatusDescriptions: gameState.players.map(p => `${p.mockName}正在投票`),
            highLightIndex: gameState.players.findIndex(p => p.mockName === action.voteToMockName)
        }
        gameState.events.push(event)

        // 检查是否所有存活玩家都投票完毕
        const voteEvents = gameState.events.filter(e => 
            e.eventType === 'vote' && e.round === gameState.currentRound
        )
        const alivePlayers = gameState.players.filter(p => p.playerStatus === 'alive')
        
        if (voteEvents.length === alivePlayers.length) {
            await this.processRoundEnd(gameState)
        }

        // 保存游戏状态
        await this.storageService.saveGame(gameState)
    }

    // 处理回合结束
    private async processRoundEnd(gameState: GameState): Promise<void> {
        // 统计投票
        const voteEvents = gameState.events.filter(e => 
            e.eventType === 'vote' && e.round === gameState.currentRound
        )
        
        // 计算每个玩家获得的票数
        const voteCount = new Map<string, number>()
        voteEvents.forEach(event => {
            if (event.voteToMockName) {
                const count = voteCount.get(event.voteToMockName) || 0
                voteCount.set(event.voteToMockName, count + 1)
            }
        })

        // 找出票数最多的玩家
        let maxVotes = 0
        let votedOutPlayers: string[] = []
        voteCount.forEach((count, mockName) => {
            if (count > maxVotes) {
                maxVotes = count
                votedOutPlayers = [mockName]
            } else if (count === maxVotes) {
                votedOutPlayers.push(mockName)
            }
        })

        // 处理投票结果
        if (votedOutPlayers.length === 1) {
            // 有玩家被投出
            const votedOut = gameState.players.find(p => p.mockName === votedOutPlayers[0])
            if (votedOut) {
                votedOut.playerStatus = 'dead'

                // 检查游戏是否结束
                const isGameOver = this.checkGameOver(gameState)
                if (isGameOver) {
                    await this.endGame(gameState)
                } else {
                    // 进入下一轮
                    gameState.currentRound++
                    const hostEvent: GameEvent = {
                        round: gameState.currentRound,
                        eventType: 'hostSpeech',
                        text: `第${gameState.currentRound}轮 发言 开始啦！`,
                        playerList: gameState.players,
                        currentStatusDescriptions: gameState.players.map(p => `${p.mockName}正在发言`),
                        highLightIndex: 0
                    }
                    gameState.events.push(hostEvent)
                }
            }
        } else {
            // 平票,直接进入下一轮
            gameState.currentRound++
            const hostEvent: GameEvent = {
                round: gameState.currentRound,
                eventType: 'hostSpeech',
                text: `投票平局!第${gameState.currentRound}轮 发言 开始啦！`,
                playerList: gameState.players,
                currentStatusDescriptions: gameState.players.map(p => `${p.mockName}正在发言`),
                highLightIndex: 0
            }
            gameState.events.push(hostEvent)
        }

        // 保存游戏状态
        await this.storageService.saveGame(gameState)
    }

    // 检查游戏是否结束
    private checkGameOver(gameState: GameState): boolean {
        const alivePlayers = gameState.players.filter(p => p.playerStatus === 'alive')
        const aliveSpy = alivePlayers.find(p => p.role === 'spy')
        
        // 卧底被投出,平民胜利
        if (!aliveSpy) {
            return true
        }
        
        // 只剩2个玩家,卧底胜利
        if (alivePlayers.length <= 2) {
            return true
        }

        return false
    }

    // 结束游戏
    private async endGame(gameState: GameState): Promise<void> {
        const aliveSpy = gameState.players.find(p => p.role === 'spy' && p.playerStatus === 'alive')
        const winnerRole = aliveSpy ? 'spy' : 'innocent'
        const winners = gameState.players.filter(p => p.role === winnerRole)

        // 创建结束事件
        const endEvent: GameEvent = {
            round: gameState.currentRound,
            eventType: 'hostSpeech',
            text: `游戏结束!${winnerRole === 'spy' ? '卧底' : '平民'}胜利!`,
            winnerRole,
            playerList: gameState.players,
            currentStatusDescriptions: gameState.players.map(p => `${p.mockName}${p.role === winnerRole ? '胜利' : '失败'}`),
            highLightIndex: gameState.players.findIndex(p => p.role === 'spy')
        }
        gameState.events.push(endEvent)

        // 更新游戏状态
        gameState.status = 'finished'

        // 计算并更新玩家分数
        const scores: {playerId: number, score: number}[] = []
        for (const player of gameState.players) {
            if (player.agentId) {
                const isWinner = player.role === winnerRole
                const scoreChange = isWinner ? 10 : -5
                const agent = await this.contractService.getAgentById(player.agentId)
                if (agent) {
                    scores.push({
                        playerId: parseInt(player.agentId),
                        score: scoreChange
                    })
                    
                    // 更新agent状态和分数
                    await this.contractService.updateAgentStatus(player.agentId, '1', '在线')
                    if (player.role === 'spy') {
                        agent.spyWinningRate = (agent.spyWinningRate * agent.gameCount + (isWinner ? 1 : 0)) / (agent.gameCount + 1)
                    }
                    agent.winningRate = (agent.winningRate * agent.gameCount + (isWinner ? 1 : 0)) / (agent.gameCount + 1)
                    agent.gameCount += 1
                    agent.score += scoreChange
                }
            }
        }

        // 设置游戏结束数据
        const endGameData = {
            winnerRole: winnerRole as 'spy' | 'innocent',
            winners,
            scores
        }
        gameState.endGameData = endGameData

        // 保存游戏状态
        await this.storageService.saveGame(gameState)

        // 创建游戏历史记录
        await this.contractService.concludeGame(gameState.roomId, winners.map(w => w.agentId?.toString() || ''))
    }

    // 定期检查并匹配玩家
    private async checkAndMatchPlayers(): Promise<void> {
        try {
            // 移除超时的玩家
            const now = Date.now()
            const beforeCount = GameService.matchingPlayers.length
            GameService.matchingPlayers = GameService.matchingPlayers.filter(player => {
                const isTimeout = now - player.timestamp > this.MATCH_TIMEOUT
                if (isTimeout) {
                    console.log(`[匹配] Agent ${player.agentId} 匹配超时，从队列中移除`)
                    // 重置玩家状态
                    this.contractService.updateAgentStatus(player.agentId, '1', '在线')
                        .catch(err => console.warn(`[匹配] 更新玩家状态失败: ${err.message}`))
                }
                return !isTimeout
            })
            
            if (beforeCount !== GameService.matchingPlayers.length) {
                console.log(`[匹配] 移除超时玩家后，当前队列人数: ${GameService.matchingPlayers.length}/${this.PLAYERS_PER_ROOM}`)
            }

            // 检查是否有真实玩家在等待
            const humanPlayers = GameService.matchingPlayers.filter(p => p.isHuman)
            if (humanPlayers.length === 0) {
                return
            }

            // 检查最早加入的玩家是否等待足够长
            const earliestHumanPlayer = humanPlayers.reduce((earliest, current) => 
                current.timestamp < earliest.timestamp ? current : earliest
            )

            const waitTime = now - earliestHumanPlayer.timestamp
            console.log(`[匹配] 最早玩家等待时间: ${waitTime}ms, 需要等待: ${this.MAX_WAIT_TIME}ms`)

            // 如果玩家数量已经达到要求，直接开始游戏
            if (GameService.matchingPlayers.length >= this.PLAYERS_PER_ROOM) {
                console.log(`[匹配] 玩家数量已达到要求(${this.PLAYERS_PER_ROOM})，开始游戏`)
                await this.tryStartGame(now)
                return
            }

            // 如果等待时间未到，继续等待
            if (waitTime < this.MAX_WAIT_TIME) {
                console.log(`[匹配] 等待时间未到，继续等待: ${Math.round((this.MAX_WAIT_TIME - waitTime) / 1000)}秒`)
                return
            }

            // 等待时间到，开始添加AI玩家补充到6个
            console.log(`[匹配] 等待时间已到(${this.MAX_WAIT_TIME}ms)，开始添加AI玩家补充到${this.PLAYERS_PER_ROOM}个`)
            await this.tryStartGame(now)

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '未知错误'
            const errorStack = error instanceof Error ? error.stack : ''
            console.error('[匹配] 检查匹配出错:', {
                message: errorMessage,
                stack: errorStack
            })
        }
    }

    // 尝试开始游戏
    private async tryStartGame(now: number): Promise<void> {
        // 获取系统中所有可用的 agent
        const allAgents = await this.contractService.getAllAgents()
        if (!allAgents) {
            console.error('[匹配] 获取可用Agent列表失败')
            return
        }

        const availableAgents = allAgents.filter(agent => 
            agent && agent.agentId && !GameService.matchingPlayers.some(p => p.agentId === agent.agentId)
        )

        // 补充AI玩家到6个
        while (GameService.matchingPlayers.length < this.PLAYERS_PER_ROOM && availableAgents.length > 0) {
            const randomIndex = Math.floor(Math.random() * availableAgents.length)
            const aiAgent = availableAgents.splice(randomIndex, 1)[0]
            if (!aiAgent || !aiAgent.agentId) {
                console.warn('[匹配] 跳过无效的AI玩家')
                continue
            }
            
            GameService.matchingPlayers.push({
                agentId: aiAgent.agentId,
                score: aiAgent.score || 0,
                timestamp: now,
                isHuman: false
            })
            
            console.log(`[匹配] 添加AI玩家 ${aiAgent.agentId} 到匹配队列`)
        }

        // 只有当玩家数量达到6个时才开始游戏
        if (GameService.matchingPlayers.length >= this.PLAYERS_PER_ROOM) {
            // 创建房间
            const players = GameService.matchingPlayers.slice(0, this.PLAYERS_PER_ROOM)
            await this.createRoom(players)
            // 从匹配队列中移除这些玩家
            GameService.matchingPlayers = GameService.matchingPlayers.filter(p => 
                !players.some(g => g.agentId === p.agentId)
            )
            console.log(`[匹配] 成功创建房间，剩余队列人数: ${GameService.matchingPlayers.length}`)
        } else {
            console.log(`[匹配] AI玩家不足，无法开始游戏，当前: ${GameService.matchingPlayers.length}/${this.PLAYERS_PER_ROOM}`)
        }
    }

    // 创建房间
    private async createRoom(matchedPlayers: MatchingPlayer[]): Promise<void> {
        const roomId = Math.random().toString(36).substring(7)
        const players: Player[] = []

        // 获取玩家信息并分配角色
        for (const matchedPlayer of matchedPlayers) {
            const agent = await this.contractService.getAgentById(matchedPlayer.agentId)
            if (agent) {
                const mockName = this.getRandomChineseName()
                players.push({
                    agentId: agent.agentId,
                    mockName,
                    agentName: agent.name,
                    role: players.length === 0 ? 'spy' : 'innocent', // 第一个玩家为卧底
                    playerStatus: 'alive',
                    avatar: agent.avatar || undefined,
                    modelName: agent.modelName || undefined,
                    organization: agent.organization || undefined,
                    winningRate: agent.winningRate,
                    spyWinningRate: agent.spyWinningRate,
                    score: agent.score,
                    gameCount: agent.gameCount
                })
            }
        }

        // 随机打乱玩家顺序
        for (let i = players.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [players[i], players[j]] = [players[j], players[i]]
        }

        // 创建初始游戏事件
        const startEvent: GameEvent = {
            round: 1,
            eventType: 'start',
            playerList: players,
            currentStatusDescriptions: players.map(p => `${p.mockName}正在发言`),
            highLightIndex: 0
        }

        // 创建游戏状态
        const gameState: GameState = {
            roomId,
            status: 'playing',
            word: players[0].role === 'spy' ? '猫' : '狗', // 卧底词和平民词
            players,
            events: [startEvent],
            currentRound: 1
        }

        // 保存游戏状态
        await this.storageService.saveGame(gameState)

        // 更新所有玩家状态
        for (const player of players) {
            if (player.agentId) {
                await this.contractService.updateAgentStatus(player.agentId, '3', '游戏中')
            }
        }

        // 开始游戏
        await this.contractService.startGame(players.map(p => p.agentId?.toString() || ''))
    }

    private getRandomChineseName(): string {
        const index = Math.floor(Math.random() * this.CHINESE_NAMES.length)
        const name = this.CHINESE_NAMES[index]
        // 从名字列表中移除已使用的名字
        this.CHINESE_NAMES.splice(index, 1)
        return name
    }
} 