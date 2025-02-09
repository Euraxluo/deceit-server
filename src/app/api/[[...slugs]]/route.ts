import { Elysia } from 'elysia'
import { swagger } from '@elysiajs/swagger'
import { ContractService } from '@/services/contract'
import { GameService } from '@/services/game'
import { ApiResponse, AgentListResponse, RoomView, CreateAgentRequest } from '@/types'
import { StorageService } from '@/services/storage'

const contractService = new ContractService()
const gameService = GameService.getInstance()
const storageService = new StorageService()

const app = new Elysia({ prefix: '/api' })
    .use(swagger({
        documentation: {
            info: {
                title: 'Deceit Game API Documentation',
                version: '1.0.0'
            }
        }
    }))
    
    // 创建Agent
    .post("/agent/create", async ({ body }: { body: CreateAgentRequest }): Promise<ApiResponse<{ success: boolean }>> => {
        try {
            const { agentId, name, avatar, prompts } = body
            await storageService.saveAgent({
                agentId,
                name,
                avatar: avatar || null,
                status: '1',
                statusName: '在线',
                matchStartTime: null,
                winCount: 0,
                gameCount: 0,
                score: 0,
                prompts
            })
            return {
                info: { 
                    ok: true,
                    msg: null,
                    code: null,
                    redirectUrl: null
                },
                data: { success: true }
            }
        } catch (error) {
            console.error('[Agent] 创建Agent失败:', error)
            return {
                info: {
                    ok: false,
                    msg: '创建Agent失败',
                    code: 'CREATE_AGENT_ERROR',
                    redirectUrl: null
                },
                data: { success: false }
            }
        }
    })

    // 1. 从链上读取Agent列表
    .get("/agent/list", async (): Promise<ApiResponse<AgentListResponse>> => {
        try {
            const agents = await contractService.getAgentList()
            return {
                info: { 
                    ok: true,
                    msg: null,
                    code: null,
                    redirectUrl: null
                },
                data: {
                    result: agents,
                    total: agents.length
                }
            }
        } catch (error) {
            console.error('[Agent] 获取Agent列表失败:', error)
            return {
                info: {
                    ok: false,
                    msg: '获取Agent列表失败',
                    code: 'AGENT_LIST_ERROR',
                    redirectUrl: null
                },
                data: {
                    result: [],
                    total: 0
                }
            }
        }
    })

    // 初始化测试数据
    .post("/agent/init", async (): Promise<ApiResponse<{ success: boolean }>> => {
        try {
            await contractService.initTestData()
            return {
                info: { 
                    ok: true,
                    msg: null,
                    code: null,
                    redirectUrl: null
                },
                data: { success: true }
            }
        } catch (error) {
            console.error('[Agent] 初始化测试数据失败:', error)
            return {
                info: {
                    ok: false,
                    msg: '初始化测试数据失败',
                    code: 'INIT_DATA_ERROR',
                    redirectUrl: null
                },
                data: { success: false }
            }
        }
    })

    // 2. 游戏匹配
    .post("/game/startMatch", async ({ body }: { body: { agentId: string } }): Promise<ApiResponse<{ success: boolean; message?: string; currentStatus?: string }>> => {
        try {
            const { agentId } = body
            // 检查agent当前状态
            const status = await gameService.checkMatchStatus(agentId)
            if (status.gameStatus === 'in_matching_queue' || status.gameStatus === 'inGame') {
                console.log(`[匹配] Agent ${agentId} 已在匹配或游戏中`)
                return {
                    info: { 
                        ok: false,
                        msg: 'Agent已在匹配或游戏中',
                        code: 'ALREADY_IN_GAME',
                        redirectUrl: null
                    },
                    data: { 
                        success: false,
                        message: 'Agent已在匹配或游戏中',
                        currentStatus: status.gameStatus
                    }
                }
            }

            await gameService.startMatching(agentId)
            return {
                info: { 
                    ok: true,
                    msg: null,
                    code: null,
                    redirectUrl: null
                },
                data: { success: true }
            }
        } catch (error) {
            console.error('[匹配] 开始匹配失败:', error)
            return {
                info: {
                    ok: false,
                    msg: '开始匹配失败',
                    code: 'START_MATCH_ERROR',
                    redirectUrl: null
                },
                data: { 
                    success: false,
                    message: error instanceof Error ? error.message : '未知错误'
                }
            }
        }
    })

    // 取消匹配
    .post("/game/cancelMatch", async ({ body }: { body: { agentId: string } }): Promise<ApiResponse<{ success: boolean }>> => {
        try {
            const { agentId } = body
            await gameService.cancelMatching(agentId)
            return {
                info: { 
                    ok: true,
                    msg: null,
                    code: null,
                    redirectUrl: null
                },
                data: { success: true }
            }
        } catch (error) {
            console.error('[匹配] 取消匹配失败:', error)
            return {
                info: {
                    ok: false,
                    msg: '取消匹配失败',
                    code: 'CANCEL_MATCH_ERROR',
                    redirectUrl: null
                },
                data: { 
                    success: false
                }
            }
        }
    })
    
    .get("/game/checkMatch", async ({ query }: { query: { agentId: string } }): Promise<ApiResponse<{ gameStatus: string; roomId: string | null }>> => {
        try {
            const { agentId } = query
            const status = await gameService.checkMatchStatus(agentId)
            console.log(`[匹配] Agent ${agentId} 的匹配状态: ${status.gameStatus}, 房间ID: ${status.roomId}`)
            return {
                info: { 
                    ok: true,
                    msg: null,
                    code: null,
                    redirectUrl: null
                },
                data: {
                    gameStatus: status.gameStatus,
                    roomId: status.roomId
                }
            }
        } catch (error) {
            console.error('[匹配] 检查匹配状态失败:', error)
            return {
                info: {
                    ok: false,
                    msg: '检查匹配状态失败',
                    code: 'CHECK_MATCH_ERROR',
                    redirectUrl: null
                },
                data: {
                    gameStatus: 'idle',
                    roomId: null
                }
            }
        }
    })
    
    // 3. 房间信息
    .get("/game/room/:roomId", async ({ params }): Promise<ApiResponse<RoomView>> => {
        try {
            const { roomId } = params
            const roomView = await gameService.getRoomView(roomId)
            return {
                info: { 
                    ok: true,
                    msg: null,
                    code: null,
                    redirectUrl: null
                },
                data: roomView
            }
        } catch (error) {
            console.error('[游戏] 获取房间信息失败:', error)
            return {
                info: {
                    ok: false,
                    msg: '获取房间信息失败',
                    code: 'GET_ROOM_ERROR',
                    redirectUrl: null
                },
                data: {
                    word: '',
                    eventList: [],
                    initialPlayerList: [],
                    currentStatusDescriptions: [],
                    roomId: params.roomId,
                    highLightIndex: 0,
                    endGameData: null
                }
            }
        }
    })

    // 获取Agent房间视图
    .post("/game/getAgentRoomView", async ({ body }: { body: { roomId: string, agentId: string } }): Promise<ApiResponse<RoomView>> => {
        try {
            const { roomId } = body
            const roomView = await gameService.getRoomView(roomId)
            return {
                info: { 
                    ok: true,
                    msg: null,
                    code: null,
                    redirectUrl: null
                },
                data: roomView
            }
        } catch (error) {
            console.error('[游戏] 获取Agent房间视图失败:', error)
            return {
                info: {
                    ok: false,
                    msg: '获取Agent房间视图失败',
                    code: 'GET_AGENT_ROOM_ERROR',
                    redirectUrl: null
                },
                data: {
                    word: '',
                    eventList: [],
                    initialPlayerList: [],
                    currentStatusDescriptions: [],
                    roomId: body.roomId,
                    highLightIndex: 0,
                    endGameData: null
                }
            }
        }
    })

    // 4. 游戏动作
    .post("/game/action", async ({ body }: { body: { roomId: string, agentId: string, action: string, content: string, voteToMockName?: string } }): Promise<ApiResponse<{ success: boolean }>> => {
        try {
            const { roomId, agentId, action, content, voteToMockName } = body
            await gameService.processGameAction(roomId, {
                agentId,
                action,
                content,
                voteToMockName
            })
            return {
                info: { 
                    ok: true,
                    msg: null,
                    code: null,
                    redirectUrl: null
                },
                data: { success: true }
            }
        } catch (error) {
            console.error('[游戏] 处理游戏动作失败:', error)
            return {
                info: {
                    ok: false,
                    msg: '处理游戏动作失败',
                    code: 'PROCESS_ACTION_ERROR',
                    redirectUrl: null
                },
                data: { success: false }
            }
        }
    })

// 导出标准HTTP方法
export const GET = app.handle
export const POST = app.handle