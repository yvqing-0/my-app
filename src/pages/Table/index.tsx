import {
  ChatMessage,
  ProChat,
  ProChatInstance,
  useProChat,
} from '@ant-design/pro-chat';
import { Card, List, Typography } from 'antd';
import { useTheme } from 'antd-style';
import localForage from 'localforage';
import React, { useEffect, useRef, useState } from 'react';

// 配置 localForage
localForage.config({
  name: 'chatApp',
  storeName: 'chats',
});

// 自定义钩子：用于将状态与 localForage 同步
function usePersistedState<T>(
  key: string,
  initialValue: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(initialValue);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  useEffect(() => {
    let isMounted = true;
    // 从 localForage 加载数据
    localForage
      .getItem<T>(key)
      .then((stored) => {
        if (isMounted && stored !== null) {
          setState(stored);
        }
        if (isMounted) {
          setIsLoaded(true);
        }
      })
      .catch((error) => {
        console.error(`读取 ${key} 时出错:`, error);
        if (isMounted) {
          setIsLoaded(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [key]);

  useEffect(() => {
    if (isLoaded) {
      // 仅在初始数据加载完成后才保存
      localForage.setItem(key, state).catch((error: Error) => {
        console.error(`保存 ${key} 时出错:`, error);
      });
    }
  }, [key, state, isLoaded]);

  return [state, setState];
}

async function fetchChatResponse(messages: any[]): Promise<Response> {
  const supportedRoles = ['system', 'user', 'assistant', 'tool'];
  // 过滤掉不支持的角色
  const filteredMessages = messages.filter((msg) =>
    supportedRoles.includes(msg.role),
  );

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer sk-0224ee6ecc6d421584c1989ac94c10ad`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: filteredMessages,
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  const encoder = new TextEncoder();

  const readableStream = new ReadableStream({
    async start(controller) {
      let buffer = '';
      let isClosed = false;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            if (!isClosed) {
              controller.close();
              isClosed = true;
            }
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (let line of lines) {
            line = line.trim();
            if (line.startsWith('data: ')) {
              const message = line.replace('data: ', '').trim();
              if (message === '[DONE]') {
                if (!isClosed) {
                  controller.close();
                  isClosed = true;
                }
                break;
              }
              try {
                const parsed = JSON.parse(message);
                const content = parsed.choices[0]?.delta?.content || '';
                if (content) {
                  controller.enqueue(encoder.encode(content));
                }
              } catch (error) {
                console.error(
                  '解析 JSON 时发生错误:',
                  error,
                  '在消息:',
                  message,
                );
              }
            }
          }

          if (isClosed) {
            break;
          }
        }
      } catch (error) {
        console.error('读取流时发生错误:', error);
        controller.error(error);
      }
    },
  });

  return new Response(readableStream);
}

// 自定义展示组件
const NotificationMessage: React.FC<{ message: any }> = React.memo(
  ({ message }) => {
    const proChat = useProChat();
    const handleClick = (item: string) => {
      // 发送消息
      proChat.sendMessage(item);
    };

    const data = [
      {
        title: '你是谁',
        key: 'option1',
      },
      {
        title: '给我一段代码',
        key: 'option2',
      },
      {
        title: '给我一些减肥建议',
        key: 'option3',
      },
    ];

    return (
      <div>
        <Card
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            backgroundColor: '#ffffff00',
            border: 'none',
          }}
        >
          <Typography style={{ color: 'red' }}>{message}</Typography>
        </Card>
        <Card
          title={
            <Typography style={{ color: '#1890ff' }}>🔔一些tips~</Typography>
          }
          bordered={false}
          style={{
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
            margin: 'auto',
            width: '50%',
          }}
        >
          <List
            dataSource={data}
            renderItem={(item) => (
              <List.Item
                onClick={() => handleClick(item.title)}
                style={{ color: 'red' }}
              >
                🏷：{item.title}
              </List.Item>
            )}
          />
        </Card>
      </div>
    );
  },
);

// 主组件
const ChatPage: React.FC = () => {
  const theme = useTheme();
  const proChatRef = useRef<ProChatInstance>();

  // 定义通知消息，不存储在持久化状态中
  const notification: ChatMessage<Record<string, any>> = {
    content: '🚀hello,你好啊',
    createAt: Date.now(),
    id: 'notification_message',
    role: 'notification',
    updateAt: Date.now(),
  };

  const [storedChats, setStoredChats] = usePersistedState<
    ChatMessage<Record<string, any>>[]
  >('chats', []);

  const handleChatsChange = (newChats: ChatMessage<Record<string, any>>[]) => {
    // 过滤掉具有通知ID的消息
    const filteredChats = newChats.filter(
      (chat) => chat.id !== notification.id,
    );
    setStoredChats(filteredChats);
  };

  return (
    <div style={{ background: theme.colorBgLayout, height: '90vh' }}>
      <ProChat
        chatRef={proChatRef}
        chats={[notification, ...storedChats]}
        onChatsChange={handleChatsChange}
        request={fetchChatResponse}
        chatItemRenderConfig={{
          render: (item, dom, defaultDom) => {
            if (item?.originData?.role === 'notification') {
              return <NotificationMessage message={item.message} />;
            }
            return defaultDom;
          },
        }}
      />
    </div>
  );
};

export default ChatPage;
