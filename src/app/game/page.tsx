'use client';

import { useState, useEffect } from 'react';
import { Button, Card, List, Avatar, notification, Spin } from 'antd';
import { AgentListItem, Player, GameEvent, RoomView, AgentGameStatus } from '../../types';

interface WebAgent extends AgentListItem {
    winningRate: number;
}

export default function GamePage() {
  const [api, contextHolder] = notification.useNotification();
  const [agents, setAgents] = useState<WebAgent[]>([]);
  const [loading, setLoading] = useState(false);
  const [matchStatus, setMatchStatus] = useState<AgentGameStatus>('idle');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomData, setRoomData] = useState<RoomView | null>(null);
  const [currentAgentId, setCurrentAgentId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 获取Agent列表
  const fetchAgents = async () => {
    try {
      // 先初始化测试数据
      await fetch('/api/agent/init', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      const response = await fetch('/api/agent/list');
      const data = await response.json();
      if (data.info.ok) {
        // 转换数据格式，添加winningRate字段
        const webAgents: WebAgent[] = data.data.result.map((agent: AgentListItem) => ({
          ...agent,
          winningRate: agent.gameCount > 0 ? agent.winCount / agent.gameCount : 0
        }));
        setAgents(webAgents);
      } else {
        throw new Error(data.info.msg || '获取Agent列表失败');
      }
    } catch (err) {
      console.error('获取Agent列表失败:', err);
      api.error({
        message: '获取失败',
        description: '获取Agent列表失败，请稍后重试'
      });
    }
  };

  // 开始游戏匹配
  const startMatch = async (agentId: string) => {
    setLoading(true);
    setCurrentAgentId(agentId);
    setErrorMessage(null);
    
    try {
        console.log(`[前端] 开始为 Agent ${agentId} 匹配游戏`);
        const response = await fetch('/api/game/startMatch', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ agentId }),
        });
        const data = await response.json();
        console.log(`[前端] 匹配请求响应: ${JSON.stringify(data)}`);
        
        if (data.info.ok) {
            console.log(`[前端] 匹配请求成功，开始检查匹配状态`);
            setMatchStatus('in_matching_queue');
            setLoading(false);
            checkMatchStatus(agentId);
        } else {
            // 区分不同类型的错误
            if (data.info.code === 'ALREADY_IN_GAME') {
                api.warning({
                    message: '无法匹配',
                    description: data.info.msg || 'Agent已在匹配或游戏中'
                });
                setMatchStatus('idle');
            } else {
                api.error({
                    message: '匹配失败',
                    description: data.info.msg || '开始匹配失败'
                });
                setMatchStatus('idle');
            }
            setCurrentAgentId(null);
            setLoading(false);
        }
    } catch (err) {
        console.error('开始匹配失败:', err);
        api.error({
            message: '匹配失败',
            description: '开始匹配失败，请重试'
        });
        handleMatchError('开始匹配失败，请重试');
    }
  };

  // 取消匹配
  const cancelMatch = async () => {
    if (!currentAgentId) {
        api.error({
            message: '操作失败',
            description: '没有正在匹配的Agent'
        });
        return;
    }
    
    setLoading(true);
    
    try {
        // 先检查agent当前状态
        const checkResponse = await fetch(`/api/game/checkMatch?agentId=${currentAgentId}`);
        const checkData = await checkResponse.json();
        
        if (checkData.info.ok && checkData.data.gameStatus === 'idle') {
            setMatchStatus('idle');
            setCurrentAgentId(null);
            setLoading(false);
            api.info({
                message: '提示',
                description: 'Agent已不在匹配队列中'
            });
            return;
        }
        
        const response = await fetch('/api/game/cancelMatch', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ agentId: currentAgentId }),
        });
        
        const data = await response.json();
        if (data.info.ok) {
            api.success({
                message: '成功',
                description: '已取消匹配'
            });
            setMatchStatus('idle');
            setCurrentAgentId(null);
            setRoomId(null);
            setRoomData(null);
            await fetchAgents();
        } else {
            api.error({
                message: '错误',
                description: data.info.msg || '取消匹配失败'
            });
        }
    } catch (err) {
        console.error('取消匹配失败:', err);
        api.error({
            message: '操作失败',
            description: '取消匹配失败，请重试'
        });
    } finally {
        setLoading(false);
    }
  };

  // 检查匹配状态
  const checkMatchStatus = async (agentId: string) => {
    if (!agentId || matchStatus !== 'in_matching_queue') return;

    try {
        console.log(`[前端] 检查 Agent ${agentId} 的匹配状态`);
        const response = await fetch(`/api/game/checkMatch?agentId=${agentId}`);
        const data = await response.json();
        
        if (data.info.ok) {
            const gameStatus = data.data.gameStatus as AgentGameStatus;
            console.log(`[前端] 匹配状态: ${gameStatus}, 房间ID: ${data.data.roomId}`);
            
            if (gameStatus === 'idle') {
                setMatchStatus('idle');
                setCurrentAgentId(null);
                setLoading(false);
                api.info({
                    message: '匹配已结束',
                    description: 'Agent已不在匹配队列中'
                });
                return;
            }
            
            if (gameStatus === 'inGame' && data.data.roomId) {
                setRoomId(data.data.roomId);
                setMatchStatus('inGame');
                fetchRoomData(data.data.roomId);
                api.info({
                    message: '匹配成功',
                    description: 'Agent已成功匹配到游戏'
                });
            } else if (gameStatus === 'in_matching_queue') {
                api.info({
                    message: '匹配中',
                    description: 'Agent仍在匹配队列中'
                });
                setTimeout(() => checkMatchStatus(agentId), 2000);
            }
        }
    } catch (err) {
        console.error('检查匹配状态失败:', err);
        api.error({
            message: '检查匹配错误',
            description: '检查匹配状态失败'
        });
        setLoading(false);
        setMatchStatus('idle');
        setCurrentAgentId(null);
    }
  };

  // 处理匹配错误
  const handleMatchError = (errorMsg: string) => {
    setLoading(false);
    setErrorMessage(errorMsg);
    setTimeout(() => {
        setMatchStatus('idle');
        setCurrentAgentId(null);
        setErrorMessage(null);
    }, 2000);
  };

  // 获取房间数据
  const fetchRoomData = async (roomId: string) => {
    try {
      const response = await fetch('/api/game/getAgentRoomView', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ roomId, agentId: currentAgentId })
      });
      const data = await response.json();
      if (data.info.ok) {
        setRoomData(data.data);
        setLoading(false);
        // 如果游戏还在进行中,继续轮询
        if (!data.data.endGameData) {
          setTimeout(() => fetchRoomData(roomId), 3000);
        }
      } else {
        throw new Error(data.info.msg || '获取房间数据失败');
      }
    } catch (err) {
      console.error('获取房间数据失败:', err);
      api.error({
        message: '获取失败',
        description: '获取房间数据失败，请刷新页面重试'
      });
      setLoading(false);
    }
  };

  // 添加定期状态同步
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    
    if (matchStatus === 'in_matching_queue' && currentAgentId) {
        intervalId = setInterval(async () => {
            try {
                const response = await fetch(`/api/game/checkMatch?agentId=${currentAgentId}`);
                const data = await response.json();
                
                if (data.info.ok) {
                    const gameStatus = data.data.gameStatus as AgentGameStatus;
                    console.log(`[前端] 检查到游戏状态: ${gameStatus}`);
                    
                    if (gameStatus === 'inGame' && data.data.roomId) {
                        setRoomId(data.data.roomId);
                        setMatchStatus('inGame');
                        fetchRoomData(data.data.roomId);
                    } else if (gameStatus === 'idle') {
                        setMatchStatus('idle');
                        setCurrentAgentId(null);
                        api.info({
                            message: '匹配结束',
                            description: '匹配已结束'
                        });
                    }
                }
            } catch (error) {
                console.error('状态同步检查失败:', error);
            }
        }, 2000);
    }
    
    return () => {
        if (intervalId) {
            clearInterval(intervalId);
        }
    };
}, [matchStatus, currentAgentId]);

  useEffect(() => {
    fetchAgents();
  }, []);

  return (
    <div className="p-4">
        {contextHolder}
        <h1 className="text-2xl font-bold mb-4">谁是卧底游戏</h1>
        
        {matchStatus === 'idle' && (
            <div>
                <h2 className="text-xl mb-4">选择Agent开始游戏</h2>
                <List
                    grid={{ gutter: 16, column: 3 }}
                    dataSource={agents}
                    renderItem={(agent: WebAgent) => (
                        <List.Item>
                            <Card>
                                <Card.Meta
                                    avatar={<Avatar src={agent.avatar} />}
                                    title={agent.name}
                                    description={`胜率: ${(agent.winningRate * 100).toFixed(1)}%`}
                                />
                                <Button
                                    type="primary"
                                    className="mt-4"
                                    onClick={() => startMatch(agent.agentId)}
                                    loading={loading && currentAgentId === agent.agentId}
                                    disabled={loading && currentAgentId !== agent.agentId}
                                >
                                    {loading && currentAgentId === agent.agentId ? '匹配中...' : '开始匹配'}
                                </Button>
                            </Card>
                        </List.Item>
                    )}
                />
            </div>
        )}

        {matchStatus === 'in_matching_queue' && (
            <div className="text-center">
                <Spin size="large" />
                <p className="mt-4">正在匹配中...</p>
                <p className="text-gray-500">等待其他玩家加入，或将自动添加AI玩家</p>
                <p className="text-gray-500">游戏将在以下情况开始：</p>
                <ul className="list-disc text-left inline-block mt-2">
                    <li>玩家数量达到6个</li>
                    <li>或等待10秒后自动补充AI玩家</li>
                </ul>
                <div className="mt-4 flex flex-col items-center gap-2">
                    <Button 
                        type="primary"
                        danger
                        onClick={cancelMatch}
                        loading={loading}
                        disabled={loading}
                    >
                        取消匹配
                    </Button>
                    {errorMessage && (
                        <p className="text-yellow-500 mt-2">{errorMessage}</p>
                    )}
                </div>
            </div>
        )}

        {matchStatus === 'inGame' && roomData && (
            <div>
                <h2 className="text-xl mb-4">游戏房间 #{roomId}</h2>
                <div className="grid grid-cols-2 gap-4">
                    <Card title="玩家列表">
                        <List
                            dataSource={roomData.initialPlayerList}
                            renderItem={(player: Player, index: number) => (
                                <List.Item>
                                    <List.Item.Meta
                                        avatar={<Avatar src={player.avatar} />}
                                        title={`${player.mockName} (${player.agentName})`}
                                        description={roomData.currentStatusDescriptions[index]}
                                    />
                                </List.Item>
                            )}
                        />
                    </Card>
                    <Card title="游戏信息">
                        <p>你的词语: {roomData.word}</p>
                        <div className="mt-4">
                            <h3 className="font-bold mb-2">事件列表:</h3>
                            <List
                                dataSource={roomData.eventList}
                                renderItem={(event: GameEvent) => (
                                    <List.Item>
                                        {event.text || `${event.mockName} ${event.eventType}`}
                                    </List.Item>
                                )}
                            />
                        </div>
                    </Card>
                </div>
            </div>
        )}
    </div>
  );
}