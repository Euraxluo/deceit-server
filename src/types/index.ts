// 玩家信息
export interface Player {
    agentId: string | null
    mockName: string
    agentName: string
    role?: 'spy' | 'innocent'
    playerStatus: 'alive' | 'dead'
    avatar?: string
    winningRate?: number
    spyWinningRate?: number
    modelName?: string
    organization?: string
    score?: number
    gameCount?: number
    rankNo?: number
    overallRating?: number
}

// 游戏事件
export interface GameEvent {
    round: number
    eventType: 'start' | 'hostSpeech' | 'speech' | 'vote' | 'end'
    agentId?: string
    mockName?: string
    text?: string
    voteToMockName?: string
    voteToAgentId?: string
    voteIsValid?: boolean
    winnerRole?: 'spy' | 'innocent'
    playerList: Player[]
    currentStatusDescriptions: string[]
    highLightIndex: number
    loadingMockName?: string
}

// 房间信息
export interface RoomView {
    word: string
    eventList: GameEvent[]
    initialPlayerList: Player[]
    currentStatusDescriptions: string[]
    roomType: 'entertainmentCn' | 'competitive'
    roomId: string | null
    highLightIndex: number
    endGameData?: EndGameData | null
}

// 链上数据类型
export interface Agent {
    id: string
    name: string
    prompt: string
    userAddress: string
    avatar?: string
    score: number
    gameCount: number
    winningRate: number
    spyWinningRate: number
    modelName?: string
    organization?: string
}

export interface Game {
    id: string
    name: string
    responses: string
    players: string[]
    winners: string[]
}

// 后端运行时数据类型
export interface GameState {
    roomId: string
    status: 'waiting' | 'playing' | 'finished'
    word?: string
    players: Player[]
    events: GameEvent[]
    currentRound: number
    endGameData?: EndGameData | null
}

// 游戏结束数据
export interface EndGameData {
    winnerRole: 'spy' | 'innocent'
    winners: Player[]
    scores: Array<{
        playerId: number
        score: number
    }>
}

// API响应格式
export interface ApiResponse<T> {
    info: {
        ok: boolean
        msg: string | null
        code: string | null
        redirectUrl: string | null
    }
    data: T
}

// Agent列表响应
export interface AgentListResponse {
    result: AgentListItem[]
    total: number
}

// Agent列表项
export interface AgentListItem {
    agentId: string
    avatar: string | null
    name: string
    mockName?: string
    token?: string
    score: number
    rank: number | null
    gameCount: number
    winningRate: number
    spyWinningRate: number
    status: string
    statusName: string
    onlineStatus: 'online' | 'offline' | 'playing' | null
    onlineStatusName: string
    matchStartTime: string | null
    link: string | null
    description: string | null
    agentType: 'cnAgent' | 'enAgent'
    agentTypeName: string
    modelName: string | null
    rankScope: string
    competitionId: number
    competitionName: string
    nonDisplayableReason: string | null
    displayable: boolean
    organization?: string
} 