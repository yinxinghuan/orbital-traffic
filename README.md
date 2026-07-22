# Orbital Traffic

一个以真实全球航线为视觉主体的短篇 WebGL 感官体验。

- 单指 / 鼠标拖动：自由旋转地球
- 双指张合 / 滚轮：缩放
- 双指静止按住：冻结空域；松手释放航班潮汐
- `?baseline=1`：加载 jeantimex 原版完整数据、纹理与调试界面

## 开发

```bash
npm install
npm run dev
npm run build
```

原作与 MIT 许可信息见 `upstream/ATTRIBUTION.md`。产品实现过程见 `doc/requirements.md`、`doc/visual.md` 与 `doc/technical.md`。
