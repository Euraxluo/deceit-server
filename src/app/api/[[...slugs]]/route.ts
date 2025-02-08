import { Elysia } from 'elysia'
import { swagger } from '@elysiajs/swagger'
import { ContractService } from '@/services/contract'
import { GameService } from '@/services/game'

const contractService = new ContractService()
const gameService = new GameService()

const app = new Elysia({ prefix: '/api' })
    .use(swagger({
        documentation: {
            info: {
                title: 'Deceit Game API Documentation',
                version: '1.0.0'
            }
        }
    }))
    
    // 1. 从链上读取Agent列表
    .get("/agent/list", async () => {
        const agents = await contractService.getAgentList()
        return {
            info: { ok: true },
            data: {
                result: agents,
                total: agents.length
            }
        }
    })

    // 初始化测试数据
    .post("/agent/init", async () => {
        await contractService.initTestData()
        return {
            info: { ok: true },
            data: { success: true }
        }
    })

    // 2. 游戏匹配
    .post("/game/startMatch", async ({ body }: { body: { gameType: string, agentId: string } }) => {
        const { agentId } = body
        // 检查agent当前状态
        const status = await gameService.checkMatchStatus(agentId)
        if (status.gameStatus === 'waiting' || status.gameStatus === 'inGame') {
            console.log(`[匹配] Agent ${agentId} 已在匹配或游戏中`)
            return {
                info: { ok: false },
                data: { 
                    message: 'Agent已在匹配或游戏中',
                    currentStatus: status.gameStatus
                }
            }
        }
        await gameService.startMatching(agentId)
        return {
            info: { ok: true },
            data: { success: true }
        }
    })

    // 取消匹配
    .post("/game/cancelMatch", async ({ body }: { body: { agentId: string } }) => {
        const { agentId } = body
        await gameService.cancelMatching(agentId)
        return {
            info: { ok: true },
            data: { success: true }
        }
    })
    
    .get("/game/checkMatch", async ({ query }: { query: { agentId: string } }) => {
        const { agentId } = query
        const status = await gameService.checkMatchStatus(agentId)
        console.log(`[匹配] Agent ${agentId} 的匹配状态: ${status.gameStatus}, 房间ID: ${status.roomId}`)
        return {
            info: { ok: true },
            data: {
                gameStatus: status.gameStatus,
                roomId: status.roomId
            }
        }
    })
    
    // 3. 房间信息
    .get("/game/room/:roomId", async ({ params }) => {
        const { roomId } = params
        const roomView = await gameService.getRoomView(roomId)
        return {
            info: { ok: true },
            data: roomView
        }
    })

    // 添加getAgentRoomView接口
    .post("/game/getAgentRoomView", async ({ body }: { body: { roomId: string, agentId: string } }) => {
        const { roomId } = body
        const roomView = await gameService.getRoomView(roomId)
        return {
            info: { ok: true },
            data: roomView
        }
    })

    // 4. 游戏动作
    .post("/game/action", async ({ body }: { body: { roomId: string, agentId: string, action: string, content: string } }) => {
        const { roomId, agentId, action, content } = body
        await gameService.processGameAction(roomId, {
            agentId,
            action,
            content
        })
        return {
            info: { ok: true },
            data: { success: true }
        }
    })

// 导出标准HTTP方法
export const GET = app.handle
export const POST = app.handle