# 开发规范：禁止使用保底机制和模拟响应

## 核心原则

**问题必须暴露，不能掩盖**

当系统出现配置错误、API 调用失败或其他异常时，应该立即抛出明确的错误，而不是使用保底机制返回模拟数据或默认行为。

## 禁止的模式

### ❌ 错误示例 1：API 失败时返回模拟响应

```python
# 错误做法
try:
    response = await call_ai_api(data)
    return response
except Exception as e:
    # ❌ 使用模拟响应掩盖问题
    return generate_mock_response(data)
```

**问题：**
- 掩盖了真实的 API 调用失败
- 用户无法知道系统出了问题
- 开发者难以排查和修复问题
- 模拟响应的逻辑可能与真实 API 不一致

### ❌ 错误示例 2：配置缺失时使用默认值

```python
# 错误做法
api_key = os.getenv("API_KEY")
if not api_key:
    # ❌ 使用模拟模式
    return mock_mode_handler(request)
```

**问题：**
- 配置错误被静默处理
- 系统在错误配置下继续运行
- 生产环境可能意外使用模拟模式

### ❌ 错误示例 3：多层保底机制

```python
# 错误做法
for retry in range(max_retries):
    try:
        return call_api()
    except:
        if retry == max_retries - 1:
            # ❌ 最后一次失败时返回保底响应
            return fallback_response()
```

**问题：**
- 真实错误被保底机制掩盖
- 无法区分成功和失败的情况
- 调试困难

## 正确的模式

### ✅ 正确示例 1：直接抛出错误

```python
# 正确做法
try:
    response = await call_ai_api(data)
    return response
except Exception as e:
    logger.error(f"AI API 调用失败: {str(e)}")
    raise HTTPException(
        status_code=500,
        detail=f"AI API 调用失败: {str(e)}"
    )
```

**优点：**
- 错误立即暴露
- 用户知道系统出了问题
- 开发者可以快速定位问题
- 日志记录完整

### ✅ 正确示例 2：配置验证

```python
# 正确做法
api_key = settings.API_KEY
if not api_key:
    raise HTTPException(
        status_code=500,
        detail="未配置 API 密钥。请在 .env 文件中配置 API_KEY"
    )
```

**优点：**
- 配置问题立即发现
- 错误信息明确指导如何修复
- 避免系统在错误配置下运行

### ✅ 正确示例 3：重试后抛出错误

```python
# 正确做法
for retry in range(max_retries):
    try:
        return call_api()
    except Exception as e:
        logger.error(f"API 调用失败 (重试 {retry + 1}): {str(e)}")
        if retry == max_retries - 1:
            # ✅ 最后一次失败时抛出错误
            raise HTTPException(
                status_code=500,
                detail=f"API 调用失败，已重试 {max_retries} 次: {str(e)}"
            )
```

**优点：**
- 重试机制合理
- 最终失败时错误明确
- 日志记录完整

## 错误处理最佳实践

### 1. 使用明确的错误信息

```python
# ❌ 错误
raise HTTPException(status_code=500, detail="Error")

# ✅ 正确
raise HTTPException(
    status_code=500,
    detail="DeepSeek API 调用失败: 401 Unauthorized. 请检查 APIKEY_MacOS_Code_DeepSeek 配置"
)
```

### 2. 记录详细日志

```python
# ✅ 正确
logger.error(f"AI API 调用失败: {response.status_code} - {response.text}")
logger.error(f"请求数据: {json.dumps(data, ensure_ascii=False)}")
```

### 3. 提供修复指导

```python
# ✅ 正确
raise HTTPException(
    status_code=500,
    detail=(
        "未配置 AI API 密钥。"
        "请在 .env 文件中配置以下任一密钥：\n"
        "- APIKEY_MacOS_Code_DeepSeek\n"
        "- APIKEY_MacOS_Code_MoonShot"
    )
)
```

## 何时可以使用默认值

只有在以下情况下才可以使用默认值：

1. **非关键配置**：如日志级别、超时时间等
2. **有合理默认值**：默认值在大多数情况下都是合理的
3. **不影响核心功能**：使用默认值不会导致功能异常

```python
# ✅ 可以使用默认值
timeout = settings.API_TIMEOUT or 30  # 超时时间有合理默认值
log_level = settings.LOG_LEVEL or "INFO"  # 日志级别有合理默认值

# ❌ 不能使用默认值
api_key = settings.API_KEY or "mock_key"  # API 密钥没有合理默认值
```

## 测试环境的特殊处理

如果需要在测试环境使用模拟数据，应该：

1. **明确标识测试环境**
2. **使用环境变量控制**
3. **在日志中明确标注**

```python
# ✅ 正确的测试环境处理
if settings.ENVIRONMENT == "test":
    logger.warning("⚠️ 测试环境：使用模拟 AI 响应")
    return mock_response()
else:
    return call_real_api()
```

## 历史教训

### 案例：麻瓜拼接 AI 功能

**问题：**
- 代码中有保底机制：当没有 API 密钥时使用模拟响应
- 服务器 `.env` 文件中没有配置 DeepSeek API 密钥
- 系统一直使用模拟响应，但用户和开发者都不知道
- 模拟响应逻辑简单，无法理解复杂的"分段"和"交替"语义
- 用户反馈 AI 理解错误，但实际上根本没有调用真正的 AI

**修复：**
1. 移除所有模拟响应和保底机制
2. 当 API 密钥缺失时直接抛出错误
3. 配置正确的 API 密钥
4. 问题立即解决

**教训：**
- 保底机制掩盖了配置错误
- 如果一开始就抛出错误，问题会立即暴露
- 排查问题浪费了大量时间

## 代码审查检查清单

在代码审查时，检查以下内容：

- [ ] 是否有 `generate_mock_response` 类似的函数？
- [ ] 是否有 `if not api_key: return mock_data` 类似的逻辑？
- [ ] 异常处理是否返回了模拟数据？
- [ ] 配置缺失时是否使用了默认行为？
- [ ] 错误信息是否明确且包含修复指导？
- [ ] 日志是否记录了足够的调试信息？

## 总结

**核心原则：让问题暴露，不要掩盖**

- ✅ 直接抛出明确的错误
- ✅ 提供详细的错误信息和修复指导
- ✅ 记录完整的日志
- ❌ 不要使用保底机制
- ❌ 不要返回模拟响应
- ❌ 不要静默处理配置错误

**记住：一个明确的错误比一个隐藏的 bug 好一万倍。**
