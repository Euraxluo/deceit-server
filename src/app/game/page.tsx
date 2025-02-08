'use client';

import { useState, useEffect } from 'react';
import { Button, Card, List, Avatar, message, Spin } from 'antd';

interface Agent {
  agentId: string;
  name: string;
  avatar: string;
  score: number;
  winningRate: number;
  status: string;
}

interface Player {
  agentId: string | null;
  mockName: string;
  agentName: string;
  role: string | null;
  playerStatus: string;
  avatar: string | null;
}

interface GameEvent {
  round: number;
  eventType: string;
  text?: string;
  mockName?: string;
}

interface RoomData {
  word: string;
  eventList: GameEvent[];
  initialPlayerList: Player[];
  currentStatusDescriptions: string[];
  highLightIndex: number;
}

export default function GamePage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [matchStatus, setMatchStatus] = useState<string>('idle');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomData, setRoomData] = useState<RoomData | null>(null);
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
        setAgents(data.data.result);
      }
    } catch (err) {
      console.error('获取Agent列表失败:', err);
      message.error('获取Agent列表失败');
    }
  };

  // 检查匹配状态
  const checkMatchStatus = async (agentId: string) => {
    if (!agentId) return; // 如果没有agentId，说明已经取消匹配了

    try {
        console.log(`[前端] 检查 Agent ${agentId} 的匹配状态`);
        const response = await fetch(`/api/game/checkMatch?agentId=${agentId}`);
        const data = await response.json();
        
        if (data.info.ok) {
            console.log(`[前端] 匹配状态: ${data.data.gameStatus}, 房间ID: ${data.data.roomId}`);
            if (data.data.gameStatus === 'inGame' && data.data.roomId) {
                setRoomId(data.data.roomId);
                setMatchStatus('inGame');
                fetchRoomData(data.data.roomId);
            } else if (data.data.gameStatus === 'waiting') {
                // 只有在当前还在匹配状态时才继续轮询
                if (matchStatus === 'matching') {
                    setTimeout(() => checkMatchStatus(agentId), 2000);
                }
            } else {
                setLoading(false);
                setMatchStatus('idle');
                setCurrentAgentId(null);
            }
        }
    } catch (err) {
        console.error('检查匹配状态失败:', err);
        message.error('检查匹配状态失败');
        setLoading(false);
        setMatchStatus('idle');
        setCurrentAgentId(null);
    }
  };

  // 开始游戏匹配
  const startMatch = async (agentId: string) => {
    setLoading(true);
    setCurrentAgentId(agentId);
    setMatchStatus('matching'); // 先设置匹配状态，显示UI
    setErrorMessage(null);

    try {
      console.log(`[前端] 开始为 Agent ${agentId} 匹配游戏`);
      const response = await fetch('/api/game/startMatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ gameType: 'entertainment', agentId }),
      });
      const data = await response.json();
      console.log(`[前端] 匹配请求响应: ${JSON.stringify(data)}`);
      
      if (data.info.ok) {
        console.log(`[前端] 匹配请求成功，开始检查匹配状态`);
        setLoading(false);
        checkMatchStatus(agentId);
      } else {
        // 匹配失败，显示错误信息
        setLoading(false);
        setErrorMessage(data.data.message || '开始匹配失败');
        // 延迟2秒后退出匹配状态
        setTimeout(() => {
          setMatchStatus('idle');
          setCurrentAgentId(null);
          setErrorMessage(null);
        }, 2000);
      }
    } catch (err) {
      console.error('开始匹配失败:', err);
      setLoading(false);
      setErrorMessage('开始匹配失败，请重试');
      // 延迟2秒后退出匹配状态
      setTimeout(() => {
        setMatchStatus('idle');
        setCurrentAgentId(null);
        setErrorMessage(null);
      }, 2000);
    }
  };

  // 取消匹配
  const cancelMatch = async () => {
    if (!currentAgentId) {
      message.error('没有正在匹配的Agent');
      return;
    }
    
    try {
      const response = await fetch('/api/game/cancelMatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ agentId: currentAgentId }),
      });
      
      const data = await response.json();
      if (data.info.ok) {
        message.success('已取消匹配');
        setMatchStatus('idle');
        setCurrentAgentId(null);
        setRoomId(null);
        setRoomData(null);
        // 重新获取Agent列表以更新状态
        await fetchAgents();
      } else {
        message.error(data.info.message || '取消匹配失败');
      }
    } catch (err) {
      console.error('取消匹配失败:', err);
      message.error('取消匹配失败，请重试');
    }
  };

  // 获取房间数据
  const fetchRoomData = async (roomId: string) => {
    try {
      const response = await fetch('/api/game/getAgentRoomView', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ roomId, agentId: agents[0]?.agentId })
      });
      const data = await response.json();
      if (data.info.ok) {
        setRoomData(data.data);
        setLoading(false);
        // 如果游戏还在进行中,继续轮询
        if (!data.data.endGameData) {
          setTimeout(() => fetchRoomData(roomId), 3000);
        }
      }
    } catch (err) {
      console.error('获取房间数据失败:', err);
      message.error('获取房间数据失败');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  return (
    <div className="p-4">
        <h1 className="text-2xl font-bold mb-4">谁是卧底游戏</h1>
        
        {matchStatus === 'idle' && (
            <div>
                <h2 className="text-xl mb-4">选择Agent开始游戏</h2>
                <List
                    grid={{ gutter: 16, column: 3 }}
                    dataSource={agents}
                    renderItem={(agent: Agent) => (
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
                                    开始匹配
                                </Button>
                            </Card>
                        </List.Item>
                    )}
                />
            </div>
        )}

        {matchStatus === 'matching' && (
            <div className="text-center">
                {errorMessage ? (
                    <div className="text-red-500 text-lg font-bold mb-4">
                        {errorMessage}
                    </div>
                ) : (
                    <>
                        <Spin size="large" />
                        <p className="mt-4">正在匹配中...</p>
                        <p className="text-gray-500">等待其他玩家加入，或将自动添加AI玩家</p>
                        <p className="text-gray-500">游戏将在以下情况开始：</p>
                        <ul className="list-disc text-left inline-block mt-2">
                            <li>玩家数量达到6个</li>
                            <li>或等待10秒后自动补充AI玩家</li>
                        </ul>
                        <div className="mt-4">
                            <Button 
                                type="primary"
                                danger
                                onClick={cancelMatch}
                            >
                                取消匹配
                            </Button>
                        </div>
                    </>
                )}
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