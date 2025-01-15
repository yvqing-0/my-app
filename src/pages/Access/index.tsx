import { ProChat } from '@ant-design/pro-chat';
import { useTheme } from 'antd-style';

const API_URL = 'https://api.deepseek.com/chat/completions';
const API_KEY = 'sk-69978225a4024d04acf8362c95d1f7cb';

const fetchChatCompletions = async (messages: any) => {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: messages,
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  const encoder = new TextEncoder();
  let isClosed = false;

  const closeController = (controller: ReadableStreamDefaultController) => {
    if (!isClosed) {
      controller.close();
      isClosed = true;
    }
  };

  const readableStream = new ReadableStream({
    async start(controller) {
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          closeController(controller);
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
              closeController(controller);
              break;
            }
            try {
              const parsed = JSON.parse(message);
              const content = parsed.choices[0]?.delta?.content || '';
              controller.enqueue(encoder.encode(content));
            } catch (error) {
              console.error('解析 JSON 时发生错误', error, '在消息:', message);
            }
          }
        }
      }
    },
  });

  return new Response(readableStream);
};

export default () => {
  const theme = useTheme();
  return (
    <div style={{ background: theme.colorBgLayout, height: '95vh' }}>
      <ProChat request={fetchChatCompletions} />
    </div>
  );
};
