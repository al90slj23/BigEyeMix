# 开发测试规范

## 麻瓜模式测试

### 快速进入第二步（编辑器）

在浏览器控制台执行以下脚本，自动选择历史文件并进入第二步：

```javascript
// 自动选择前两个历史文件并进入编辑步骤
(async () => {
    const response = await axios.get(API_BASE + '/api/uploads');
    const files = response.data.files || [];
    
    if (files.length < 2) {
        console.error('历史文件不足2个');
        return;
    }
    
    for (let i = 0; i < 2; i++) {
        const file = files[i];
        const track = state.tracks[i];
        
        track.file = { name: file.filename, size: file.size };
        
        const infoResponse = await axios.get(API_BASE + `/api/uploads/${file.file_id}/info`);
        track.uploaded = { file_id: file.file_id };
        track.info = infoResponse.data.info;
        track.clips = [{ id: 1, start: 0, end: track.info.duration }];
    }
    
    renderUploadList();
    nextStep();
    
    console.log('已进入第二步，轨道:', state.tracks.map(t => t.file?.name));
})();
```

### 注意事项

- 使用 DevTools 测试时，**不要**手动点击上传文件
- 直接通过 API 和状态管理进入目标步骤
- 这样可以快速重复测试，避免每次都要选择文件
