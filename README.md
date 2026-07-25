# WhisperRing 💍

> AdventureX 2026 黑客松参赛作品

一枚可以「说话」的语音戒指，连接两个相爱的人。

戴上戒指，长按录下一句想说的话；TA 的手机会收到你的思念，语音自动转写、沉淀为你们共同的回忆。想不起「我们上次去哪玩了」？直接问
AI，它会从你们的真实聊天记录里找答案。最后，还有一只机械臂，把戒指稳稳递到 TA 面前——完成一场属于黑客松的求婚仪式。

## ✨ 功能列表

- **语音戒指采集**：BLE 连接Zilo语音戒指，接收按钮事件，下载录音并解码为 WAV
- **思念传递**：录音上传后台，ASR（faster-whisper）自动转写，双人配对后互相推送
- **回忆问答**：双人模式下可用关键词检索历史对话 + LLM 基于真实记录回答，绝不编造
- **AI 伴侣模式**：单人模式下由 LLM 扮演专属伴侣陪聊
- **机械臂递戒指**：YOLO 检测戒指位姿，机械臂完成「抓取 → 呈递 → 比心」ExpoDay婚礼Demo演示

## 🚀 快速开始

### 后端

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 前端

```bash
cd frontend
npm install
npx expo start
```

### 机械臂 ExpoDay Demo

```bash
colcon build
source install/setup.bash
ros2 launch advx_arm_controller bringup.launch.py
ros2 run advx_arm_controller ring_mover   # h=回位  g=抓取呈递  t=比心
```

## 🛠 技术栈

| 模块   | 技术                           |
|--------|--------------------------------|
| 移动端 | Expo · React Native 0.81       |
| 后端   | FastAPI · faster-whisper       |
| 硬件   | Zilo语音戒指                   |
| 机械臂 | ROS 2 · YOLO · 松灵 agx 机械臂 |

---

Made with ❤️ by **Team VibeWedding** @ AdventureX 2026
