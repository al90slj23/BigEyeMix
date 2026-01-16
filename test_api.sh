#!/bin/bash

API_URL="https://bem.it.sc.cn/api/ai/splice"

echo "======================================================================"
echo "测试场景 1: 简单拼接"
echo "======================================================================"

curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "测试提示词",
    "system_prompt": "你是专业的音频拼接专家",
    "context": {
      "tracks": [
        {
          "id": 0,
          "label": "A",
          "name": "知我.mp3",
          "duration": 192.28,
          "clips": [{"id": 1, "start": 0, "end": 192.28, "duration": 192.28}]
        },
        {
          "id": 1,
          "label": "B",
          "name": "春颂.flac",
          "duration": 116.6,
          "clips": [{"id": 1, "start": 0, "end": 116.6, "duration": 116.6}]
        }
      ]
    },
    "user_description": "把第一段和第二段拼接起来"
  }' | python3 -m json.tool

echo -e "\n\n======================================================================"
echo "测试场景 2: 分段交替"
echo "======================================================================"

curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "测试提示词",
    "system_prompt": "你是专业的音频拼接专家",
    "context": {
      "tracks": [
        {
          "id": 0,
          "label": "A",
          "name": "知我.mp3",
          "duration": 192.28,
          "clips": [{"id": 1, "start": 0, "end": 192.28, "duration": 192.28}]
        },
        {
          "id": 1,
          "label": "B",
          "name": "春颂.flac",
          "duration": 116.6,
          "clips": [{"id": 1, "start": 0, "end": 116.6, "duration": 116.6}]
        }
      ]
    },
    "user_description": "把第一段分成3份，把第二段分成2份，然后把他们交替摆开"
  }' | python3 -m json.tool

echo -e "\n\n======================================================================"
echo "测试场景 3: 静音间隔"
echo "======================================================================"

curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "测试提示词",
    "system_prompt": "你是专业的音频拼接专家",
    "context": {
      "tracks": [
        {
          "id": 0,
          "label": "A",
          "name": "知我.mp3",
          "duration": 192.28,
          "clips": [{"id": 1, "start": 0, "end": 192.28, "duration": 192.28}]
        },
        {
          "id": 1,
          "label": "B",
          "name": "春颂.flac",
          "duration": 116.6,
          "clips": [{"id": 1, "start": 0, "end": 116.6, "duration": 116.6}]
        }
      ]
    },
    "user_description": "把第一段音频每隔30秒加入2秒静音"
  }' | python3 -m json.tool

echo -e "\n\n======================================================================"
echo "测试完成"
echo "======================================================================"
